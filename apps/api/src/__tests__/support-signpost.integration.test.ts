import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import crypto from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Queue } from "bullmq";
import type { FastifyInstance } from "fastify";
import {
  getTenantDb,
  conversations,
  orgSettings,
  questionnaires,
  questionnaireThemes,
  supportSignposts,
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
import { monthKey } from "../lib/support.js";
import type { Concern } from "../lib/bot-references.js";
import { buildApp } from "../server.js";

/**
 * Concerns in live conversations (docs/bot/concerns-playbook.md, Nick
 * 2026-09-27): a flagged turn goes to the reference path; wellbeing and
 * safety get a signpost to the organisation's support contact, end the
 * check-in and are never analysed; conduct says where to raise it; privacy
 * answers and carries on. Nothing is passed on; only counts are kept.
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
const CONTACT = "Jo Patel in the People Team";
const DETAILS = "Our EAP is free and confidential on 0800 111 222.";

class FakeChat extends InternalSimulatorAdapter {
  sent: Array<{ channelId: string; text: string }> = [];
  async sendMessage(message: Parameters<InternalSimulatorAdapter["sendMessage"]>[0]) {
    this.sent.push({ channelId: message.channelId, text: message.text });
    return "ok";
  }
}

/** The script path flags `flag`; the reference path settles on `ref` (or throws). */
function fakeLLM(flag: Concern, ref: Concern | "throw") {
  return {
    complete: async (req: { jsonMode?: boolean }) => ({
      content: req.jsonMode
        ? JSON.stringify({ quality: "answered", action: "next_theme", question: "What else stood out?", concern: flag })
        : "How has Sam been to work with?",
      usage: { inputTokens: 1, outputTokens: 1 },
      model: "fake",
      latencyMs: 1,
    }),
    completeWithTools: async () => {
      if (ref === "throw") throw new Error("model down");
      return {
        content: JSON.stringify({
          concern: ref,
          reply: ref === "none" ? "What else stood out?" : "Thank you for telling me. That sounds really hard.",
          next: ref === "privacy" || ref === "off_script" || ref === "none" ? "continue" : "pause",
          trigger_quote: "",
        }),
        usage: { inputTokens: 1, outputTokens: 1 },
        model: "fake",
        latencyMs: 1,
        toolCalls: [{ name: "read_reference", input: { name: ref }, output: "" }],
        rounds: 2,
      };
    },
  } as unknown as LLMGateway;
}

describe.skipIf(!dbUp)("concerns in live conversations (integration)", () => {
  const ids = { person: crypto.randomUUID(), subject: crypto.randomUUID(), admin: crypto.randomUUID() };
  const tag = ids.person.slice(0, 8);
  const channel = `dm-signpost-${tag}`;
  const as = (userId: string) => ({ "x-internal-secret": SECRET, "x-user-id": userId });
  let questionnaireId: string;
  let chat: FakeChat;
  let analysis: Array<{ data: { conversationId: string } }>;
  let app: FastifyInstance;
  let saved: Partial<typeof orgSettings.$inferInsert> | null = null;

  const recordingQueue = <T>(into: T[]) => ({ add: async (_name: string, data: never) => void into.push({ data } as T) }) as unknown as Queue;
  const depsFor = (llm: LLMGateway): OrchestratorDeps => {
    const adapters = new AdapterRegistry();
    adapters.register(chat);
    return { llm, adapters, analysisQueue: recordingQueue(analysis) };
  };
  const shownThisMonth = async (level: "wellbeing" | "safety" | "conduct") =>
    (await db.select().from(supportSignposts).where(and(eq(supportSignposts.month, monthKey(new Date())), eq(supportSignposts.level, level))))[0]
      ?.shown ?? 0;
  const conv = async (id: string) => (await db.select().from(conversations).where(eq(conversations.id, id)))[0];

  /** Start a check-in, send one reply, and take the turn with this model. */
  async function turn(llm: LLMGateway, reply = "Honestly I can't cope with coming in any more.") {
    const deps = depsFor(llm);
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
    await appendUserMessage(db, res.conversationId, reply);
    chat.sent = [];
    const result = await processTurn(db, deps, res.conversationId);
    return { id: res.conversationId, result, text: chat.sent.map((m) => m.text).join("\n") };
  }

  /** Another reply in the same conversation. */
  async function again(id: string, llm: LLMGateway, reply: string) {
    const deps = depsFor(llm);
    await appendUserMessage(db, id, reply);
    chat.sent = [];
    const result = await processTurn(db, deps, id);
    return { result, text: chat.sent.map((m) => m.text).join("\n") };
  }

  beforeAll(async () => {
    await db.insert(users).values([
      { id: ids.person, email: `p-${tag}@test.local`, name: "Rae Kim" },
      { id: ids.subject, email: `s-${tag}@test.local`, name: "Sam" },
      { id: ids.admin, email: `a-${tag}@test.local`, name: "Ada", role: "admin" },
    ]);
    const [q] = await db.insert(questionnaires).values({ name: `signpost-${tag}`, category: "peer_review" }).returning();
    questionnaireId = q.id;
    await db.insert(questionnaireThemes).values([
      { questionnaireId, intent: "Collaboration", dataGoal: "How they collaborate", sortOrder: 0 },
      { questionnaireId, intent: "Growth", dataGoal: "Where they could grow", sortOrder: 1 },
    ]);
    await db.insert(userPlatformIdentities).values({
      userId: ids.person,
      platform: "internal",
      platformUserId: `users/signpost-${tag}`,
      dmAddress: channel,
      status: "reachable",
      linkSource: "auto",
      confirmedAt: new Date(),
    });
    const [existing] = await db.select().from(orgSettings).limit(1);
    const ours = { supportContact: CONTACT, supportDetails: DETAILS, supportOutside: "", supportWording: {}, supportWordingSignoff: null };
    if (existing) {
      saved = {
        supportContact: existing.supportContact,
        supportDetails: existing.supportDetails,
        supportOutside: existing.supportOutside,
        supportWording: existing.supportWording,
        supportWordingSignoff: existing.supportWordingSignoff,
      };
      await db.update(orgSettings).set(ours).where(eq(orgSettings.id, existing.id));
    } else {
      await db.insert(orgSettings).values(ours);
    }
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    chat = new FakeChat();
    analysis = [];
    // One open check-in at a time per person.
    await db.update(conversations).set({ status: "closed", closedAt: new Date() }).where(and(eq(conversations.reviewerId, ids.person), inArray(conversations.status, ["initiated", "in_progress"])));
  });

  afterAll(async () => {
    await app?.close();
    await db.update(orgSettings).set(saved ?? { supportContact: "", supportDetails: "", supportOutside: "", supportWording: {}, supportWordingSignoff: null });
    await db.delete(conversations).where(eq(conversations.reviewerId, ids.person));
    await db.delete(userPlatformIdentities).where(eq(userPlatformIdentities.userId, ids.person));
    await db.delete(questionnaires).where(eq(questionnaires.id, questionnaireId));
    await db.delete(users).where(inArray(users.id, Object.values(ids)));
    // support_signposts are org-wide counts without ids; the test's increments stay.
  });

  it("safety: signpost to the organisation's contact, check-in ends, never analysed, counted", async () => {
    const before = await shownThisMonth("safety");
    const { id, result, text } = await turn(fakeLLM("safety", "safety"));

    expect(result.status).toBe("closed");
    expect(text).toContain("That sounds really hard.");
    expect(text).toContain(`${CONTACT} is better placed to support you`);
    expect(text).toContain(DETAILS);
    expect(text).toContain("I haven't passed anything on");
    expect(await conv(id)).toMatchObject({ status: "incomplete", phase: "support" });
    expect(analysis).toHaveLength(0);
    expect(await shownThisMonth("safety")).toBe(before + 1);

    const res = await runAnalysisPipeline(db, fakeLLM("none", "none"), id, quiet);
    expect(res).toMatchObject({ success: true, feedbackEntryId: null });
  });

  it("wellbeing: the same signpost, counted separately", async () => {
    const before = await shownThisMonth("wellbeing");
    const { id, text } = await turn(fakeLLM("wellbeing", "wellbeing"));
    expect(text).toContain(`${CONTACT} is better placed to support you`);
    expect(await conv(id)).toMatchObject({ status: "incomplete", phase: "support" });
    expect(await shownThisMonth("wellbeing")).toBe(before + 1);
  });

  it("the reference path can raise wellbeing to safety", async () => {
    const before = await shownThisMonth("safety");
    await turn(fakeLLM("wellbeing", "safety"));
    expect(await shownThisMonth("safety")).toBe(before + 1);
  });

  it("conduct: says where to raise it, ends, and is analysed as before", async () => {
    const before = await shownThisMonth("conduct");
    const { id, text } = await turn(fakeLLM("conduct", "conduct"), "My manager screamed at me in front of the team.");
    expect(text).toContain(`raise this with ${CONTACT}`);
    expect(await conv(id)).toMatchObject({ status: "incomplete", phase: "closing" });
    expect(analysis.map((a) => a.data.conversationId)).toContain(id);
    expect(await shownThisMonth("conduct")).toBe(before + 1);
  });

  it("privacy: answers, adds the choice to skip or stop, and carries on", async () => {
    const { id, result, text } = await turn(fakeLLM("privacy", "privacy"), "Who sees this?");
    expect(result.status).toBe("replied");
    expect(text).toContain("You can carry on, skip this question, or reply stop at any time.");
    expect(await conv(id)).toMatchObject({ status: "in_progress", currentThemeIndex: 0 });
  });

  it("an ordinary answer after all: the planned turn goes ahead", async () => {
    const { id, result, text } = await turn(fakeLLM("wellbeing", "none"), "Tough week but Sam was great.");
    expect(result.status).toBe("replied");
    expect(text).toContain("What else stood out?");
    expect(await conv(id)).toMatchObject({ status: "in_progress", currentThemeIndex: 1 });
  });

  it("if the model fails on a serious concern, the fixed wording still goes", async () => {
    const { id, text } = await turn(fakeLLM("safety", "throw"));
    expect(text).toContain(`${CONTACT} is better placed to support you`);
    expect(await conv(id)).toMatchObject({ status: "incomplete", phase: "support" });
  });

  it("support conversations are never analysed, even via markIncomplete, and are purged after retention", async () => {
    const { id } = await turn(fakeLLM("privacy", "privacy"), "Who sees this?");
    await db.update(conversations).set({ phase: "support" }).where(eq(conversations.id, id));
    await markIncomplete(db, depsFor(fakeLLM("none", "none")), id);
    expect(analysis).toHaveLength(0);

    await db.update(conversations).set({ closedAt: new Date(Date.now() - (DELIVERY_RETENTION_DAYS + 1) * DAY) }).where(eq(conversations.id, id));
    await runSweep(db, { ...depsFor(fakeLLM("none", "none")), conversationQueue: recordingQueue([]) }, new Date(), quiet);
    expect(await conv(id)).toBeUndefined();
  });

  it("admins set the signpost and see counts by level, with small counts hidden", async () => {
    const notAdmin = await app.inject({ method: "GET", url: "/api/v1/support/settings", headers: as(ids.person) });
    expect(notAdmin.statusCode).toBe(403);

    const put = await app.inject({
      method: "PUT",
      url: "/api/v1/support/settings",
      headers: as(ids.admin),
      payload: { supportContact: CONTACT, supportDetails: DETAILS, supportOutside: "" },
    });
    expect(put.statusCode).toBe(200);

    await db.insert(supportSignposts).values({ month: "2001-01-01", level: "safety", shown: 2 }).onConflictDoNothing();
    const res = await app.inject({ method: "GET", url: "/api/v1/support/settings", headers: as(ids.admin) });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data).toMatchObject({ supportContact: CONTACT, supportDetails: DETAILS });
    for (const m of data.months as Array<Record<string, number | null>>) {
      for (const level of ["wellbeing", "safety", "conduct"]) expect(m[level] === null || (m[level] as number) >= 3).toBe(true);
    }
    await db.delete(supportSignposts).where(eq(supportSignposts.month, "2001-01-01"));
  });

  it("off-script twice in a row offers to stop; a third time ends the check-in for today", async () => {
    const offScript = fakeLLM("off_script", "off_script");
    const first = await turn(offScript, "lol what's the weather like");
    expect(first.text).not.toContain("Is now a bad time?");
    const second = await again(first.id, offScript, "tell me a joke");
    expect(second.result.status).toBe("replied");
    expect(second.text).toContain("Is now a bad time?");
    expect(await conv(first.id)).toMatchObject({ status: "in_progress", offScriptStreak: 2 });

    const third = await again(first.id, offScript, "banana");
    expect(third.result.status).toBe("closed");
    expect(third.text).toBe("Let's leave it there for today. We'll pick this up another time.");
    expect(await conv(first.id)).toMatchObject({ status: "incomplete", phase: "closing" });
    // Nothing but off-script replies: nothing to analyse, by any route.
    expect(analysis.map((a) => a.data.conversationId)).not.toContain(first.id);
    const res = await runAnalysisPipeline(db, fakeLLM("none", "none"), first.id, quiet);
    expect(res).toMatchObject({ success: true, feedbackEntryId: null });
  });

  it("an off-script close after a real answer is analysed as partial", async () => {
    const first = await turn(fakeLLM("none", "none"), "Sam unblocked three of us on the release, calmly.");
    const offScript = fakeLLM("off_script", "off_script");
    for (const text of ["lol", "joke please", "football?"]) await again(first.id, offScript, text);
    expect(await conv(first.id)).toMatchObject({ status: "incomplete", offScriptStreak: 3 });
    expect(analysis.map((a) => a.data.conversationId)).toContain(first.id);
  });

  it("a privacy question or an answer breaks an off-script run", async () => {
    const first = await turn(fakeLLM("off_script", "off_script"), "lol");
    await again(first.id, fakeLLM("privacy", "privacy"), "who sees this?");
    expect((await conv(first.id)).offScriptStreak).toBe(0);
    const next = await again(first.id, fakeLLM("off_script", "off_script"), "lol again");
    expect(next.text).not.toContain("Is now a bad time?");
    await again(first.id, fakeLLM("none", "none"), "Sam is great at unblocking people.");
    expect((await conv(first.id)).offScriptStreak).toBe(0);
  });

  it("the client's HR team signs off the wording; editing it makes the sign-off stale; live turns use it", async () => {
    const bad = await app.inject({
      method: "PUT",
      url: "/api/v1/support/wording",
      headers: as(ids.admin),
      payload: { support: "Talk to {manager}.", conduct: "" },
    });
    expect(bad.statusCode).toBe(400);

    const custom = "We're sorry things are hard. Please speak to {contact}. {details} {outside}";
    const put = await app.inject({ method: "PUT", url: "/api/v1/support/wording", headers: as(ids.admin), payload: { support: custom, conduct: "" } });
    expect(put.statusCode).toBe(200);

    let data = (await app.inject({ method: "GET", url: "/api/v1/support/settings", headers: as(ids.admin) })).json().data;
    expect(data.wording).toEqual({ support: custom, conduct: "" });
    expect(data.previews.wellbeing).toBe(`We're sorry things are hard. Please speak to ${CONTACT}. ${DETAILS}`);
    expect(data.signoff).toBeNull();

    // A sign-off for wording other than what's stored now is refused.
    const stale = await app.inject({
      method: "POST",
      url: "/api/v1/support/wording/sign-off",
      headers: as(ids.admin),
      payload: { name: "Priya Shah", role: "Head of People", hash: "0".repeat(64) },
    });
    expect(stale.statusCode).toBe(409);
    const sign = await app.inject({
      method: "POST",
      url: "/api/v1/support/wording/sign-off",
      headers: as(ids.admin),
      payload: { name: "Priya Shah", role: "Head of People", hash: data.wordingHash },
    });
    expect(sign.statusCode).toBe(200);
    data = (await app.inject({ method: "GET", url: "/api/v1/support/settings", headers: as(ids.admin) })).json().data;
    expect(data.signoff).toMatchObject({ name: "Priya Shah", role: "Head of People", current: true });

    // The live signpost uses their wording.
    const { text } = await turn(fakeLLM("wellbeing", "wellbeing"));
    expect(text).toContain(`Please speak to ${CONTACT}.`);

    // Changing the contact changes what people see: the sign-off is stale.
    await app.inject({
      method: "PUT",
      url: "/api/v1/support/settings",
      headers: as(ids.admin),
      payload: { supportContact: "Someone else", supportDetails: DETAILS, supportOutside: "" },
    });
    data = (await app.inject({ method: "GET", url: "/api/v1/support/settings", headers: as(ids.admin) })).json().data;
    expect(data.signoff).toMatchObject({ current: false });

    // Back to the defaults for the other tests.
    await app.inject({ method: "PUT", url: "/api/v1/support/wording", headers: as(ids.admin), payload: { support: "", conduct: "" } });
    await app.inject({ method: "PUT", url: "/api/v1/support/settings", headers: as(ids.admin), payload: { supportContact: CONTACT, supportDetails: DETAILS, supportOutside: "" } });
    const nonAdmin = await app.inject({ method: "POST", url: "/api/v1/support/wording/sign-off", headers: as(ids.person), payload: { name: "Me", role: "Me", hash: "0".repeat(64) } });
    expect(nonAdmin.statusCode).toBe(403);
  });
});
