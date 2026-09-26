import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import {
  getTenantDb,
  users,
  conversations,
  conversationMessages,
  coreValues,
  feedbackEntries,
  feedbackValueScores,
  behavioralSignals,
  selfReflections,
  engagementScores,
} from "@revualy/db";
import type { LLMGateway, LLMCompletionRequest } from "@revualy/ai-core";
import { runAnalysisPipeline } from "../lib/analysis-pipeline.js";
import { replaceProfileSignals } from "../lib/profile-signal-store.js";

/**
 * Re-analysis after a late addition (step 5 review findings 2-4) against a
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
const quiet = { error: () => {}, warn: () => {}, info: () => {} };

/** Answers by prompt; any prompt whose key is in `fail` throws. */
function llm(answers: Record<string, string>, fail: string[] = []): LLMGateway {
  const complete = async (req: LLMCompletionRequest) => {
    const prompt = req.messages[0]?.content ?? "";
    if (fail.some((k) => prompt.includes(k))) throw new Error("LLM outage");
    const key = Object.keys(answers).find((k) => prompt.includes(k));
    return { content: key ? answers[key] : "neutral", usage: { inputTokens: 1, outputTokens: 1 }, model: "m", latencyMs: 1 };
  };
  return { complete } as unknown as LLMGateway;
}

describe.skipIf(!dbUp)("re-analysis after a late addition (integration)", () => {
  const ids = { reviewer: crypto.randomUUID(), subject: crypto.randomUUID() };
  const tag = ids.reviewer.slice(0, 8);
  let valueId: string;

  async function conversation(interactionType: string, subjectId: string, texts: string[]) {
    const [c] = await db
      .insert(conversations)
      .values({
        reviewerId: ids.reviewer,
        subjectId,
        interactionType,
        platform: "internal",
        platformChannelId: "t",
        scheduledAt: new Date(),
        status: "closed",
        closedAt: new Date(),
      })
      .returning({ id: conversations.id });
    await db.insert(conversationMessages).values(texts.map((content) => ({ conversationId: c.id, role: "user", content })));
    return c.id;
  }
  const addLate = (conversationId: string, content: string) =>
    db.insert(conversationMessages).values({ conversationId, role: "user", content });

  beforeAll(async () => {
    await db.insert(users).values([
      { id: ids.reviewer, email: `rev-${tag}@test.local`, name: "Rae" },
      { id: ids.subject, email: `sub-${tag}@test.local`, name: "Sam" },
    ]);
    const [v] = await db
      .insert(coreValues)
      .values({ name: `Ownership ${tag}`, description: "Takes ownership" })
      .returning({ id: coreValues.id });
    valueId = v.id;
  });

  afterAll(async () => {
    const convs = (
      await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.reviewerId, ids.reviewer))
    ).map((c) => c.id);
    const entries = convs.length
      ? (await db.select({ id: feedbackEntries.id }).from(feedbackEntries).where(inArray(feedbackEntries.conversationId, convs))).map((e) => e.id)
      : [];
    if (entries.length) {
      await db.delete(behavioralSignals).where(inArray(behavioralSignals.sourceId, [...entries, ...convs]));
      await db.delete(feedbackValueScores).where(inArray(feedbackValueScores.feedbackEntryId, entries));
    }
    if (convs.length) {
      await db.delete(feedbackEntries).where(inArray(feedbackEntries.conversationId, convs));
      await db.delete(selfReflections).where(eq(selfReflections.userId, ids.reviewer));
      await db.delete(conversations).where(inArray(conversations.id, convs));
    }
    await db.delete(engagementScores).where(inArray(engagementScores.userId, Object.values(ids)));
    await db.delete(coreValues).where(eq(coreValues.id, valueId));
    await db.delete(users).where(inArray(users.id, Object.values(ids)));
  });

  it("a step that fails on re-analysis keeps its earlier result", async () => {
    const convId = await conversation("peer_review", ids.subject, ["Sam owned the release end to end"]);
    const good = llm({
      Summarize: "Sam owned the release.",
      "Map this feedback": JSON.stringify([{ id: valueId, score: 0.9, evidence: "owned the release" }]),
    });
    await runAnalysisPipeline(db, good, convId, quiet, process.env.ORG_ID);

    await addLate(convId, "Also fixed the flaky tests");
    const result = await runAnalysisPipeline(db, llm({}, ["Summarize", "Map this feedback"]), convId, quiet, process.env.ORG_ID);
    expect(result.failedSteps).toEqual(expect.arrayContaining(["summary", "values"]));

    const [entry] = await db.select().from(feedbackEntries).where(eq(feedbackEntries.conversationId, convId));
    expect(entry.rawContent).toContain("flaky tests"); // the late addition is in
    expect(entry.aiSummary).toBe("Sam owned the release."); // not wiped to ""
    const scores = await db.select().from(feedbackValueScores).where(eq(feedbackValueScores.feedbackEntryId, entry.id));
    expect(scores).toHaveLength(1); // not deleted
  });

  it("re-extracting signals for a re-analysed entry replaces them instead of adding", async () => {
    const convId = await conversation("peer_review", ids.subject, [
      // Enough keywords for the extractor: data/evidence (analysis) and next step (action).
      "Sam based on the data and evidence set a clear next step, looking back in hindsight with lessons learned",
    ]);
    await runAnalysisPipeline(db, llm({}), convId, quiet, process.env.ORG_ID);
    const [entry] = await db.select({ id: feedbackEntries.id }).from(feedbackEntries).where(eq(feedbackEntries.conversationId, convId));

    const first = await replaceProfileSignals(db, entry.id);
    await replaceProfileSignals(db, entry.id);
    const rows = await db.select().from(behavioralSignals).where(eq(behavioralSignals.sourceId, convId));
    expect(first).toBeGreaterThan(0);
    expect(rows).toHaveLength(first!);
  });

  describe("self-reflections", () => {
    const extraction = (highlights: string) =>
      llm({
        "self-reflection conversation": JSON.stringify({
          mood: "focused",
          highlights,
          challenges: "",
          goalForNextWeek: "Ship it",
          engagementScore: 70,
        }),
      });

    it("a late addition updates a reflection that only the analysis had completed", async () => {
      const convId = await conversation("self_reflection", ids.reviewer, ["Good week"]);
      await runAnalysisPipeline(db, extraction("A good week"), convId, quiet, process.env.ORG_ID);
      await addLate(convId, "And I finally closed the audit");
      await runAnalysisPipeline(db, extraction("A good week; closed the audit"), convId, quiet, process.env.ORG_ID);

      const [r] = await db.select().from(selfReflections).where(eq(selfReflections.conversationId, convId));
      expect(r.highlights).toBe("A good week; closed the audit");
      await db.delete(selfReflections).where(eq(selfReflections.id, r.id));
    });

    it("never overwrites what the person wrote, only fills what they left empty", async () => {
      const convId = await conversation("self_reflection", ids.reviewer, ["Busy week"]);
      await runAnalysisPipeline(db, extraction("AI highlights"), convId, quiet, process.env.ORG_ID);
      const [r] = await db.select().from(selfReflections).where(eq(selfReflections.conversationId, convId));
      // The person completes it themselves, leaving the goal empty.
      await db
        .update(selfReflections)
        .set({ mood: "tired", highlights: "My own words", goalForNextWeek: null, personEditedAt: new Date() })
        .where(eq(selfReflections.id, r.id));

      await addLate(convId, "One more thing");
      await runAnalysisPipeline(db, extraction("AI highlights v2"), convId, quiet, process.env.ORG_ID);

      const [after] = await db.select().from(selfReflections).where(eq(selfReflections.id, r.id));
      expect(after).toMatchObject({ mood: "tired", highlights: "My own words", goalForNextWeek: "Ship it" });
    });
  });
});
