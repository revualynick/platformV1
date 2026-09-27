import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { getTenantDb, conversations, conversationMessages, inboundMessages, opsHeartbeats, users } from "@revualy/db";
import { computeOpsStatus, recordHeartbeat } from "../lib/ops-status.js";
import { runOpsAlerts } from "../lib/ops-alerts.js";
import { buildApp } from "../server.js";

/**
 * Ops status and alerts (C3 step 8) against a real Postgres: stuck work
 * shows as failures, job heartbeats age, alerts are sent once, and the
 * endpoint is internal-or-super-admin only. Self-skips without a DB.
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
const SECRET = process.env.INTERNAL_API_SECRET!;
const MIN = 60_000;

describe.skipIf(!dbUp)("ops status and alerts (integration)", () => {
  const ids = { person: crypto.randomUUID(), subject: crypto.randomUUID(), sa: crypto.randomUUID(), admin: crypto.randomUUID() };
  const tag = ids.person.slice(0, 8);
  let app: FastifyInstance;
  let convId: string;
  let inboundId: string;
  let savedBeats: Array<typeof opsHeartbeats.$inferSelect> = [];

  beforeAll(async () => {
    await db.insert(users).values([
      { id: ids.person, email: `p-${tag}@test.local`, name: "Rae" },
      { id: ids.subject, email: `s-${tag}@test.local`, name: "Sam" },
      { id: ids.sa, email: `sa-${tag}@test.local`, name: "Sue", role: "super_admin" },
      { id: ids.admin, email: `a-${tag}@test.local`, name: "Ada", role: "admin" },
    ]);
    savedBeats = await db.select().from(opsHeartbeats);
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    if (inboundId) await db.delete(inboundMessages).where(eq(inboundMessages.id, inboundId));
    await db.delete(conversations).where(eq(conversations.reviewerId, ids.person));
    await db.delete(users).where(inArray(users.id, Object.values(ids)));
    await db.delete(opsHeartbeats);
    if (savedBeats.length) await db.insert(opsHeartbeats).values(savedBeats);
  });

  const find = async (name: string, now = new Date()) => (await computeOpsStatus(db, { now })).checks.find((c) => c.name === name)!;

  it("a stuck incoming message, an undelivered reply and an unanswered person each fail", async () => {
    const old = new Date(Date.now() - 20 * MIN);
    const [conv] = await db
      .insert(conversations)
      .values({
        reviewerId: ids.person,
        subjectId: ids.subject,
        interactionType: "peer_review",
        platform: "internal",
        platformChannelId: `ops-${tag}`,
        status: "in_progress",
        scheduledAt: old,
        lastActivityAt: old,
      })
      .returning({ id: conversations.id });
    convId = conv.id;
    await db.insert(conversationMessages).values([
      { conversationId: convId, role: "assistant", content: "How has Sam been?", createdAt: old },
      { conversationId: convId, role: "user", content: "Fine", createdAt: old },
    ]);
    const [inb] = await db
      .insert(inboundMessages)
      .values({ platform: "internal", platformMessageId: `ops-${tag}`, platformUserId: `u-${tag}`, platformChannelId: `ops-${tag}`, content: "hi", receivedAt: old })
      .returning({ id: inboundMessages.id });
    inboundId = inb.id;

    const status = await computeOpsStatus(db);
    const by = Object.fromEntries(status.checks.map((c) => [c.name, c]));
    expect(by.inbound_stuck.status).toBe("fail");
    expect(by.undelivered.status).toBe("fail");
    expect(by.unanswered.status).toBe("fail");
    expect(status.status).toBe("fail");
    // Counts only: nothing anyone wrote.
    expect(JSON.stringify(status)).not.toMatch(/How has Sam been|Fine|hi"/);
  });

  it("job heartbeats age: ok, then warn, then fail; a job that hasn't had its chance isn't late", async () => {
    await db.delete(opsHeartbeats);
    const now = new Date();
    expect((await computeOpsStatus(db, { now, bootedAt: new Date(now.getTime() - 2 * MIN) })).checks.find((c) => c.name === "job_sweep")!.status).toBe("ok");
    expect((await find("job_sweep", now)).status).toBe("warn");

    await recordHeartbeat(db, "sweep", true, undefined, new Date(now.getTime() - 5 * MIN));
    expect((await find("job_sweep", now)).status).toBe("ok");
    expect((await find("job_sweep", new Date(now.getTime() + 15 * MIN))).status).toBe("warn");
    expect((await find("job_sweep", new Date(now.getTime() + 40 * MIN))).status).toBe("fail");

    await recordHeartbeat(db, "sweep", false, "TypeError", now);
    expect((await find("job_sweep", new Date(now.getTime() + 40 * MIN))).detail).toContain("TypeError");
  });

  it("alerts are sent once for a new problem, and remembered", async () => {
    const sent: Array<{ subject: string; text: string }> = [];
    const send = async (subject: string, text: string) => void sent.push({ subject, text });
    await db.delete(opsHeartbeats);
    const first = await runOpsAlerts(db, send);
    expect(first.raised.map((c) => c.name)).toEqual(expect.arrayContaining(["inbound_stuck", "undelivered", "unanswered"]));
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toMatch(/^\[Revualy FAIL\]/);
    expect(sent[0].text).not.toMatch(/How has Sam been|Fine/);

    const again = await runOpsAlerts(db, send);
    expect(again.raised.filter((c) => c.status === "fail")).toHaveLength(0);
  });

  it("the endpoint: internal calls and super admins only; 503 while failing", async () => {
    const internal = await app.inject({ method: "GET", url: "/api/v1/ops/status", headers: { "x-internal-secret": SECRET } });
    expect(internal.statusCode).toBe(503);
    expect(internal.json().status).toBe("fail");
    const sa = await app.inject({ method: "GET", url: "/api/v1/ops/status", headers: { "x-internal-secret": SECRET, "x-user-id": ids.sa } });
    expect(sa.statusCode).toBe(503);
    const admin = await app.inject({ method: "GET", url: "/api/v1/ops/status", headers: { "x-internal-secret": SECRET, "x-user-id": ids.admin } });
    expect(admin.statusCode).toBe(403);
    const none = await app.inject({ method: "GET", url: "/api/v1/ops/status" });
    expect(none.statusCode).toBe(401);
  });
});
