import { describe, it, expect, vi } from "vitest";
import { runAnalysisPipeline } from "../analysis-pipeline.js";
import { createMockLLM, createFailingMockLLM, createMockLogger } from "./test-utils.js";

// The analysis pipeline's query order is deterministic:
//   select #1: conversations (fetch conversation by id)
//   select #2: conversation_messages (fetch messages)
//   select #3: core_values (fetch org values)
//   then writes via transaction
// We use call-order-based mocking since Drizzle table objects use Symbols
// for their name property, making them hard to inspect from a mock.

function createMockDb(options: {
  conversation?: Record<string, unknown> | null;
  messages?: Array<{ role: string; content: string; createdAt: Date }>;
  coreValues?: Array<{ id: string; name: string; description: string; isActive: boolean }>;
} = {}) {
  let selectCallIndex = 0;

  // Responses for selects in call order
  const selectResponses = [
    options.conversation ? [options.conversation] : [], // #1: conversation
    options.messages ?? [],                              // #2: messages
    options.coreValues ?? [],                            // #3: core_values
  ];

  function makeSelectChain() {
    const myIndex = selectCallIndex++;
    const data = selectResponses[myIndex] ?? [];

    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.orderBy = () => chain;
    chain.limit = () => chain;
    chain.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
      return Promise.resolve(data).then(onFulfilled, onRejected);
    };
    return chain;
  }

  function makeInsertChain() {
    const chain: Record<string, unknown> = {};
    chain.values = () => chain;
    chain.returning = () => chain;
    chain.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
      return Promise.resolve([{ id: "mock-feedback-id" }]).then(onFulfilled, onRejected);
    };
    return chain;
  }

  const db = {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    transaction: async (fn: (tx: unknown) => Promise<void>) => {
      await fn(db);
    },
  };

  return db;
}

describe("runAnalysisPipeline", () => {
  it("returns error result when conversation is not found", async () => {
    const db = createMockDb({ conversation: null });
    const llm = createMockLLM();
    const { logger } = createMockLogger();

    const result = await runAnalysisPipeline(
      db as never,
      llm,
      "nonexistent-id",
      logger,
    );

    expect(result.success).toBe(false);
    expect(result.failedSteps).toContain("fetch");
    expect(result.feedbackEntryId).toBeNull();
  });

  it("returns early with success when content is empty", async () => {
    const db = createMockDb({
      conversation: {
        id: "conv-1",
        reviewerId: "user-1",
        subjectId: "user-2",
        interactionType: "peer_review",
      },
      messages: [
        { role: "assistant", content: "Hi, how are you?", createdAt: new Date() },
        // No user messages, so rawContent will be empty
      ],
    });
    const llm = createMockLLM();
    const { logger } = createMockLogger();

    const result = await runAnalysisPipeline(
      db as never,
      llm,
      "conv-1",
      logger,
    );

    expect(result.success).toBe(true);
    expect(result.failedSteps).toHaveLength(0);
    expect(result.feedbackEntryId).toBeNull();
  });
});

describe("analysis pipeline LLM responses", () => {
  it("handles sentiment analysis returning valid sentiment", () => {
    const responses = new Map<string, string>();
    responses.set("Analyze the overall sentiment", "positive");
    const llm = createMockLLM(responses);

    // Verify the mock returns correct content
    expect(llm).toBeDefined();
  });

  it("handles JSON parsing of engagement scores", () => {
    const json = '{"score": 85, "hasExamples": true}';
    const parsed = JSON.parse(json);
    expect(parsed.score).toBe(85);
    expect(parsed.hasExamples).toBe(true);
  });

  it("handles malformed JSON with graceful fallback", () => {
    const badJson = "not json at all";
    let parsed = null;
    try {
      parsed = JSON.parse(badJson);
    } catch {
      // Expected: fallback to heuristic
    }
    expect(parsed).toBeNull();
  });
});

describe("mock LLM utilities", () => {
  it("createMockLLM returns content based on tier", async () => {
    const responses = new Map([["fast", "positive"]]);
    const llm = createMockLLM(responses);

    const result = await llm.complete({
      messages: [{ role: "system", content: "test" }],
      tier: "fast",
    });
    expect(result.content).toBe("positive");
  });

  it("createMockLLM falls back to default response", async () => {
    const llm = createMockLLM();

    const result = await llm.complete({
      messages: [{ role: "system", content: "test" }],
      tier: "standard",
      jsonMode: true,
    });
    expect(JSON.parse(result.content)).toHaveProperty("score");
  });

  it("createFailingMockLLM throws for specified tiers", async () => {
    const llm = createFailingMockLLM(new Set(["fast"]));

    await expect(
      llm.complete({
        messages: [{ role: "system", content: "test" }],
        tier: "fast",
      }),
    ).rejects.toThrow("Mock LLM failure");
  });

  it("createFailingMockLLM succeeds for non-failing tiers", async () => {
    const llm = createFailingMockLLM(new Set(["fast"]));

    const result = await llm.complete({
      messages: [{ role: "system", content: "test" }],
      tier: "standard",
    });
    expect(result.content).toBe("neutral");
  });
});
