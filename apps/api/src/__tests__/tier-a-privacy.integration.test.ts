import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Queue } from "bullmq";
import {
  getTenantDb,
  auditLog,
  behavioralSignals,
  conversations,
  conversationMessages,
  engagementScores,
  feedbackEntries,
  inboundMessages,
  users,
} from "@revualy/db";
import { getFeedbackForSubject } from "@revualy/db/queries";
import { RELEASE_EPOCH, RELEASE_PERIOD_DAYS } from "@revualy/shared";
import type { LLMGateway } from "@revualy/ai-core";
import { AdapterRegistry } from "@revualy/chat-core";
import { buildApp } from "../server.js";
import { tenantReviewerRef, tenantOrgId, pseudonymSecret } from "../lib/pseudonym.js";
import { appendAudit, verifyAuditChain } from "../lib/audit-log.js";
import { runSweep, DELIVERY_RETENTION_DAYS } from "../lib/conversation-sweeper.js";
import { runAnalysisPipeline } from "../lib/analysis-pipeline.js";

/**
 * Privacy step 2 (tier A) against a real Postgres: pseudonymous storage,
 * release batches, the append-only hash-chained audit log, the
 * re-identification route and transcript retention. Self-skips without a DB.
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
const DAY = 24 * 60 * 60 * 1000;
const quiet = { error: () => {}, warn: () => {}, info: () => {} };

describe.skipIf(!dbUp)("tier A privacy (integration)", () => {
  const ids = {
    superAdmin: crypto.randomUUID(),
    admin: crypto.randomUUID(),
    subject: crypto.randomUUID(),
    r1: crypto.randomUUID(),
    r2: crypto.randomUUID(),
    r3: crypto.randomUUID(),
  };
  const all = Object.values(ids);
  const tag = ids.subject.slice(0, 8);
  const as = (userId: string) => ({ "x-internal-secret": process.env.INTERNAL_API_SECRET!, "x-user-id": userId });
  let app: FastifyInstance;

  async function conversation(reviewerId: string, closedAt: Date, text = "Sam is thorough and clear.") {
    const [c] = await db
      .insert(conversations)
      .values({
        reviewerId,
        subjectId: ids.subject,
        interactionType: "peer_review",
        platform: "internal",
        platformChannelId: `t-${tag}`,
        status: "closed",
        scheduledAt: closedAt,
        closedAt,
        lastActivityAt: closedAt,
      })
      .returning({ id: conversations.id });
    await db.insert(conversationMessages).values({ conversationId: c.id, role: "user", content: text });
    return c.id;
  }

  async function entry(reviewerId: string, createdAt: Date, conversationId: string | null = null) {
    const [e] = await db
      .insert(feedbackEntries)
      .values({
        conversationId,
        reviewerRef: tenantReviewerRef(reviewerId),
        subjectId: ids.subject,
        interactionType: "peer_review",
        rawContent: `raw words ${tag}`,
        aiSummary: "Sam is thorough. On the Acme call on Tuesday she was clear.",
        createdAt,
      })
      .returning({ id: feedbackEntries.id });
    return e.id;
  }

  beforeAll(async () => {
    await db.insert(users).values([
      { id: ids.superAdmin, email: `sa-${tag}@test.local`, name: "Super", role: "super_admin" },
      { id: ids.admin, email: `ad-${tag}@test.local`, name: "Admin", role: "admin" },
      { id: ids.subject, email: `s-${tag}@test.local`, name: "Sam" },
      { id: ids.r1, email: `r1-${tag}@test.local`, name: "Priya" },
      { id: ids.r2, email: `r2-${tag}@test.local`, name: "Jon" },
      { id: ids.r3, email: `r3-${tag}@test.local`, name: "Kim" },
    ]);
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    const convs = (await db.select({ id: conversations.id }).from(conversations).where(inArray(conversations.reviewerId, all))).map((c) => c.id);
    await db.delete(feedbackEntries).where(eq(feedbackEntries.subjectId, ids.subject));
    if (convs.length) {
      await db.delete(behavioralSignals).where(inArray(behavioralSignals.sourceId, convs));
      await db.delete(inboundMessages).where(inArray(inboundMessages.conversationId, convs));
      await db.delete(conversations).where(inArray(conversations.id, convs));
    }
    await db.delete(engagementScores).where(inArray(engagementScores.userId, all));
    await db.delete(users).where(inArray(users.id, all));
    // audit_log rows stay: the table refuses deletes, by design.
  });

  // ── Storage ────────────────────────────────────────────

  it("no tier A table has a reviewer or author id column", async () => {
    const cols = (await db.execute(sql`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('feedback_entries', 'three_sixty_responses', 'imported_feedback')
    `)) as unknown as Array<{ table_name: string; column_name: string }>;
    const names = cols.map((c) => `${c.table_name}.${c.column_name}`);
    expect(names).toContain("feedback_entries.reviewer_ref");
    expect(names).toContain("three_sixty_responses.reviewer_ref");
    expect(names).toContain("imported_feedback.author_ref");
    expect(names.filter((n) => /\.(reviewer_id|author_id)$/.test(n))).toEqual([]);
  });

  it("no stored reference is a plain user id, and no signal points at a feedback entry", async () => {
    const leaks = (await db.execute(sql`
      SELECT 'feedback_entries' AS t, count(*)::int AS n FROM feedback_entries f JOIN users u ON f.reviewer_ref = u.id::text
      UNION ALL SELECT 'three_sixty_responses', count(*)::int FROM three_sixty_responses r JOIN users u ON r.reviewer_ref = u.id::text
      UNION ALL SELECT 'imported_feedback', count(*)::int FROM imported_feedback i JOIN users u ON i.author_ref = u.id::text
      UNION ALL SELECT 'behavioral_signals', count(*)::int FROM behavioral_signals s JOIN feedback_entries f ON s.source_id = f.id
    `)) as unknown as Array<{ t: string; n: number }>;
    expect(leaks.filter((l) => l.n > 0)).toEqual([]);
  });

  it("the migration's SQL pseudonym matches reviewerRef (existing rows convert to the same value)", async () => {
    const userId = ids.r1;
    const [row] = (await db.execute(sql`
      SELECT encode(hmac(convert_to(${tenantOrgId()} || ':' || lower(${userId}), 'UTF8'), convert_to(${pseudonymSecret()}, 'UTF8'), 'sha256'), 'hex') AS ref
    `)) as unknown as Array<{ ref: string }>;
    expect(row.ref).toBe(tenantReviewerRef(userId));
  });

  it("analysis writes the feedback under the reviewer's pseudonym", async () => {
    const convId = await conversation(ids.r1, new Date());
    const llm = {
      complete: async () => ({ content: "{}", usage: { inputTokens: 1, outputTokens: 1 }, model: "m", latencyMs: 1 }),
    } as unknown as LLMGateway;
    await runAnalysisPipeline(db, llm, convId, quiet, process.env.ORG_ID);
    const [row] = await db.select().from(feedbackEntries).where(eq(feedbackEntries.conversationId, convId));
    expect(row.reviewerRef).toBe(tenantReviewerRef(ids.r1));
    expect(JSON.stringify(row)).not.toContain(ids.r1);
    await db.delete(feedbackEntries).where(eq(feedbackEntries.id, row.id));
  });

  // ── Aggregation and lag ────────────────────────────────

  it("below-threshold themes are not released; three reviewers release at the boundary", async () => {
    // A past fortnight, well clear of now.
    const period = RELEASE_PERIOD_DAYS * DAY;
    const start = RELEASE_EPOCH + Math.floor((Date.now() - RELEASE_EPOCH) / period - 3) * period;
    const inWindow = (d: number) => new Date(start + d * DAY);
    const boundary = new Date(start + period);

    const e1 = await entry(ids.r1, inWindow(1));
    await entry(ids.r1, inWindow(2)); // same reviewer twice counts once
    await entry(ids.r2, inWindow(3));
    expect(await getFeedbackForSubject(db, ids.subject)).toEqual([]);

    const res = await app.inject({ method: "GET", url: `/api/v1/users/${ids.subject}/feedback`, headers: as(ids.subject) });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);

    await entry(ids.r3, inWindow(4));
    const released = await getFeedbackForSubject(db, ids.subject);
    expect(released).toHaveLength(4);
    expect(released.every((r) => r.releasedAt.getTime() === boundary.getTime())).toBe(true);
    const first = released.find((r) => r.id === e1)!;
    expect(first.aiSummary).toMatch(/thorough/);
    expect(first.aiSummary).not.toMatch(/acme|tuesday/i);
    const shown = JSON.stringify(released);
    expect(shown).not.toContain(`raw words ${tag}`);
    expect(shown).not.toContain(tenantReviewerRef(ids.r1));
    expect(shown).not.toContain("createdAt");
  });

  // ── Export ─────────────────────────────────────────────

  it("/export/feedback is blind by default and never names a reviewer", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/export/feedback", headers: as(ids.admin) });
    expect(res.statusCode).toBe(200);
    const rows = (res.json().data as Array<Record<string, string>>).filter((r) => r.aiSummary?.includes("Sam is thorough"));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.reviewer).toMatch(/^Reviewer [0-9a-f]{8}$/);
      expect(r.rawContent).toBeUndefined();
      expect(r.subject).not.toBe("Sam");
    }
    const named = await app.inject({ method: "GET", url: "/api/v1/export/feedback?blind=false", headers: as(ids.admin) });
    const text = named.body;
    for (const name of ["Priya", "Jon", "Kim"]) expect(text).not.toContain(name);
  });

  // ── Audit log ──────────────────────────────────────────

  it("the audit log refuses UPDATE, DELETE and TRUNCATE", async () => {
    await appendAudit(db, { actorId: ids.admin, action: "test.append", outcome: "ok", target: tag });
    await expect(db.execute(sql`UPDATE audit_log SET outcome = 'x' WHERE target = ${tag}`)).rejects.toThrow(/append-only/);
    await expect(db.execute(sql`DELETE FROM audit_log WHERE target = ${tag}`)).rejects.toThrow(/append-only/);
    await expect(db.execute(sql`TRUNCATE audit_log`)).rejects.toThrow(/append-only/);
  });

  it("the audit chain verifies, and detects an altered or deleted row", async () => {
    for (let i = 0; i < 3; i++) await appendAudit(db, { actorId: ids.admin, action: "test.chain", outcome: `ok-${i}`, target: tag, details: { i, b: 1, a: 2 } });
    const clean = await verifyAuditChain(db);
    expect(clean).toMatchObject({ ok: true, brokenAt: null });

    const [mid] = await db
      .select({ seq: auditLog.seq })
      .from(auditLog)
      .where(and(eq(auditLog.target, tag), eq(auditLog.outcome, "ok-1")))
      .orderBy(desc(auditLog.seq))
      .limit(1);

    // Tampering needs the triggers bypassed (a superuser setting), inside a
    // transaction that is rolled back so the real log is untouched.
    const rollback = new Error("rollback");
    const tamper = async (statement: ReturnType<typeof sql>) => {
      let seen: Awaited<ReturnType<typeof verifyAuditChain>> | null = null;
      await db
        .transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL session_replication_role = replica`);
          await tx.execute(statement);
          seen = await verifyAuditChain(tx);
          throw rollback;
        })
        .catch((err) => {
          if (err !== rollback) throw err;
        });
      return seen!;
    };

    const altered = await tamper(sql`UPDATE audit_log SET reason = 'edited' WHERE seq = ${mid.seq}`);
    expect(altered).toMatchObject({ ok: false, brokenAt: mid.seq, problem: "row_hash" });

    const deleted = await tamper(sql`DELETE FROM audit_log WHERE seq = ${mid.seq}`);
    expect(deleted).toMatchObject({ ok: false, brokenAt: mid.seq, problem: "gap" });

    const relinked = await tamper(sql`UPDATE audit_log SET prev_hash = repeat('0', 64) WHERE seq = ${mid.seq}`);
    expect(relinked).toMatchObject({ ok: false, brokenAt: mid.seq });

    expect(await verifyAuditChain(db)).toMatchObject({ ok: true });
  });

  // ── Re-identification ──────────────────────────────────

  const reason = "Formal conduct investigation, case HR-2026-014, approved by legal.";

  it("re-identification refuses non-super-admins, and records the attempt", async () => {
    const ref = tenantReviewerRef(ids.r2);
    for (const caller of [ids.admin, ids.subject]) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/privacy/reidentify",
        headers: as(caller),
        payload: { reviewerRef: ref, reason },
      });
      expect(res.statusCode).toBe(403);
      expect(res.body).not.toContain("Jon");
    }
    const denied = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.target, ref), eq(auditLog.outcome, "denied")));
    expect(denied.map((d) => d.actorId).sort()).toEqual([ids.admin, ids.subject].sort());
  });

  it("re-identification needs a reason, returns the user to a super admin and audits it without content", async () => {
    const ref = tenantReviewerRef(ids.r2);
    const noReason = await app.inject({
      method: "POST",
      url: "/api/v1/admin/privacy/reidentify",
      headers: as(ids.superAdmin),
      payload: { reviewerRef: ref, reason: "because" },
    });
    expect(noReason.statusCode).toBe(400);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/privacy/reidentify",
      headers: as(ids.superAdmin),
      payload: { reviewerRef: ref, reason },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ userId: ids.r2, name: "Jon" });

    const [logged] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.target, ref), eq(auditLog.outcome, "found")))
      .orderBy(desc(auditLog.seq))
      .limit(1);
    expect(logged).toMatchObject({ actorId: ids.superAdmin, action: "reviewer.reidentify", reason });
    expect(JSON.stringify(logged)).not.toMatch(/raw words|thorough/);

    const unknown = await app.inject({
      method: "POST",
      url: "/api/v1/admin/privacy/reidentify",
      headers: as(ids.superAdmin),
      payload: { reviewerRef: "f".repeat(64), reason },
    });
    expect(unknown.statusCode).toBe(404);
    expect(await verifyAuditChain(db)).toMatchObject({ ok: true });
  });

  // ── Retention ──────────────────────────────────────────

  it("the sweeper deletes an analysed peer transcript after the retention window, keeping the feedback", async () => {
    const old = new Date(Date.now() - (DELIVERY_RETENTION_DAYS + 1) * DAY);
    const oldConv = await conversation(ids.r3, old);
    const oldEntry = await entry(ids.r3, old, oldConv);
    await db.insert(inboundMessages).values({
      platform: "internal",
      platformMessageId: `m-${tag}`,
      platformUserId: `u-${tag}`,
      platformChannelId: `t-${tag}`,
      content: "Sam is thorough and clear.",
      status: "processed",
      outcome: "conversation_reply",
      userId: ids.r3,
      conversationId: oldConv,
    });
    const recentConv = await conversation(ids.r3, new Date(Date.now() - 2 * DAY));
    await entry(ids.r3, new Date(), recentConv);

    const noQueue = { add: async () => undefined } as unknown as Queue;
    const result = await runSweep(
      db,
      { llm: {} as LLMGateway, adapters: new AdapterRegistry(), analysisQueue: noQueue, conversationQueue: noQueue },
      new Date(),
      quiet,
    );
    expect(result.conversationsPurged).toBeGreaterThanOrEqual(1);

    expect(await db.select().from(conversations).where(eq(conversations.id, oldConv))).toEqual([]);
    expect(await db.select().from(conversationMessages).where(eq(conversationMessages.conversationId, oldConv))).toEqual([]);
    expect(await db.select().from(inboundMessages).where(eq(inboundMessages.platformMessageId, `m-${tag}`))).toEqual([]);
    const [kept] = await db.select().from(feedbackEntries).where(eq(feedbackEntries.id, oldEntry));
    expect(kept).toMatchObject({ conversationId: null, reviewerRef: tenantReviewerRef(ids.r3) });

    expect(await db.select().from(conversations).where(eq(conversations.id, recentConv))).toHaveLength(1);
  });
});
