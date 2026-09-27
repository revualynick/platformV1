import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Queue } from "bullmq";
import { getTenantDb, auditLog, conversations, conversationMessages, inboundMessages, users } from "@revualy/db";
import { buildApp } from "../server.js";
import { setConversationAdminQueue } from "../modules/conversation/routes.js";
import { runSweep, DELIVERY_RETENTION_DAYS } from "../lib/conversation-sweeper.js";
import { detectOneOnOne } from "../lib/check-in-pipeline.js";
import { AdapterRegistry } from "@revualy/chat-core";
import type { LLMGateway } from "@revualy/ai-core";

/**
 * Beta gate review, second pass (2026-09-28): admin views are state only,
 * exports follow the content rule, retention covers messages that never
 * joined a conversation, and a report's own calendar can't invert a 1:1.
 */

const SECRET = process.env.INTERNAL_API_SECRET!;
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
const DAY = 86_400_000;
const quiet = { error: () => {}, warn: () => {}, info: () => {} };

describe.skipIf(!dbUp)("review fixes, second pass (integration)", () => {
  const ids = { manager: crypto.randomUUID(), report: crypto.randomUUID(), admin: crypto.randomUUID() };
  const tag = ids.report.slice(0, 8);
  const as = (userId: string) => ({ "x-internal-secret": SECRET, "x-user-id": userId });
  let app: FastifyInstance;
  let convId: string;

  beforeAll(async () => {
    await db.insert(users).values([
      { id: ids.manager, email: `m-${tag}@test.local`, name: "Jo", role: "manager" },
      { id: ids.admin, email: `a-${tag}@test.local`, name: "Ada", role: "admin" },
    ]);
    await db.insert(users).values({ id: ids.report, email: `r-${tag}@test.local`, name: "Sam", managerId: ids.manager });
    const [c] = await db
      .insert(conversations)
      .values({ reviewerId: ids.report, subjectId: ids.manager, interactionType: "peer_review", platform: "internal", platformChannelId: `rf-${tag}`, status: "in_progress", scheduledAt: new Date() })
      .returning({ id: conversations.id });
    convId = c.id;
    await db.insert(conversationMessages).values({ conversationId: convId, role: "user", content: `private words ${tag}` });
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await db.delete(conversations).where(eq(conversations.reviewerId, ids.report));
    await db.delete(users).where(eq(users.id, ids.report));
    await db.delete(users).where(inArray(users.id, [ids.manager, ids.admin]));
  });

  it("admin conversation views show state only: no transcript, no reviewer or subject", async () => {
    const one = await app.inject({ method: "GET", url: `/api/v1/conversations/${convId}`, headers: as(ids.admin) });
    expect(one.statusCode).toBe(200);
    const body = JSON.stringify(one.json());
    expect(body).not.toContain(`private words ${tag}`);
    expect(body).not.toContain(ids.report);
    expect(body).not.toContain(ids.manager);
    const list = await app.inject({ method: "GET", url: "/api/v1/conversations?limit=200", headers: as(ids.admin) });
    expect(JSON.stringify(list.json())).not.toContain(ids.report);
  });

  it("force-close ends the conversation through the engine, once", async () => {
    const queued: string[] = [];
    setConversationAdminQueue({ add: async (_n: string, d: { conversationId: string }) => void queued.push(d.conversationId) } as unknown as Queue);
    const res = await app.inject({ method: "POST", url: `/api/v1/conversations/${convId}/close`, headers: as(ids.admin) });
    expect(res.statusCode).toBe(200);
    const [c] = await db.select({ status: conversations.status, turn: conversations.turn }).from(conversations).where(eq(conversations.id, convId));
    expect(c.status).toBe("incomplete");
    expect(c.turn).toBeGreaterThan(0);
    // Analysed as partial, like a quiet one.
    expect(queued).toContain(convId);
    const again = await app.inject({ method: "POST", url: `/api/v1/conversations/${convId}/close`, headers: as(ids.admin) });
    expect(again.statusCode).toBe(409);
  });

  it("a person's feedback export follows the content rule: an admin without a grant is refused", async () => {
    const admin = await app.inject({ method: "GET", url: `/api/v1/users/${ids.report}/export`, headers: as(ids.admin) });
    expect(admin.statusCode).toBe(403);
    const manager = await app.inject({ method: "GET", url: `/api/v1/users/${ids.report}/export`, headers: as(ids.manager) });
    expect(manager.statusCode).toBe(200);
    const self = await app.inject({ method: "GET", url: `/api/v1/users/${ids.report}/export`, headers: as(ids.report) });
    expect(self.statusCode).toBe(200);
  });

  it("retention purges incoming messages that never joined a conversation", async () => {
    const [old] = await db
      .insert(inboundMessages)
      .values({ platform: "internal", platformMessageId: `old-${tag}`, platformUserId: `u-${tag}`, platformChannelId: `rf-${tag}`, content: "after the window", status: "processed", outcome: "no_open_conversation", processedAt: new Date(), receivedAt: new Date(Date.now() - (DELIVERY_RETENTION_DAYS + 1) * DAY) })
      .returning({ id: inboundMessages.id });
    const [fresh] = await db
      .insert(inboundMessages)
      .values({ platform: "internal", platformMessageId: `new-${tag}`, platformUserId: `u-${tag}`, platformChannelId: `rf-${tag}`, content: "recent", status: "processed", outcome: "no_open_conversation", processedAt: new Date() })
      .returning({ id: inboundMessages.id });
    const queue = { add: async () => {} } as unknown as Queue;
    const result = await runSweep(db, { llm: {} as LLMGateway, adapters: new AdapterRegistry(), analysisQueue: queue, conversationQueue: queue }, new Date(), quiet);
    expect(result.inboundPurged).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(inboundMessages).where(eq(inboundMessages.id, old.id))).toHaveLength(0);
    expect(await db.select().from(inboundMessages).where(eq(inboundMessages.id, fresh.id))).toHaveLength(1);
    await db.delete(inboundMessages).where(eq(inboundMessages.id, fresh.id));
    void auditLog;
  });

  it("a marker 1:1 on a report's calendar doesn't make their manager the subject", () => {
    const people = [
      { id: ids.manager, email: `m-${tag}@test.local`, name: "Jo", isActive: true, managerId: null },
      { id: ids.report, email: `r-${tag}@test.local`, name: "Sam", isActive: true, managerId: ids.manager },
    ];
    const event = { title: "[Check-in] Jo / Sam", attendees: [`m-${tag}@test.local`, `r-${tag}@test.local`], declined: [], visibility: "default" as const, organizerEmail: `m-${tag}@test.local` };
    // On the manager's calendar: the report is the subject.
    expect(detectOneOnOne(event, { id: ids.manager, email: `m-${tag}@test.local` }, people, "[Check-in]", new Set([ids.report]))?.subjectUserId).toBe(ids.report);
    // On the report's calendar (no reports of their own): no subject, not an inverted 1:1.
    expect(detectOneOnOne(event, { id: ids.report, email: `r-${tag}@test.local` }, people, "[Check-in]", new Set())?.subjectUserId).toBeNull();
  });
});
