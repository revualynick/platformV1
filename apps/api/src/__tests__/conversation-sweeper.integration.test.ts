import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import crypto from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Queue } from "bullmq";
import {
  getTenantDb,
  users,
  conversations,
  conversationMessages,
  questionnaires,
  questionnaireThemes,
  inboundMessages,
  userPlatformIdentities,
  feedbackEntries,
  selfReflections,
  engagementScores,
  checkinJobs,
} from "@revualy/db";
import type { LLMGateway, LLMCompletionRequest } from "@revualy/ai-core";
import { AdapterRegistry } from "@revualy/chat-core";
import { InternalSimulatorAdapter } from "../lib/internal-simulator-adapter.js";
import {
  appendUserMessage,
  initiateConversation,
  markIncomplete,
  processTurn,
  type OrchestratorDeps,
} from "../lib/conversation-orchestrator.js";
import { runSweep, type SweeperDeps } from "../lib/conversation-sweeper.js";
import { handleInbound } from "../lib/inbound-router.js";
import { runAnalysisPipeline } from "../lib/analysis-pipeline.js";
import { recomputeWeeklyEngagement } from "../lib/engagement-aggregation.js";

/**
 * Step 6 lifecycle: the sweeper, `incomplete` conversations and partial
 * feedback, against a real Postgres. Self-skips without a DB.
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
const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms);

class FakeChat extends InternalSimulatorAdapter {
  sent: Array<{ channelId: string; text: string }> = [];
  failChannels = new Set<string>();
  async sendMessage(message: Parameters<InternalSimulatorAdapter["sendMessage"]>[0]) {
    if (this.failChannels.has(message.channelId)) throw new Error("platform down");
    this.sent.push({ channelId: message.channelId, text: message.text });
    return "ok";
  }
}

function fakeLLM(onQuestion?: () => Promise<void>): LLMGateway {
  let hook = onQuestion;
  const complete = async (req: LLMCompletionRequest) => {
    if (req.tier === "standard" && hook) {
      const h = hook;
      hook = undefined;
      await h();
    }
    const content = req.tier === "fast" ? "follow_up" : "Question?";
    return { content, usage: { inputTokens: 1, outputTokens: 1 }, model: "m", latencyMs: 1 };
  };
  return { complete } as unknown as LLMGateway;
}

describe.skipIf(!dbUp)("conversation lifecycle and sweeper (integration)", () => {
  const ids = { reviewer: crypto.randomUUID(), subject: crypto.randomUUID() };
  const tag = ids.reviewer.slice(0, 8);
  const sender = `users/sweep-${tag}`;
  let questionnaireId: string;
  let chat: FakeChat;
  let queued: Array<{ name: string; data: Record<string, unknown>; jobId?: string }>;
  let analysis: Array<{ data: unknown; jobId?: string }>;
  let deps: OrchestratorDeps;
  let sweepDeps: SweeperDeps;

  const recordingQueue = (into: Array<{ name?: string; data: never; jobId?: string }>) =>
    ({
      add: async (name: string, data: never, opts?: { jobId?: string }) => {
        if (opts?.jobId && into.some((j) => j.jobId === opts.jobId)) return;
        into.push({ name, data, jobId: opts?.jobId });
      },
    }) as unknown as Queue;

  async function start(channelId = "dm-sweep", platform: "internal" | "web" = "internal") {
    const res = await initiateConversation(
      db,
      deps,
      {
        orgId: process.env.ORG_ID!,
        reviewerId: ids.reviewer,
        subjectId: ids.subject,
        interactionType: "peer_review",
        platform,
        channelId,
        questionnaireId,
      },
      platform === "web" ? { deliveredByCaller: true } : {},
    );
    if (res.status !== "started") throw new Error("not started");
    return res.conversationId;
  }
  const status = async (id: string) =>
    (await db.select({ s: conversations.status }).from(conversations).where(eq(conversations.id, id)))[0].s;
  const age = (id: string, ms: number) =>
    db.update(conversations).set({ lastActivityAt: ago(ms) }).where(eq(conversations.id, id));
  const ageMessages = (id: string, ms: number) =>
    db.update(conversationMessages).set({ createdAt: ago(ms) }).where(eq(conversationMessages.conversationId, id));

  beforeAll(async () => {
    await db.insert(users).values([
      { id: ids.reviewer, email: `rev-${tag}@test.local`, name: "Rae" },
      { id: ids.subject, email: `sub-${tag}@test.local`, name: "Sam" },
    ]);
    const [q] = await db.insert(questionnaires).values({ name: `sweep-${tag}`, category: "peer_review" }).returning();
    questionnaireId = q.id;
    await db.insert(questionnaireThemes).values([
      { questionnaireId, intent: "Collaboration", dataGoal: "How they collaborate", sortOrder: 0 },
      { questionnaireId, intent: "Growth", dataGoal: "Where they could grow", sortOrder: 1 },
    ]);
    await db.insert(userPlatformIdentities).values({
      userId: ids.reviewer,
      platform: "internal",
      platformUserId: sender,
      dmAddress: "dm-sweep",
      status: "reachable",
      linkSource: "auto",
      confirmedAt: new Date(),
    });
  });

  beforeEach(async () => {
    // Every test starts with no open conversations for this reviewer.
    await db
      .update(conversations)
      .set({ status: "closed", closedAt: ago(100 * HOUR) })
      .where(eq(conversations.reviewerId, ids.reviewer));
    await db
      .update(inboundMessages)
      .set({ status: "processed", outcome: "no_open_conversation", processedAt: new Date() })
      .where(and(eq(inboundMessages.platformUserId, sender), eq(inboundMessages.status, "pending")));
    chat = new FakeChat();
    const adapters = new AdapterRegistry();
    adapters.register(chat);
    queued = [];
    analysis = [];
    deps = { llm: fakeLLM(), adapters, analysisQueue: recordingQueue(analysis as never) };
    sweepDeps = { ...deps, conversationQueue: recordingQueue(queued as never) };
  });

  afterAll(async () => {
    const convs = (
      await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.reviewerId, ids.reviewer))
    ).map((c) => c.id);
    await db.delete(inboundMessages).where(eq(inboundMessages.platformUserId, sender));
    if (convs.length) {
      await db.delete(feedbackEntries).where(inArray(feedbackEntries.conversationId, convs));
      await db.delete(selfReflections).where(eq(selfReflections.userId, ids.reviewer));
      await db.delete(conversations).where(inArray(conversations.id, convs));
    }
    await db.delete(engagementScores).where(inArray(engagementScores.userId, Object.values(ids)));
    await db.delete(userPlatformIdentities).where(eq(userPlatformIdentities.userId, ids.reviewer));
    await db.delete(questionnaires).where(eq(questionnaires.id, questionnaireId));
    await db.delete(users).where(inArray(users.id, Object.values(ids)));
  });

  // ── Stale conversations ───────────────────────────────

  it("marks a conversation quiet for 24 hours incomplete, silently, and queues partial analysis", async () => {
    const stale = await start();
    await age(stale, 25 * HOUR);
    chat.sent = [];
    const result = await runSweep(db, sweepDeps, new Date(), quiet);

    expect(result.markedIncomplete).toBeGreaterThanOrEqual(1);
    expect(await status(stale)).toBe("incomplete");
    expect(chat.sent.filter((m) => m.channelId === "dm-sweep")).toHaveLength(0); // no extra DM
    expect(analysis.map((a) => (a.data as { conversationId: string }).conversationId)).toContain(stale);
  });

  it("leaves a conversation that is merely quiet for a few hours alone", async () => {
    const recent = await start();
    await age(recent, 23 * HOUR);
    await runSweep(db, sweepDeps, new Date(), quiet);
    expect(await status(recent)).toBe("initiated");
  });

  it("a turn already in flight when the conversation is marked incomplete does not reply", async () => {
    const convId = await start();
    await appendUserMessage(db, convId, "Half an answer");
    const racing = { ...deps, llm: fakeLLM(async () => void (await markIncomplete(db, deps, convId))) };
    expect(await processTurn(db, racing, convId)).toEqual({ status: "lost_race" });
    const roles = (
      await db
        .select({ role: conversationMessages.role })
        .from(conversationMessages)
        .where(eq(conversationMessages.conversationId, convId))
        .orderBy(asc(conversationMessages.seq))
    ).map((m) => m.role);
    expect(roles).toEqual(["assistant", "user"]);
  });

  it('"stop" mid-conversation ends it as incomplete', async () => {
    const convId = await start();
    const [row] = await db
      .insert(inboundMessages)
      .values({ platform: "internal", platformMessageId: `m-${crypto.randomUUID()}`, platformUserId: sender, platformChannelId: "dm-sweep", content: "stop" })
      .returning({ id: inboundMessages.id });
    await handleInbound(db, { ...deps, scheduleTurn: async () => {} }, row.id);
    expect(await status(convId)).toBe("incomplete");
    await db.update(users).set({ preferences: {} }).where(eq(users.id, ids.reviewer));
  });

  // ── Stuck work ────────────────────────────────────────

  it("re-sends a bot message stuck in the outbox, but not a fresh one or a web one", async () => {
    chat.failChannels.add("dm-stuck");
    const stuck = await start("dm-stuck").catch(() => undefined);
    expect(stuck).toBeUndefined(); // the first send failed
    const [stuckConv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.reviewerId, ids.reviewer), eq(conversations.platformChannelId, "dm-stuck")));
    await ageMessages(stuckConv.id, 10 * 60 * 1000);

    chat.failChannels.clear();
    const result = await runSweep(db, sweepDeps, new Date(), quiet);
    expect(result.resent).toBeGreaterThanOrEqual(1);
    expect(chat.sent.filter((m) => m.channelId === "dm-stuck")).toHaveLength(1);
    // Delivered messages (dm-sweep) and web conversations are never re-sent.
    expect(chat.sent.filter((m) => m.channelId !== "dm-stuck" && m.channelId.startsWith("dm-") || m.channelId.startsWith("web:"))).toHaveLength(0);
  });

  it("one failing item does not stop the rest of the sweep", async () => {
    chat.failChannels.add("dm-a");
    await start("dm-a").catch(() => undefined);
    const b = await start("dm-b");
    const [a] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.reviewerId, ids.reviewer), eq(conversations.platformChannelId, "dm-a")));
    await ageMessages(a.id, 10 * 60 * 1000);
    await age(b, 25 * HOUR);

    const result = await runSweep(db, sweepDeps, new Date(), quiet);
    expect(result.errors).toBeGreaterThanOrEqual(1);
    expect(await status(b)).toBe("incomplete");
  });

  it("re-queues an inbound message nobody processed, within the retry window only", async () => {
    const insert = async (receivedAt: Date) => {
      const [r] = await db
        .insert(inboundMessages)
        .values({ platform: "internal", platformMessageId: `m-${crypto.randomUUID()}`, platformUserId: sender, platformChannelId: "dm-sweep", content: "x", receivedAt })
        .returning({ id: inboundMessages.id });
      return r.id;
    };
    const stuck = await insert(ago(10 * 60 * 1000));
    const fresh = await insert(ago(60 * 1000));
    const ancient = await insert(ago(72 * HOUR));

    await runSweep(db, sweepDeps, new Date(), quiet);
    const ids_ = queued.filter((j) => j.name === "inbound").map((j) => j.data.inboundId);
    expect(ids_).toContain(stuck);
    expect(ids_).not.toContain(fresh);
    expect(ids_).not.toContain(ancient);

    // The next sweep in the same hour does not queue it again.
    await runSweep(db, sweepDeps, new Date(), quiet);
    expect(queued.filter((j) => j.data.inboundId === stuck)).toHaveLength(1);
  });

  it("re-queues the turn for a user message that never got a reply", async () => {
    const convId = await start();
    await appendUserMessage(db, convId, "Waiting for a reply");
    await ageMessages(convId, 10 * 60 * 1000);
    const web = await start(`web:${ids.reviewer}`, "web");
    await appendUserMessage(db, web, "Web message");
    await ageMessages(web, 10 * 60 * 1000);

    await runSweep(db, sweepDeps, new Date(), quiet);
    const turns = queued.filter((j) => j.name === "turn").map((j) => j.data.conversationId);
    expect(turns).toContain(convId);
    expect(turns).not.toContain(web);
  });

  it("re-queues analysis for a finished conversation that has answers but no result", async () => {
    const convId = await start();
    await appendUserMessage(db, convId, "An answer");
    await db.update(conversations).set({ status: "closed", closedAt: ago(10 * 60 * 1000) }).where(eq(conversations.id, convId));

    await runSweep(db, sweepDeps, new Date(), quiet);
    expect(analysis.some((a) => (a.data as { conversationId: string }).conversationId === convId)).toBe(true);

    // Once analysed, it is left alone.
    await runAnalysisPipeline(db, fakeLLM(), convId, quiet, process.env.ORG_ID);
    analysis.length = 0;
    await runSweep(db, sweepDeps, new Date(Date.now() + HOUR), quiet);
    expect(analysis.some((a) => (a.data as { conversationId: string }).conversationId === convId)).toBe(false);
  });

  it("expires a calendar job claimed by the scheduler but never used, once past its expiry", async () => {
    const [stuck] = await db
      .insert(checkinJobs)
      .values({ reviewerId: ids.reviewer, subjectId: ids.subject, interactionType: "peer_review", sensitivity: "low", status: "scheduled", source: "calendar_model", expiresAt: ago(HOUR) })
      .returning({ id: checkinJobs.id });
    const [live] = await db
      .insert(checkinJobs)
      .values({ reviewerId: ids.reviewer, subjectId: ids.reviewer, interactionType: "peer_review", sensitivity: "low", status: "scheduled", source: "calendar_model", expiresAt: new Date(Date.now() + HOUR) })
      .returning({ id: checkinJobs.id });
    await runSweep(db, sweepDeps, new Date(), quiet);
    const rows = await db.select({ id: checkinJobs.id, status: checkinJobs.status }).from(checkinJobs).where(inArray(checkinJobs.id, [stuck.id, live.id]));
    expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({ [stuck.id]: "expired", [live.id]: "scheduled" });
    await db.delete(checkinJobs).where(inArray(checkinJobs.id, [stuck.id, live.id]));
  });

  // ── Partial feedback ──────────────────────────────────

  it("analyses an incomplete conversation as partial, and leaves it out of engagement scores", async () => {
    const full = await start();
    await appendUserMessage(db, full, "A complete answer about Sam");
    await db.update(conversations).set({ status: "closed", closedAt: new Date() }).where(eq(conversations.id, full));
    await runAnalysisPipeline(db, fakeLLM(), full, quiet, process.env.ORG_ID);

    const partial = await start();
    await appendUserMessage(db, partial, "Half an answer");
    await markIncomplete(db, deps, partial);
    await runAnalysisPipeline(db, fakeLLM(), partial, quiet, process.env.ORG_ID);

    const entries = await db
      .select({ conversationId: feedbackEntries.conversationId, isPartial: feedbackEntries.isPartial })
      .from(feedbackEntries)
      .where(inArray(feedbackEntries.conversationId, [full, partial]));
    expect(Object.fromEntries(entries.map((e) => [e.conversationId, e.isPartial]))).toEqual({ [full]: false, [partial]: true });

    await recomputeWeeklyEngagement(db, ids.reviewer);
    const [score] = await db.select().from(engagementScores).where(eq(engagementScores.userId, ids.reviewer));
    // Only the complete one counts; but the week may already hold earlier
    // complete entries from this run, so compare against those.
    const completeThisWeek = await db
      .select({ id: feedbackEntries.id })
      .from(feedbackEntries)
      .where(and(eq(feedbackEntries.reviewerId, ids.reviewer), eq(feedbackEntries.isPartial, false)));
    expect(score.interactionsCompleted).toBe(completeThisWeek.length);
  });

  it("an incomplete self-reflection is saved as partial, not completed", async () => {
    const [c] = await db
      .insert(conversations)
      .values({
        reviewerId: ids.reviewer,
        subjectId: ids.reviewer,
        interactionType: "self_reflection",
        platform: "internal",
        platformChannelId: "dm-sweep",
        scheduledAt: new Date(),
        status: "incomplete",
        closedAt: new Date(),
      })
      .returning({ id: conversations.id });
    await db.insert(conversationMessages).values({ conversationId: c.id, role: "user", content: "Started to reflect" });
    const llm = {
      complete: async () => ({
        content: JSON.stringify({ mood: "tired", highlights: "Some", challenges: "", goalForNextWeek: "", engagementScore: 40 }),
        usage: { inputTokens: 1, outputTokens: 1 },
        model: "m",
        latencyMs: 1,
      }),
    } as unknown as LLMGateway;
    await runAnalysisPipeline(db, llm, c.id, quiet, process.env.ORG_ID);
    const [r] = await db.select().from(selfReflections).where(eq(selfReflections.conversationId, c.id));
    expect(r).toMatchObject({ status: "partial", completedAt: null });
  });
});
