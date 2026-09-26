import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import crypto from "node:crypto";
import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Queue } from "bullmq";
import {
  getTenantDb,
  users,
  conversations,
  conversationMessages,
  conversationThemeOutcomes,
  questionnaires,
  questionnaireThemes,
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

/**
 * Per-theme outcomes and the single-call turn (step 6, part 2) against a
 * real Postgres. Self-skips without a DB.
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

type Step = { quality: "answered" | "weak"; action: string; question?: string } | Error;

/** Opening questions are plain text; each turn plays the next scripted step. */
function scripted(steps: Step[], opening: string | Error = "Opening question?") {
  const calls: LLMCompletionRequest[] = [];
  const complete = async (req: LLMCompletionRequest) => {
    calls.push(req);
    if (!req.jsonMode) {
      if (opening instanceof Error) throw opening;
      return { content: opening, usage: { inputTokens: 1, outputTokens: 1 }, model: "m", latencyMs: 1 };
    }
    const step = steps.shift() ?? new Error("script exhausted");
    if (step instanceof Error) throw step;
    return { content: JSON.stringify({ question: "", ...step }), usage: { inputTokens: 1, outputTokens: 1 }, model: "m", latencyMs: 1 };
  };
  return { llm: { complete } as unknown as LLMGateway, calls };
}

describe.skipIf(!dbUp)("theme outcomes and single-call turns (integration)", () => {
  const ids = { reviewer: crypto.randomUUID(), subject: crypto.randomUUID() };
  const tag = ids.reviewer.slice(0, 8);
  let questionnaireId: string;
  const themeIds: string[] = [];
  let analysisQueue: Queue;

  const deps = (llm: LLMGateway): OrchestratorDeps => {
    const adapters = new AdapterRegistry();
    adapters.register(new InternalSimulatorAdapter());
    return { llm, adapters, analysisQueue };
  };

  async function begin(llm: LLMGateway, interactionType: "peer_review" | "self_reflection" = "self_reflection") {
    const res = await initiateConversation(db, deps(llm), {
      orgId: process.env.ORG_ID!,
      reviewerId: ids.reviewer,
      subjectId: interactionType === "self_reflection" ? ids.reviewer : ids.subject,
      interactionType,
      platform: "internal",
      channelId: `dm-${tag}`,
      questionnaireId,
    });
    if (res.status !== "started") throw new Error("not started");
    return res.conversationId;
  }

  async function outcomes(conversationId: string) {
    const rows = await db
      .select()
      .from(conversationThemeOutcomes)
      .where(eq(conversationThemeOutcomes.conversationId, conversationId));
    return themeIds
      .map((t) => rows.find((r) => r.themeId === t))
      .filter(Boolean)
      .map((r) => ({ outcome: r!.outcome, followUps: r!.followUpCount, asked: r!.questionText, by: r!.judgedBy, subjectId: r!.subjectId }));
  }
  const botMessages = async (conversationId: string) =>
    (
      await db
        .select({ role: conversationMessages.role, content: conversationMessages.content })
        .from(conversationMessages)
        .where(eq(conversationMessages.conversationId, conversationId))
        .orderBy(asc(conversationMessages.seq))
    )
      .filter((m) => m.role === "assistant")
      .map((m) => m.content);

  beforeAll(async () => {
    await db.insert(users).values([
      { id: ids.reviewer, email: `rev-${tag}@test.local`, name: "Rae" },
      { id: ids.subject, email: `sub-${tag}@test.local`, name: "Sam" },
    ]);
    // Self-reflection selects up to 3 themes, so all three are used.
    const [q] = await db.insert(questionnaires).values({ name: `outcomes-${tag}`, category: "self_reflection" }).returning();
    questionnaireId = q.id;
    const rows = await db
      .insert(questionnaireThemes)
      .values([
        { questionnaireId, intent: "Wins", dataGoal: "What went well", examplePhrasings: ["What went well this week?"], sortOrder: 0 },
        { questionnaireId, intent: "Blockers", dataGoal: "What got in the way", examplePhrasings: ["What got in your way?"], sortOrder: 1 },
        { questionnaireId, intent: "Next week", dataGoal: "Their focus", examplePhrasings: ["What will you focus on next week?"], sortOrder: 2 },
      ])
      .returning({ id: questionnaireThemes.id });
    themeIds.push(...rows.map((r) => r.id));
  });

  beforeEach(async () => {
    analysisQueue = { add: async () => {} } as unknown as Queue;
    await db
      .update(conversations)
      .set({ status: "closed", closedAt: new Date() })
      .where(eq(conversations.reviewerId, ids.reviewer));
  });

  afterAll(async () => {
    const convs = (await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.reviewerId, ids.reviewer))).map((c) => c.id);
    if (convs.length) await db.delete(conversations).where(inArray(conversations.id, convs)); // outcomes cascade
    await db.delete(questionnaires).where(eq(questionnaires.id, questionnaireId));
    await db.delete(users).where(inArray(users.id, Object.values(ids)));
  });

  it("records the first theme as asked, with the question as asked (encrypted at rest)", async () => {
    const convId = await begin(scripted([]).llm);
    expect(await outcomes(convId)).toEqual([
      { outcome: "unanswered", followUps: 0, asked: "Opening question?", by: null, subjectId: null },
    ]);
    const raw = (await db.execute(
      sql`select question_text from conversation_theme_outcomes where conversation_id = ${convId}`,
    )) as unknown as Array<{ question_text: string }>;
    expect(raw[0].question_text).toMatch(/^enc:v1:/);
  });

  it("judges each theme, and marks themes the conversation never reached unanswered", async () => {
    // Three exchanges at most: a follow-up on theme 1, a move to theme 2,
    // then the cap closes the conversation before theme 3 is asked.
    const { llm, calls } = scripted([
      { quality: "weak", action: "follow_up", question: "Could you give an example?" },
      { quality: "answered", action: "next_theme", question: "What got in your way this week?" },
      { quality: "answered", action: "next_theme", question: "Never asked?" },
    ]);
    const convId = await begin(llm);
    for (const text of ["ok", "Shipped the audit fix", "A flaky test suite"]) {
      await appendUserMessage(db, convId, text);
      await processTurn(db, deps(llm), convId);
    }

    // One call to open, then exactly one per turn.
    expect(calls).toHaveLength(4);
    expect(await botMessages(convId)).toEqual([
      expect.stringContaining("Opening question?"),
      "Could you give an example?",
      "What got in your way this week?",
      expect.stringMatching(/reflection/i), // closing message
    ]);
    expect(await outcomes(convId)).toEqual([
      { outcome: "answered", followUps: 1, asked: "Opening question?", by: "llm", subjectId: null },
      { outcome: "answered", followUps: 0, asked: "What got in your way this week?", by: "llm", subjectId: null },
      { outcome: "unanswered", followUps: 0, asked: null, by: null, subjectId: null },
    ]);
  });

  it("moving on records the next theme as asked, with its question", async () => {
    const { llm } = scripted([{ quality: "answered", action: "next_theme", question: "What slowed you down?" }]);
    const convId = await begin(llm);
    await appendUserMessage(db, convId, "Shipped the audit fix");
    await processTurn(db, deps(llm), convId);
    expect((await outcomes(convId)).slice(0, 2)).toEqual([
      { outcome: "answered", followUps: 0, asked: "Opening question?", by: "llm", subjectId: null },
      { outcome: "unanswered", followUps: 0, asked: "What slowed you down?", by: null, subjectId: null },
    ]);
  });

  it("an LLM outage mid-conversation moves on with the next theme's own wording", async () => {
    const outage = new Error("model down");
    const { llm } = scripted([outage, outage]);
    const convId = await begin(llm);
    await appendUserMessage(db, convId, "A long and specific answer about the release work we did together this week");
    expect(await processTurn(db, deps(llm), convId)).toEqual({ status: "replied" });

    expect((await botMessages(convId)).at(-1)).toBe("What got in your way?");
    expect((await outcomes(convId))[0]).toMatchObject({ outcome: "answered", by: "fallback" });
  });

  it("an LLM outage at the start still opens the conversation, with the theme as written", async () => {
    const convId = await begin(scripted([], new Error("model down")).llm);
    expect((await botMessages(convId))[0]).toContain("What went well this week?");
  });

  it("a conversation that goes quiet records every unreached theme", async () => {
    const convId = await begin(scripted([]).llm);
    await markIncomplete(db, deps(scripted([]).llm), convId);
    expect((await outcomes(convId)).map((o) => o.outcome)).toEqual(["unanswered", "unanswered", "unanswered"]);
  });

  it("an abandoned (superseded) turn records nothing", async () => {
    const { llm } = scripted([{ quality: "answered", action: "next_theme", question: "Next?" }]);
    const convId = await begin(llm);
    await appendUserMessage(db, convId, "First");
    const racing = {
      complete: async (req: LLMCompletionRequest) => {
        await appendUserMessage(db, convId, "Second, mid-turn");
        return llm.complete(req);
      },
    } as unknown as LLMGateway;
    expect(await processTurn(db, deps(racing), convId)).toEqual({ status: "superseded" });
    expect(await outcomes(convId)).toEqual([expect.objectContaining({ outcome: "unanswered", by: null })]);
  });

  it("peer reviews record the subject; self-reflections do not", async () => {
    const convId = await begin(scripted([]).llm, "peer_review");
    const [row] = await db.select().from(conversationThemeOutcomes).where(eq(conversationThemeOutcomes.conversationId, convId));
    expect(row.subjectId).toBe(ids.subject);
  });
});
