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
  interactionSchedule,
  userPlatformIdentities,
  identityLinkEvents,
} from "@revualy/db";
import type { LLMGateway, LLMCompletionRequest } from "@revualy/ai-core";
import { AdapterRegistry } from "@revualy/chat-core";
import { InternalSimulatorAdapter } from "../lib/internal-simulator-adapter.js";
import {
  appendUserMessage,
  deliverOutbox,
  initiateConversation,
  processTurn,
  replyInProcess,
  type OrchestratorDeps,
} from "../lib/conversation-orchestrator.js";
import { handleInbound, parseKeyword, TEXT, type InboundDeps } from "../lib/inbound-router.js";

/**
 * The step 5 conversation engine against a real Postgres, with no Redis at
 * all: routing matrix, bursts, supersede, concurrent turns, outbox retry,
 * duplicate delivery and idempotent initiation. Self-skips without a DB.
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

/** Records sends; can be told to fail the next N sends. */
class FakeChat extends InternalSimulatorAdapter {
  sent: Array<{ channelId: string; text: string }> = [];
  failNext = 0;
  async sendMessage(message: Parameters<InternalSimulatorAdapter["sendMessage"]>[0]) {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error("platform down");
    }
    this.sent.push({ channelId: message.channelId, text: message.text });
    return "ok";
  }
}

/**
 * Scripted LLM. The opening question is plain text; each turn is one JSON
 * plan (`decision` is the action it proposes). `onQuestion` runs during
 * the call, so a test can make something happen "while the LLM is thinking".
 */
function scriptedLLM() {
  const state = {
    decision: "follow_up" as string,
    questionCalls: 0,
    onQuestion: undefined as undefined | (() => Promise<void>),
  };
  const complete = async (req: LLMCompletionRequest) => {
    state.questionCalls++;
    const hook = state.onQuestion;
    state.onQuestion = undefined;
    if (hook) await hook();
    const question = `Question ${state.questionCalls}?`;
    const content = req.jsonMode ? JSON.stringify({ quality: "answered", action: state.decision, question }) : question;
    return { content, usage: { inputTokens: 1, outputTokens: 1 }, model: "m", latencyMs: 1 };
  };
  return { llm: { complete } as unknown as LLMGateway, state };
}

describe.skipIf(!dbUp)("conversation engine (integration)", () => {
  const ids = { reviewer: crypto.randomUUID(), subject: crypto.randomUUID(), manual: crypto.randomUUID() };
  const tag = ids.reviewer.slice(0, 8);
  const sender = `users/sim-${tag}`;
  const manualSender = `users/manual-${tag}`;
  let questionnaireId: string;

  let chat: FakeChat;
  let script: ReturnType<typeof scriptedLLM>;
  let analysis: Array<{ data: unknown; jobId?: string }>;
  let turns: Array<{ conversationId: string; seq: number; truncated: boolean }>;
  let deps: OrchestratorDeps;
  let inboundDeps: InboundDeps;

  const convIdsFor = async () =>
    (await db.select({ id: conversations.id }).from(conversations).where(inArray(conversations.reviewerId, [ids.reviewer, ids.manual]))).map(
      (c) => c.id,
    );

  async function start(extra: Partial<Parameters<typeof initiateConversation>[2]> = {}) {
    // Web conversations are answered in the HTTP response, never via an adapter.
    const opts = extra.platform === "web" ? { deliveredByCaller: true } : {};
    const res = await initiateConversation(db, deps, {
      orgId: process.env.ORG_ID!,
      reviewerId: ids.reviewer,
      subjectId: ids.subject,
      interactionType: "peer_review",
      platform: "internal",
      channelId: "dm-rev",
      questionnaireId,
      ...extra,
    }, opts);
    if (res.status !== "started") throw new Error("expected a new conversation");
    return res.conversationId;
  }

  async function messages(conversationId: string) {
    return db
      .select({ role: conversationMessages.role, content: conversationMessages.content, deliveredAt: conversationMessages.deliveredAt })
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversationId))
      .orderBy(asc(conversationMessages.seq));
  }

  async function inbound(text: string, from = sender) {
    const [row] = await db
      .insert(inboundMessages)
      .values({
        platform: "internal",
        platformMessageId: `m-${crypto.randomUUID()}`,
        platformUserId: from,
        platformChannelId: "dm-rev",
        content: text,
      })
      .returning({ id: inboundMessages.id });
    return row.id;
  }

  async function closeAll() {
    await db
      .update(conversations)
      .set({ status: "closed", closedAt: new Date() })
      .where(inArray(conversations.reviewerId, [ids.reviewer, ids.manual]));
  }

  beforeAll(async () => {
    await db.insert(users).values([
      { id: ids.reviewer, email: `rev-${tag}@test.local`, name: "Rae Reviewer" },
      { id: ids.subject, email: `sub-${tag}@test.local`, name: "Sam Subject" },
      { id: ids.manual, email: `man-${tag}@test.local`, name: "Manny Manual" },
    ]);
    const [q] = await db
      .insert(questionnaires)
      .values({ name: `engine-${tag}`, category: "peer_review" })
      .returning({ id: questionnaires.id });
    questionnaireId = q.id;
    await db.insert(questionnaireThemes).values([
      { questionnaireId, intent: "Collaboration", dataGoal: "How they collaborate", sortOrder: 0 },
      { questionnaireId, intent: "Growth", dataGoal: "Where they could grow", sortOrder: 1 },
    ]);
    await db.insert(userPlatformIdentities).values([
      { userId: ids.reviewer, platform: "internal", platformUserId: sender, dmAddress: "dm-rev", status: "reachable", linkSource: "auto", confirmedAt: new Date() },
      // A manual link the person has not confirmed yet.
      { userId: ids.manual, platform: "internal", platformUserId: manualSender, dmAddress: "dm-man", status: "reachable", linkSource: "admin" },
    ]);
  });

  beforeEach(async () => {
    chat = new FakeChat();
    const adapters = new AdapterRegistry();
    adapters.register(chat);
    script = scriptedLLM();
    analysis = [];
    turns = [];
    const analysisQueue = {
      add: async (_name: string, data: unknown, opts?: { jobId?: string }) => {
        // Mirror BullMQ: a repeated job id is ignored.
        if (opts?.jobId && analysis.some((a) => a.jobId === opts.jobId)) return;
        analysis.push({ data, jobId: opts?.jobId });
      },
    } as unknown as Queue;
    deps = { llm: script.llm, adapters, analysisQueue };
    inboundDeps = {
      ...deps,
      scheduleTurn: async (conversationId, seq, truncated) => {
        turns.push({ conversationId, seq, truncated });
      },
    };
    await closeAll();
    await db.update(users).set({ preferences: {} }).where(eq(users.id, ids.reviewer));
  });

  afterAll(async () => {
    const convs = await convIdsFor();
    await db.delete(inboundMessages).where(inArray(inboundMessages.platformUserId, [sender, manualSender]));
    if (convs.length) await db.delete(conversations).where(inArray(conversations.id, convs));
    await db.delete(interactionSchedule).where(eq(interactionSchedule.userId, ids.reviewer));
    await db.delete(identityLinkEvents).where(inArray(identityLinkEvents.userId, Object.values(ids)));
    await db.delete(userPlatformIdentities).where(inArray(userPlatformIdentities.userId, Object.values(ids)));
    await db.delete(questionnaires).where(eq(questionnaires.id, questionnaireId));
    await db.delete(users).where(inArray(users.id, Object.values(ids)));
  });

  // ── Starting ─────────────────────────────────────────

  describe("initiation", () => {
    it("stores and delivers the opening message", async () => {
      const convId = await start();
      const msgs = await messages(convId);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].role).toBe("assistant");
      expect(msgs[0].deliveredAt).not.toBeNull();
      expect(chat.sent).toHaveLength(1);
      expect(chat.sent[0].channelId).toBe("dm-rev");
    });

    it("is idempotent per schedule entry: a retried job creates nothing new", async () => {
      const [entry] = await db
        .insert(interactionSchedule)
        .values({ userId: ids.reviewer, scheduledAt: new Date(), interactionType: "peer_review", subjectId: ids.subject })
        .returning({ id: interactionSchedule.id });
      const first = await start({ scheduleEntryId: entry.id });
      const retry = await initiateConversation(db, deps, {
        orgId: process.env.ORG_ID!,
        reviewerId: ids.reviewer,
        subjectId: ids.subject,
        interactionType: "peer_review",
        platform: "internal",
        channelId: "dm-rev",
        questionnaireId,
        scheduleEntryId: entry.id,
      });
      expect(retry).toEqual({ status: "started", conversationId: first, created: false });
      expect(chat.sent).toHaveLength(1);
      expect(script.state.questionCalls).toBe(1);
    });

    it("re-sends an undelivered opening message on retry, without a new LLM call", async () => {
      const [entry] = await db
        .insert(interactionSchedule)
        .values({ userId: ids.reviewer, scheduledAt: new Date(), interactionType: "peer_review", subjectId: ids.subject })
        .returning({ id: interactionSchedule.id });
      chat.failNext = 1;
      await expect(start({ scheduleEntryId: entry.id })).rejects.toThrow(/platform down/);
      const convId = await start({ scheduleEntryId: entry.id });
      expect(chat.sent).toHaveLength(1);
      expect(script.state.questionCalls).toBe(1);
      expect((await messages(convId))[0].deliveredAt).not.toBeNull();
    });

    async function scheduledStart() {
      return initiateConversation(db, deps, {
        orgId: process.env.ORG_ID!,
        reviewerId: ids.reviewer,
        subjectId: ids.subject,
        interactionType: "peer_review",
        platform: "internal",
        channelId: "dm-rev",
        questionnaireId,
        scheduled: true,
      });
    }

    it("skips a scheduled check-in while one is still open on that platform", async () => {
      const open = await start();
      expect(await scheduledStart()).toEqual({ status: "skipped", reason: "open_conversation", openConversationId: open });
    });

    it("an open web conversation (demo, reflection) does not block a chat check-in", async () => {
      await start({ platform: "web", channelId: `web:${ids.reviewer}` });
      expect(await scheduledStart()).toMatchObject({ status: "started" });
    });

    it("re-checks at send time: someone who said stop after scheduling is not messaged", async () => {
      await db.update(users).set({ preferences: { chatPaused: true } }).where(eq(users.id, ids.reviewer));
      expect(await scheduledStart()).toEqual({ status: "skipped", reason: "paused" });
      await db.update(users).set({ preferences: {}, isActive: false }).where(eq(users.id, ids.reviewer));
      expect(await scheduledStart()).toEqual({ status: "skipped", reason: "inactive" });
      await db.update(users).set({ isActive: true }).where(eq(users.id, ids.reviewer));
      expect(chat.sent).toHaveLength(0);
    });
  });

  // ── Routing ──────────────────────────────────────────

  describe("inbound routing", () => {
    it("routes a reply to the open conversation and queues its turn", async () => {
      const convId = await start();
      const res = await handleInbound(db, inboundDeps, await inbound("Sam ran a great retro"));
      expect(res).toEqual({ status: "processed", outcome: "conversation_reply", conversationId: convId });
      expect(turns).toHaveLength(1);
      expect(turns[0].conversationId).toBe(convId);
      const msgs = await messages(convId);
      expect(msgs.at(-1)).toMatchObject({ role: "user", content: "Sam ran a great retro" });
    });

    it("keeps the platform's send time as evidence, without using it for order", async () => {
      const convId = await start();
      const platformTime = new Date("2026-01-01T09:14:00Z");
      const id = await inbound("Sent a while ago");
      await db.update(inboundMessages).set({ sentAt: platformTime }).where(eq(inboundMessages.id, id));
      await handleInbound(db, inboundDeps, id);
      const [row] = await db
        .select({ sentAt: conversationMessages.sentAt, createdAt: conversationMessages.createdAt })
        .from(conversationMessages)
        .where(and(eq(conversationMessages.conversationId, convId), eq(conversationMessages.role, "user")));
      expect(row.sentAt?.toISOString()).toBe(platformTime.toISOString());
      // Still ordered after the bot's opening message, whatever the platform clock said.
      expect((await messages(convId)).map((m) => m.role)).toEqual(["assistant", "user"]);
    });

    it("never routes a chat message into an open web conversation", async () => {
      const web = await start({ platform: "web", channelId: `web:${ids.reviewer}` });
      const res = await handleInbound(db, inboundDeps, await inbound("From the simulator"));
      expect(res).toMatchObject({ status: "processed" });
      expect((res as { conversationId?: string }).conversationId).not.toBe(web);
      expect((await messages(web)).map((m) => m.role)).toEqual(["assistant"]);
    });

    it("a redelivered job neither duplicates the message nor loses its turn", async () => {
      const convId = await start();
      const id = await inbound("Once only");
      await handleInbound(db, inboundDeps, id);
      // Simulate a crash after the append but before the row was marked.
      await db.update(inboundMessages).set({ status: "pending" }).where(eq(inboundMessages.id, id));
      await handleInbound(db, inboundDeps, id);
      expect((await messages(convId)).filter((m) => m.role === "user")).toHaveLength(1);
      expect(turns).toHaveLength(2);
      expect(turns[1].seq).toBe(turns[0].seq); // same job id, deduped by the queue
      expect(await handleInbound(db, inboundDeps, id)).toEqual({ status: "already_processed" });
    });

    it("tells an unknown sender how to get access", async () => {
      const res = await handleInbound(db, inboundDeps, await inbound("hello?", `users/stranger-${tag}`));
      expect(res).toMatchObject({ outcome: "unknown_sender" });
      expect(chat.sent.at(-1)?.text).toBe(TEXT.unknownSender);
      await db.delete(inboundMessages).where(eq(inboundMessages.platformUserId, `users/stranger-${tag}`));
    });

    it("asks a manually linked person to confirm, and a yes confirms", async () => {
      const first = await handleInbound(db, inboundDeps, await inbound("hi", manualSender));
      expect(first).toMatchObject({ outcome: "identity_confirmation" });
      expect(chat.sent.at(-1)?.text).toMatch(/linked this chat account to Manny Manual .*reply yes or no/);

      await handleInbound(db, inboundDeps, await inbound("Yes!", manualSender));
      expect(chat.sent.at(-1)?.text).toBe(TEXT.confirmYes);
      const [identity] = await db.select().from(userPlatformIdentities).where(eq(userPlatformIdentities.platformUserId, manualSender));
      expect(identity.confirmedAt).not.toBeNull();
      const events = await db.select().from(identityLinkEvents).where(eq(identityLinkEvents.userId, ids.manual));
      expect(events.map((e) => e.action)).toContain("confirm");

      // Confirmed now, so the next message is routed normally.
      const next = await handleInbound(db, inboundDeps, await inbound("help", manualSender));
      expect(next).toMatchObject({ outcome: "keyword" });
    });

    it("stop pauses and start resumes, without touching other preferences", async () => {
      await db.update(users).set({ preferences: { weeklyInteractionTarget: 3 } }).where(eq(users.id, ids.reviewer));
      await handleInbound(db, inboundDeps, await inbound(" STOP ", sender));
      expect(chat.sent.at(-1)?.text).toBe(TEXT.stop);
      let [u] = await db.select({ p: users.preferences }).from(users).where(eq(users.id, ids.reviewer));
      expect(u.p).toMatchObject({ chatPaused: true, weeklyInteractionTarget: 3 });

      // While paused, with nothing recent to attach it to, a stray message is
      // stored and answered honestly. (A recent conversation would take it as
      // a late addition: pausing stops new check-ins, not old ones.)
      await db
        .update(conversations)
        .set({ closedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) })
        .where(eq(conversations.reviewerId, ids.reviewer));
      const stray = await handleInbound(db, inboundDeps, await inbound("anything", sender));
      expect(stray).toMatchObject({ outcome: "paused" });
      expect(chat.sent.at(-1)?.text).toBe(TEXT.pausedNote);

      await handleInbound(db, inboundDeps, await inbound("start", sender));
      [u] = await db.select({ p: users.preferences }).from(users).where(eq(users.id, ids.reviewer));
      expect(u.p).toMatchObject({ chatPaused: false, weeklyInteractionTarget: 3 });
    });

    it("adds a late message to a conversation finished within 7 days and re-analyses it", async () => {
      const convId = await start();
      await closeAll();
      const id = await inbound("Oh, and Sam mentored the new starter");
      const res = await handleInbound(db, inboundDeps, id);
      expect(res).toEqual({ status: "processed", outcome: "late_addition", conversationId: convId });
      expect(chat.sent.at(-1)?.text).toBe("Thanks, I've added that to your feedback on Sam Subject.");
      expect((await messages(convId)).at(-1)).toMatchObject({ role: "user", content: "Oh, and Sam mentored the new starter" });
      expect(analysis).toHaveLength(1);
      expect(analysis[0].data).toMatchObject({ conversationId: convId });
      expect(turns).toHaveLength(0);
    });

    it("says so honestly when there is nothing to attach a message to", async () => {
      const convId = await start();
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await db.update(conversations).set({ status: "closed", closedAt: eightDaysAgo }).where(eq(conversations.id, convId));
      const res = await handleInbound(db, inboundDeps, await inbound("Random thought"));
      expect(res).toMatchObject({ outcome: "no_open_conversation" });
      expect(chat.sent.at(-1)?.text).toBe(TEXT.noOpenConversation);
    });

    it("recognises keywords exactly, not inside sentences", () => {
      expect(parseKeyword("Help.")).toBe("help");
      expect(parseKeyword("stop!")).toBe("stop");
      expect(parseKeyword("please stop asking")).toBeNull();
      expect(parseKeyword("started a new project")).toBeNull();
    });
  });

  // ── Turns ────────────────────────────────────────────

  describe("turns", () => {
    it("answers a reply once, stored and delivered", async () => {
      const convId = await start();
      await appendUserMessage(db, convId, "Great in standups");
      expect(await processTurn(db, deps, convId)).toEqual({ status: "replied" });
      const msgs = await messages(convId);
      expect(msgs.map((m) => m.role)).toEqual(["assistant", "user", "assistant"]);
      expect(msgs.every((m) => m.role === "user" || m.deliveredAt)).toBe(true);
      // A second job for the same message finds nothing to answer.
      expect(await processTurn(db, deps, convId)).toEqual({ status: "nothing_pending" });
    });

    it("answers a burst of messages with one reply", async () => {
      const convId = await start();
      const a = await appendUserMessage(db, convId, "Sam's great");
      const b = await appendUserMessage(db, convId, "especially in standups");
      expect(a.status).toBe("appended");
      expect(b.status).toBe("appended");
      // Both turn jobs run; only one reply results.
      const results = [await processTurn(db, deps, convId), await processTurn(db, deps, convId)];
      expect(results.map((r) => r.status)).toEqual(["replied", "nothing_pending"]);
      expect((await messages(convId)).filter((m) => m.role === "assistant")).toHaveLength(2);
    });

    it("abandons its draft when another message arrives mid-turn, and the next turn answers both", async () => {
      const convId = await start();
      await appendUserMessage(db, convId, "First thought");
      script.state.onQuestion = async () => {
        await appendUserMessage(db, convId, "Second thought");
      };
      expect(await processTurn(db, deps, convId)).toEqual({ status: "superseded" });
      expect((await messages(convId)).filter((m) => m.role === "assistant")).toHaveLength(1);

      expect(await processTurn(db, deps, convId)).toEqual({ status: "replied" });
      const msgs = await messages(convId);
      expect(msgs.map((m) => m.role)).toEqual(["assistant", "user", "user", "assistant"]);
    });

    it("commits exactly one reply when two workers take the same turn at once", async () => {
      const convId = await start();
      await appendUserMessage(db, convId, "Concurrent");
      const results = await Promise.all([processTurn(db, deps, convId), processTurn(db, deps, convId)]);
      expect(results.map((r) => r.status).sort()).toEqual(["lost_race", "replied"]);
      expect((await messages(convId)).filter((m) => m.role === "assistant")).toHaveLength(2);
      const [conv] = await db.select({ turn: conversations.turn }).from(conversations).where(eq(conversations.id, convId));
      expect(conv.turn).toBe(1);
    });

    it("keeps a failed send in the outbox and retries it without another LLM call", async () => {
      const convId = await start();
      await appendUserMessage(db, convId, "Reply");
      chat.failNext = 1;
      await expect(processTurn(db, deps, convId)).rejects.toThrow(/platform down/);
      const pending = (await messages(convId)).filter((m) => m.role === "assistant" && !m.deliveredAt);
      expect(pending).toHaveLength(1);

      const callsBefore = script.state.questionCalls;
      expect(await processTurn(db, deps, convId)).toEqual({ status: "nothing_pending" });
      expect(script.state.questionCalls).toBe(callsBefore);
      expect(chat.sent.at(-1)?.text).toBe(pending[0].content);
      expect((await messages(convId)).every((m) => m.role === "user" || m.deliveredAt)).toBe(true);
    });

    it("closes at the message cap and queues analysis once", async () => {
      const convId = await start();
      script.state.decision = "close";
      await appendUserMessage(db, convId, "That's all");
      expect(await processTurn(db, deps, convId)).toEqual({ status: "closed" });
      const [conv] = await db.select().from(conversations).where(eq(conversations.id, convId));
      expect(conv.status).toBe("closed");
      expect(conv.closedAt).not.toBeNull();
      expect(analysis).toHaveLength(1);
      expect(await appendUserMessage(db, convId, "late")).toEqual({ status: "not_open" });
    });

    it("re-queues analysis when a retried closing turn finds the conversation already closed", async () => {
      const convId = await start();
      script.state.decision = "close";
      await appendUserMessage(db, convId, "That's all");
      const failingQueue = { add: async () => { throw new Error("redis blip"); } } as unknown as Queue;
      await expect(processTurn(db, { ...deps, analysisQueue: failingQueue }, convId)).rejects.toThrow(/redis blip/);
      expect(analysis).toHaveLength(0);

      // The job retries: the close already committed, and analysis is queued now.
      expect(await processTurn(db, deps, convId)).toEqual({ status: "not_open" });
      expect(analysis).toHaveLength(1);
      expect(analysis[0].jobId).toContain(convId);
      // Any further retry is the same job id, so nothing new is queued.
      await processTurn(db, deps, convId);
      expect(analysis).toHaveLength(1);
    });

    it("two workers delivering the same conversation send each message exactly once", async () => {
      const convId = await start();
      await appendUserMessage(db, convId, "Reply");
      chat.failNext = 1;
      await expect(processTurn(db, deps, convId)).rejects.toThrow(/platform down/);
      chat.sent = [];

      // A slow platform, so both deliveries overlap.
      const send = chat.sendMessage.bind(chat);
      chat.sendMessage = async (m) => {
        await new Promise((r) => setTimeout(r, 100));
        return send(m);
      };
      const counts = await Promise.all([deliverOutbox(db, deps, convId), deliverOutbox(db, deps, convId)]);
      expect(counts.sort()).toEqual([0, 1]);
      expect(chat.sent).toHaveLength(1);
    });

    it("runs a whole conversation from Postgres alone (no Redis state anywhere)", async () => {
      const convId = await start();
      // Fresh deps per turn: nothing survives between turns except the DB.
      // A peer review allows three exchanges, then closes (seven messages).
      const statuses: string[] = [];
      for (const text of ["One", "Two", "Three"]) {
        const fresh = { ...deps };
        await appendUserMessage(db, convId, text);
        statuses.push((await processTurn(db, fresh, convId)).status);
      }
      expect(statuses).toEqual(["replied", "replied", "closed"]);
      const [conv] = await db.select().from(conversations).where(eq(conversations.id, convId));
      expect(conv).toMatchObject({ turn: 3, status: "closed", messageCount: 7 });
      expect((await messages(convId)).map((m) => m.role)).toEqual(["assistant", "user", "assistant", "user", "assistant", "user", "assistant"]);
    });

    it("in-process replies (web demo) return the bot's answer without any adapter", async () => {
      const res = await initiateConversation(
        db,
        { ...deps, adapters: new AdapterRegistry() },
        {
          orgId: process.env.ORG_ID!,
          reviewerId: ids.reviewer,
          subjectId: ids.subject,
          interactionType: "peer_review",
          platform: "internal",
          channelId: "web:demo",
          questionnaireId,
        },
        { deliveredByCaller: true },
      );
      if (res.status !== "started") throw new Error("not started");
      const out = await replyInProcess(db, { ...deps, adapters: new AdapterRegistry() }, res.conversationId, "Hi", {
        deliveredByCaller: true,
      });
      expect(out.status).toBe("ok");
      if (out.status === "ok") expect(out.reply).toMatch(/^Question \d+\?$/);
      expect(chat.sent).toHaveLength(0);
      const undelivered = await db
        .select()
        .from(conversationMessages)
        .where(and(eq(conversationMessages.conversationId, res.conversationId), sql`delivered_at is null and role = 'assistant'`));
      expect(undelivered).toHaveLength(0);
    });
  });
});
