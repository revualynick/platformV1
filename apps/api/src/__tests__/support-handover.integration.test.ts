import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import crypto from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Queue } from "bullmq";
import type { FastifyInstance } from "fastify";
import {
  getTenantDb,
  auditLog,
  conversations,
  conversationMessages,
  orgSettings,
  questionnaires,
  questionnaireThemes,
  supportRequests,
  supportSignals,
  userPlatformIdentities,
  users,
} from "@revualy/db";
import type { LLMGateway } from "@revualy/ai-core";
import { AdapterRegistry } from "@revualy/chat-core";
import { InternalSimulatorAdapter } from "../lib/internal-simulator-adapter.js";
import {
  appendUserMessage,
  initiateConversation,
  markIncomplete,
  processTurn,
  type OrchestratorDeps,
} from "../lib/conversation-orchestrator.js";
import { runSweep, DELIVERY_RETENTION_DAYS } from "../lib/conversation-sweeper.js";
import { runAnalysisPipeline } from "../lib/analysis-pipeline.js";
import { recordSupportOffer, supportDueAt } from "../lib/support.js";
import { supportOffer, EVAL_ORG } from "../lib/bot-references.js";
import { buildApp } from "../server.js";

/**
 * The support handover (docs/bot/concerns-playbook.md, Nick 2026-09-27):
 * consent read by code, a request only on a yes, the contacts emailed
 * without names, no analysis of the conversation, the transcript purged,
 * a queue only the support contacts can see, and counts for admins.
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
const quiet = { error: () => {}, warn: () => {}, info: () => {} };
const DAY = 24 * 60 * 60 * 1000;
const SECRET = process.env.INTERNAL_API_SECRET!;

class FakeChat extends InternalSimulatorAdapter {
  sent: Array<{ channelId: string; text: string }> = [];
  async sendMessage(message: Parameters<InternalSimulatorAdapter["sendMessage"]>[0]) {
    this.sent.push({ channelId: message.channelId, text: message.text });
    return "ok";
  }
}

// No model is called on the consent path; this fails the test if one is.
const noLLM = {
  complete: async () => {
    throw new Error("the consent path must not call a model");
  },
} as unknown as LLMGateway;

describe.skipIf(!dbUp)("support handover (integration)", () => {
  const ids = {
    person: crypto.randomUUID(),
    subject: crypto.randomUUID(),
    contact: crypto.randomUUID(),
    backup: crypto.randomUUID(),
    admin: crypto.randomUUID(),
    other: crypto.randomUUID(),
  };
  const tag = ids.person.slice(0, 8);
  const channel = `dm-support-${tag}`;
  const as = (userId: string) => ({ "x-internal-secret": SECRET, "x-user-id": userId });
  let questionnaireId: string;
  let chat: FakeChat;
  let analysis: Array<{ data: unknown }>;
  let notifications: Array<{ name: string; data: Record<string, unknown> }>;
  let deps: OrchestratorDeps;
  let app: FastifyInstance;
  let savedSettings: Record<string, unknown> | null = null;

  const recordingQueue = <T>(into: T[]) =>
    ({
      add: async (name: string, data: never) => {
        into.push({ name, data } as T);
      },
    }) as unknown as Queue;

  /** A conversation where the bot has just made the offer of support. */
  async function offered(level: "wellbeing" | "safety") {
    const res = await initiateConversation(db, deps, {
      orgId: process.env.ORG_ID!,
      reviewerId: ids.person,
      subjectId: ids.subject,
      interactionType: "peer_review",
      platform: "internal",
      channelId: channel,
      questionnaireId,
    });
    if (res.status !== "started") throw new Error("not started");
    const id = res.conversationId;
    await appendUserMessage(db, id, "Honestly I can't cope with coming in any more.");
    await db.transaction(async (tx) => {
      await tx.insert(conversationMessages).values({ conversationId: id, role: "assistant", content: supportOffer(level, EVAL_ORG) });
      await recordSupportOffer(tx, id, level, true);
    });
    return id;
  }
  const conv = async (id: string) => (await db.select().from(conversations).where(eq(conversations.id, id)))[0];
  const answer = async (id: string, text: string) => {
    await appendUserMessage(db, id, text);
    chat.sent = [];
    return processTurn(db, deps, id);
  };
  const requestsFor = () => db.select().from(supportRequests).where(eq(supportRequests.userId, ids.person));

  beforeAll(async () => {
    await db.insert(users).values([
      { id: ids.person, email: `p-${tag}@test.local`, name: "Rae Kim" },
      { id: ids.subject, email: `s-${tag}@test.local`, name: "Sam" },
      { id: ids.contact, email: `c-${tag}@test.local`, name: "Jo Patel" },
      { id: ids.backup, email: `b-${tag}@test.local`, name: "Ben Ade" },
      { id: ids.admin, email: `a-${tag}@test.local`, name: "Ada", role: "admin" },
      { id: ids.other, email: `o-${tag}@test.local`, name: "Olu", role: "admin" },
    ]);
    const [q] = await db.insert(questionnaires).values({ name: `support-${tag}`, category: "peer_review" }).returning();
    questionnaireId = q.id;
    await db.insert(questionnaireThemes).values([{ questionnaireId, intent: "Collaboration", dataGoal: "How they collaborate", sortOrder: 0 }]);
    await db.insert(userPlatformIdentities).values({
      userId: ids.person,
      platform: "internal",
      platformUserId: `users/support-${tag}`,
      dmAddress: channel,
      status: "reachable",
      linkSource: "auto",
      confirmedAt: new Date(),
    });
    const [existing] = await db.select().from(orgSettings).limit(1);
    if (existing) {
      savedSettings = {
        supportContactId: existing.supportContactId,
        supportBackupId: existing.supportBackupId,
        supportDetails: existing.supportDetails,
        supportOutside: existing.supportOutside,
      };
      await db.update(orgSettings).set({ supportContactId: ids.contact, supportBackupId: ids.backup }).where(eq(orgSettings.id, existing.id));
    } else {
      await db.insert(orgSettings).values({ supportContactId: ids.contact, supportBackupId: ids.backup });
    }
    app = await buildApp();
    await app.ready();
  });

  beforeEach(() => {
    chat = new FakeChat();
    const adapters = new AdapterRegistry();
    adapters.register(chat);
    analysis = [];
    notifications = [];
    deps = { llm: noLLM, adapters, analysisQueue: recordingQueue(analysis), notificationQueue: recordingQueue(notifications) };
  });

  afterAll(async () => {
    await app?.close();
    if (savedSettings) await db.update(orgSettings).set(savedSettings);
    else await db.update(orgSettings).set({ supportContactId: null, supportBackupId: null });
    await db.delete(supportRequests).where(eq(supportRequests.userId, ids.person));
    await db.delete(conversations).where(eq(conversations.reviewerId, ids.person));
    await db.delete(userPlatformIdentities).where(eq(userPlatformIdentities.userId, ids.person));
    await db.delete(questionnaires).where(eq(questionnaires.id, questionnaireId));
    await db.delete(users).where(inArray(users.id, Object.values(ids)));
    // support_signals are org-wide counts without ids; the test's increments stay.
  });

  it("a yes creates a request (who and how soon only), emails the contacts, and never analyses", async () => {
    const before = await requestsFor();
    const id = await offered("safety");
    const result = await answer(id, "yes please");

    expect(result.status).toBe("closed");
    const c = await conv(id);
    expect(c).toMatchObject({ status: "incomplete", phase: "support", supportLevel: "safety" });
    expect(chat.sent.map((m) => m.text).join(" ")).toContain("I've asked Jo Patel to get in touch with you today");

    const after = await requestsFor();
    expect(after.length).toBe(before.length + 1);
    const req = after.find((r) => !before.some((b) => b.id === r.id))!;
    expect(req).toMatchObject({ urgency: "today", status: "open" });
    expect(Object.keys(req)).not.toContain("content");
    expect(notifications).toEqual([expect.objectContaining({ name: "support_request", data: expect.objectContaining({ requestId: req.id, kind: "new" }) })]);
    expect(analysis).toHaveLength(0);

    // The analysis pipeline refuses it too, even if something queues it.
    const res = await runAnalysisPipeline(db, noLLM, id, quiet);
    expect(res).toMatchObject({ success: true, feedbackEntryId: null });
  });

  it("a no passes nothing on", async () => {
    const before = (await requestsFor()).length;
    const id = await offered("wellbeing");
    await answer(id, "no thanks, I'm ok");
    expect((await conv(id)).status).toBe("incomplete");
    expect(chat.sent.map((m) => m.text).join(" ")).toContain("I won't pass anything on");
    expect((await requestsFor()).length).toBe(before);
    expect(notifications).toHaveLength(0);
    expect(analysis).toHaveLength(0);
  });

  it("an unclear answer is asked once more; unclear again counts as no", async () => {
    const before = (await requestsFor()).length;
    const id = await offered("wellbeing");
    expect((await answer(id, "please don't make a fuss")).status).toBe("replied");
    expect(await conv(id)).toMatchObject({ status: "in_progress", phase: "support_retry" });
    expect(chat.sent.map((m) => m.text).join(" ")).toContain("Just to check");

    expect((await answer(id, "I don't know")).status).toBe("closed");
    expect(chat.sent.map((m) => m.text).join(" ")).toContain("won't pass anything on");
    expect((await requestsFor()).length).toBe(before);
  });

  it("a conversation left waiting (or stopped) ends without analysis", async () => {
    const id = await offered("wellbeing");
    await markIncomplete(db, deps, id);
    expect((await conv(id)).status).toBe("incomplete");
    expect(analysis).toHaveLength(0);
  });

  it("wellbeing requests are due in two working days, safety the same day", () => {
    const friday = new Date("2026-10-02T10:00:00Z");
    expect(supportDueAt("wellbeing", friday).toISOString().slice(0, 10)).toBe("2026-10-06");
    expect(supportDueAt("safety", friday).getTime() - friday.getTime()).toBe(8 * 60 * 60 * 1000);
  });

  it("the sweeper purges support transcripts after retention and reminds once about overdue requests", async () => {
    const id = await offered("safety");
    await answer(id, "yes");
    const [req] = (await requestsFor()).filter((r) => r.status === "open").slice(-1);
    await db.update(supportRequests).set({ dueAt: new Date(Date.now() - 1000) }).where(eq(supportRequests.id, req.id));
    await db
      .update(conversations)
      .set({ closedAt: new Date(Date.now() - (DELIVERY_RETENTION_DAYS + 1) * DAY) })
      .where(eq(conversations.id, id));

    const sweepDeps = { ...deps, conversationQueue: recordingQueue([]) };
    const first = await runSweep(db, sweepDeps, new Date(), quiet);
    expect(await conv(id)).toBeUndefined();
    expect(first.supportReminders).toBeGreaterThanOrEqual(1);
    expect(notifications.some((n) => n.data.requestId === req.id && n.data.kind === "overdue")).toBe(true);

    notifications.length = 0;
    await runSweep(db, sweepDeps, new Date(), quiet);
    expect(notifications.some((n) => n.data.requestId === req.id)).toBe(false);
    // The request itself stays: it is how the contact knows to follow up.
    expect((await requestsFor()).some((r) => r.id === req.id)).toBe(true);
  });

  // ── API ────────────────────────────────────────────────

  it("only the support contacts see the queue; others are refused and audited", async () => {
    for (const who of [ids.admin, ids.person]) {
      const res = await app.inject({ method: "GET", url: "/api/v1/support/requests", headers: as(who) });
      expect(res.statusCode).toBe(403);
    }
    const denied = await db.select().from(auditLog).where(and(eq(auditLog.action, "support.denied"), eq(auditLog.actorId, ids.admin)));
    expect(denied.length).toBeGreaterThan(0);

    for (const who of [ids.contact, ids.backup]) {
      const me = await app.inject({ method: "GET", url: "/api/v1/support/me", headers: as(who) });
      expect(me.json()).toEqual({ isContact: true });
    }
    const notMe = await app.inject({ method: "GET", url: "/api/v1/support/me", headers: as(ids.admin) });
    expect(notMe.json()).toEqual({ isContact: false });

    const list = await app.inject({ method: "GET", url: "/api/v1/support/requests", headers: as(ids.contact) });
    expect(list.statusCode).toBe(200);
    const mine = (list.json().data as Array<Record<string, unknown>>).filter((r) => r.userId === ids.person);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine[0]).toMatchObject({ name: "Rae Kim" });
    const views = await db.select().from(auditLog).where(and(eq(auditLog.action, "support.view_queue"), eq(auditLog.actorId, ids.contact)));
    expect(views.length).toBeGreaterThan(0);

    const open = mine.find((r) => r.status === "open")!;
    const ack = await app.inject({ method: "POST", url: `/api/v1/support/requests/${open.id}/acknowledge`, headers: as(ids.backup) });
    expect(ack.statusCode).toBe(200);
    const again = await app.inject({ method: "POST", url: `/api/v1/support/requests/${open.id}/acknowledge`, headers: as(ids.contact) });
    expect(again.statusCode).toBe(409);
    const close = await app.inject({ method: "POST", url: `/api/v1/support/requests/${open.id}/close`, headers: as(ids.contact) });
    expect(close.statusCode).toBe(200);
  });

  it("admins set the contacts and see counts, with small counts hidden", async () => {
    const bad = await app.inject({
      method: "PUT",
      url: "/api/v1/support/settings",
      headers: as(ids.admin),
      payload: { supportContactId: ids.contact, supportBackupId: ids.contact, supportDetails: "", supportOutside: "" },
    });
    expect(bad.statusCode).toBe(400);
    const notAdmin = await app.inject({ method: "GET", url: "/api/v1/support/settings", headers: as(ids.contact) });
    expect(notAdmin.statusCode).toBe(403);

    const ok = await app.inject({
      method: "PUT",
      url: "/api/v1/support/settings",
      headers: as(ids.admin),
      payload: {
        supportContactId: ids.contact,
        supportBackupId: ids.backup,
        supportDetails: "Our EAP is free and confidential on 0800 111 222.",
        supportOutside: "",
      },
    });
    expect(ok.statusCode).toBe(200);

    // Force a month with a small count and one with a large count.
    await db.insert(supportSignals).values({ month: "2001-01-01", offers: 2, accepted: 1 }).onConflictDoNothing();
    const res = await app.inject({ method: "GET", url: "/api/v1/support/settings", headers: as(ids.admin) });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data).toMatchObject({ supportContactId: ids.contact, supportBackupId: ids.backup, supportDetails: expect.stringContaining("0800 111 222") });
    for (const m of data.months as Array<{ offers: number | null; accepted: number | null }>) {
      for (const n of [m.offers, m.accepted]) expect(n === null || n >= 3).toBe(true);
    }
    await db.delete(supportSignals).where(eq(supportSignals.month, "2001-01-01"));
  });
});
