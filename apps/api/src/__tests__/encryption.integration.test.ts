import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import {
  getTenantDb,
  users,
  conversations,
  conversationMessages,
  managerNotes,
  selfReflections,
} from "@revualy/db";

/**
 * Encryption at rest against a real Postgres: what the database actually
 * stores versus what Drizzle returns. Self-skips without a database.
 */

const DB_URL = process.env.DATABASE_URL!;
const db = getTenantDb(process.env.ORG_ID!, DB_URL);

async function dbReachable(): Promise<boolean> {
  const timeout = new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 3000));
  try {
    await Promise.race([db.execute(sql`select 1`), timeout]);
    return true;
  } catch {
    return false;
  }
}

const dbUp = await dbReachable();

describe.skipIf(!dbUp)("encryption at rest (integration)", () => {
  const tag = crypto.randomUUID().slice(0, 8);
  const managerId = crypto.randomUUID();
  const employeeId = crypto.randomUUID();
  let conversationId: string;

  async function rawText(query: ReturnType<typeof sql>): Promise<string> {
    const rows = (await db.execute(query)) as unknown as Array<{ v: string }>;
    return rows[0].v;
  }

  beforeAll(async () => {
    await db.insert(users).values([
      { id: managerId, email: `enc-mgr-${tag}@test.local`, name: "Manager", role: "manager" },
      { id: employeeId, email: `enc-emp-${tag}@test.local`, name: "Employee", role: "employee" },
    ]);
    const [c] = await db
      .insert(conversations)
      .values({
        reviewerId: employeeId,
        subjectId: managerId,
        interactionType: "peer_review",
        platform: "internal",
        platformChannelId: "test",
        scheduledAt: new Date(),
      })
      .returning({ id: conversations.id });
    conversationId = c.id;
  });

  afterAll(async () => {
    const ids = [managerId, employeeId];
    await db.delete(conversations).where(inArray(conversations.reviewerId, ids));
    await db.delete(managerNotes).where(inArray(managerNotes.managerId, ids));
    await db.delete(selfReflections).where(inArray(selfReflections.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  });

  it("stores ciphertext and returns plaintext through Drizzle", async () => {
    const [msg] = await db
      .insert(conversationMessages)
      .values({ conversationId, role: "user", content: "Sam was brilliant on the launch" })
      .returning();
    expect(msg.content).toBe("Sam was brilliant on the launch");

    const stored = await rawText(sql`select content as v from conversation_messages where id = ${msg.id}`);
    expect(stored.startsWith("enc:v1:k1:")).toBe(true);
    expect(stored).not.toContain("Sam");

    const [read] = await db.select().from(conversationMessages).where(eq(conversationMessages.id, msg.id));
    expect(read.content).toBe("Sam was brilliant on the launch");
  });

  it("encrypts values written by UPDATE and by upsert (onConflictDoUpdate)", async () => {
    const [note] = await db
      .insert(managerNotes)
      .values({ managerId, subjectId: employeeId, content: "first" })
      .returning();
    await db.update(managerNotes).set({ content: "updated note" }).where(eq(managerNotes.id, note.id));
    expect(await rawText(sql`select content as v from manager_notes where id = ${note.id}`)).toMatch(/^enc:v1:/);

    const week = "2026-09-21";
    await db.insert(selfReflections).values({ userId: employeeId, weekStarting: week, highlights: "draft" });
    await db
      .insert(selfReflections)
      .values({ userId: employeeId, weekStarting: week, highlights: "final highlights" })
      .onConflictDoUpdate({
        target: [selfReflections.userId, selfReflections.weekStarting],
        set: { highlights: "final highlights" },
      });
    const raw = await rawText(
      sql`select highlights as v from self_reflections where user_id = ${employeeId} and week_starting = ${week}`,
    );
    expect(raw).toMatch(/^enc:v1:/);
    const [r] = await db.select().from(selfReflections).where(eq(selfReflections.userId, employeeId));
    expect(r.highlights).toBe("final highlights");
  });

  it("reads legacy plaintext rows unchanged (before the backfill)", async () => {
    await db.execute(
      sql`insert into manager_notes (manager_id, subject_id, content) values (${managerId}, ${employeeId}, 'legacy plaintext note')`,
    );
    const rows = await db.select().from(managerNotes).where(eq(managerNotes.managerId, managerId));
    expect(rows.map((r) => r.content)).toContain("legacy plaintext note");
  });

  it("refuses ciphertext copied from another column", async () => {
    const [msg] = await db
      .insert(conversationMessages)
      .values({ conversationId, role: "user", content: "moved secret" })
      .returning({ id: conversationMessages.id });
    const [note] = await db
      .insert(managerNotes)
      .values({ managerId, subjectId: employeeId, content: "placeholder" })
      .returning({ id: managerNotes.id });
    await db.execute(
      sql`update manager_notes set content = (select content from conversation_messages where id = ${msg.id}) where id = ${note.id}`,
    );
    await expect(db.select().from(managerNotes).where(eq(managerNotes.id, note.id))).rejects.toThrow();
  });
});
