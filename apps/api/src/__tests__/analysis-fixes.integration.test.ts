import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import type { Queue } from "bullmq";
import type { FastifyInstance } from "fastify";
import {
  getTenantDb,
  users,
  conversations,
  conversationMessages,
  feedbackEntries,
  escalations,
  selfReflections,
  engagementScores,
} from "@revualy/db";
import { runAnalysisPipeline } from "../lib/analysis-pipeline.js";
import { createMockLLM, createFailingMockLLM } from "../lib/__tests__/test-utils.js";

import { buildApp } from "../server.js";

const quietLogger = { error: () => {}, warn: () => {}, info: () => {} };

/**
 * Review fixes B2, B4 and B10 against a real Postgres. Self-skips without a DB.
 */

const db = getTenantDb(process.env.ORG_ID!, process.env.DATABASE_URL!);
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

describe.skipIf(!dbUp)("analysis pipeline fixes (integration)", () => {
  const ids = { manager: crypto.randomUUID(), subject: crypto.randomUUID(), reviewer: crypto.randomUUID() };
  const tag = ids.manager.slice(0, 8);
  const FLAGGED = "He shouted at me in front of the whole team";

  async function conversation(interactionType: string, reviewerId: string, subjectId: string, texts: string[]) {
    const [c] = await db
      .insert(conversations)
      .values({ reviewerId, subjectId, interactionType, platform: "internal", platformChannelId: "t", scheduledAt: new Date(), status: "closed" })
      .returning({ id: conversations.id });
    await db.insert(conversationMessages).values(texts.map((content) => ({ conversationId: c.id, role: "user", content })));
    return c.id;
  }

  beforeAll(async () => {
    await db.insert(users).values([
      { id: ids.manager, email: `mgr-${tag}@test.local`, name: "Mia Manager", role: "manager" },
      { id: ids.subject, email: `sub-${tag}@test.local`, name: "Sam", managerId: ids.manager },
      { id: ids.reviewer, email: `rev-${tag}@test.local`, name: "Rae" },
    ]);
  });

  afterAll(async () => {
    const all = Object.values(ids);
    const convs = await db.select({ id: conversations.id }).from(conversations).where(inArray(conversations.reviewerId, all));
    const entries = convs.length
      ? await db.select({ id: feedbackEntries.id }).from(feedbackEntries).where(inArray(feedbackEntries.conversationId, convs.map((c) => c.id)))
      : [];
    if (entries.length) await db.delete(escalations).where(inArray(escalations.feedbackEntryId, entries.map((e) => e.id)));
    await db.delete(escalations).where(inArray(escalations.subjectId, all));
    await db.delete(selfReflections).where(inArray(selfReflections.userId, all));
    await db.delete(engagementScores).where(inArray(engagementScores.userId, all));
    if (convs.length) {
      await db.delete(feedbackEntries).where(inArray(feedbackEntries.conversationId, convs.map((c) => c.id)));
      await db.delete(conversations).where(inArray(conversations.id, convs.map((c) => c.id)));
    }
    await db.delete(users).where(inArray(users.id, all));
  });

  it("B2: a flag alert job carries only ids, never the flagged text", async () => {
    const convId = await conversation("peer_review", ids.reviewer, ids.subject, [FLAGGED]);
    const llm = createMockLLM(
      new Map([
        [
          "problematic language",
          JSON.stringify({ shouldFlag: true, severity: "critical", reason: "Hostile behaviour", flaggedContent: FLAGGED }),
        ],
      ]),
    );
    const queued: Array<{ name: string; data: unknown }> = [];
    const queue = { add: async (name: string, data: unknown) => queued.push({ name, data }) } as unknown as Queue;

    await runAnalysisPipeline(db, llm, convId, quietLogger, process.env.ORG_ID, undefined, queue);

    const alert = queued.find((q) => q.name === "flag_alert");
    expect(alert).toBeDefined();
    expect(Object.keys(alert!.data as object).sort()).toEqual(["escalationId", "orgId", "type"]);
    expect(JSON.stringify(alert!.data)).not.toContain("shouted");
    expect(JSON.stringify(alert!.data)).not.toContain("Hostile");

    // The content the worker will read is in Postgres, encrypted.
    const { escalationId } = alert!.data as { escalationId: string };
    const raw = (await db.execute(
      sql`select flagged_content from escalations where id = ${escalationId}`,
    )) as unknown as Array<{ flagged_content: string }>;
    expect(raw[0].flagged_content.startsWith("enc:v1:")).toBe(true);
  });

  it("B4: an LLM outage during reflection analysis throws so the job is retried", async () => {
    const convId = await conversation("self_reflection", ids.reviewer, ids.reviewer, ["A busy week"]);
    await expect(
      runAnalysisPipeline(db, createFailingMockLLM(new Set(["fast"])), convId, quietLogger, process.env.ORG_ID),
    ).rejects.toThrow(/Mock LLM failure/);
  });

  describe("B10: the person's own reflection answers are never overwritten", () => {
    let app: FastifyInstance;
    beforeAll(async () => {
      app = await buildApp();
      await app.ready();
    });
    afterAll(async () => {
      await app?.close();
    });

    const reflectionLLM = () =>
      createMockLLM(
        new Map([
          [
            "self-reflection conversation",
            JSON.stringify({ mood: "optimistic", highlights: "AI summary", challenges: "", goalForNextWeek: "", engagementScore: 70 }),
          ],
        ]),
      );

    it("pipeline after the person completed: keeps their mood and notes", async () => {
      const convId = await conversation("self_reflection", ids.subject, ids.subject, ["Tough week"]);
      const [c] = await db.select({ createdAt: conversations.createdAt }).from(conversations).where(eq(conversations.id, convId));
      const d = new Date(Date.UTC(c.createdAt.getUTCFullYear(), c.createdAt.getUTCMonth(), c.createdAt.getUTCDate()));
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      const week = d.toISOString().slice(0, 10);
      await db.insert(selfReflections).values({
        userId: ids.subject,
        weekStarting: week,
        status: "completed",
        mood: "stressed",
        highlights: "My own words",
        completedAt: new Date(),
      });

      await runAnalysisPipeline(db, reflectionLLM(), convId, quietLogger, process.env.ORG_ID);

      const [row] = await db.select().from(selfReflections).where(eq(selfReflections.userId, ids.subject));
      expect(row).toMatchObject({ mood: "stressed", highlights: "My own words", conversationId: convId, engagementScore: 70 });
    });

    it("/complete after the pipeline: the person's answers override, no 409", async () => {
      const convId = await conversation("self_reflection", ids.reviewer, ids.reviewer, ["Good week"]);
      await runAnalysisPipeline(db, reflectionLLM(), convId, quietLogger, process.env.ORG_ID);
      const [row] = await db.select().from(selfReflections).where(eq(selfReflections.userId, ids.reviewer));
      expect(row).toMatchObject({ status: "completed", mood: "optimistic", highlights: "AI summary" });

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/reflections/${row.id}/complete`,
        headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET!, "x-user-id": ids.reviewer },
        payload: { mood: "tired", highlights: "Actually quite draining" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ mood: "tired", highlights: "Actually quite draining", engagementScore: 70 });
    });
  });
});
