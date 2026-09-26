import { describe, it, expect } from "vitest";
import type { LLMGateway, LLMCompletionRequest } from "@revualy/ai-core";
import { planTurn, themeQuestion, type PlanInput, type ThemeInfo } from "../turn-planner.js";

const quiet = { warn: () => {} };
const collab: ThemeInfo = { id: "t1", intent: "Collaboration", dataGoal: "How they work with others", examplePhrasings: [] };
const growth: ThemeInfo = { id: "t2", intent: "Growth areas", dataGoal: "Where they could grow", examplePhrasings: ["Where could Sam grow next?"] };

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    interactionType: "peer_review",
    subjectName: "Sam",
    verbatim: false,
    currentTheme: collab,
    nextTheme: growth,
    followUpsOnTheme: 0,
    canContinue: true,
    history: [
      { role: "assistant", content: "How has Sam been to work with?" },
      { role: "user", content: "Fine" },
    ],
    reply: "Fine",
    ...over,
  };
}

/** Returns each scripted response in turn; a thrown Error simulates an outage. */
function llm(...responses: Array<string | Error>) {
  const calls: LLMCompletionRequest[] = [];
  const complete = async (req: LLMCompletionRequest) => {
    calls.push(req);
    const next = responses.shift() ?? new Error("no more responses");
    if (next instanceof Error) throw next;
    return { content: next, usage: { inputTokens: 1, outputTokens: 1 }, model: "m", latencyMs: 1 };
  };
  return { gateway: { complete } as unknown as LLMGateway, calls };
}
const plan = (action: string, question = "Model question?", quality = "weak") => JSON.stringify({ quality, action, question });

describe("planTurn", () => {
  it("makes exactly one LLM call per turn, sees the question, and uses its plan", async () => {
    const { gateway, calls } = llm(plan("follow_up", "Could you give an example?"));
    const result = await planTurn(gateway, input(), { logger: quiet });
    expect(calls).toHaveLength(1);
    expect(calls[0].jsonMode).toBe(true);
    // The judgement sees the question that was answered, not just the reply.
    expect(calls[0].messages.map((m) => m.content)).toContain("How has Sam been to work with?");
    expect(result).toEqual({ action: "follow_up", quality: "weak", question: "Could you give an example?", judgedBy: "llm", concern: "none" });
  });

  it("caps follow-ups per theme: a second one moves on, with the next theme's own question", async () => {
    const { gateway } = llm(plan("follow_up", "Another follow-up?"));
    const result = await planTurn(gateway, input({ followUpsOnTheme: 1 }), { logger: quiet });
    expect(result).toMatchObject({ action: "next_theme", quality: "weak", question: "Where could Sam grow next?" });
  });

  it("closes when there is no next theme to move to", async () => {
    const { gateway } = llm(plan("next_theme", "Next?", "answered"));
    const result = await planTurn(gateway, input({ nextTheme: null }), { logger: quiet });
    expect(result).toEqual({ action: "close", quality: "answered", question: null, judgedBy: "llm", concern: "none" });
  });

  it("closes at the message cap whatever the model proposes", async () => {
    const { gateway } = llm(plan("follow_up"));
    expect((await planTurn(gateway, input({ canContinue: false }), { logger: quiet })).action).toBe("close");
  });

  it("passes the model's concern through, so the turn can be routed", async () => {
    const { gateway } = llm(JSON.stringify({ quality: "answered", action: "follow_up", question: "Tell me more?", concern: "wellbeing" }));
    expect((await planTurn(gateway, input(), { logger: quiet })).concern).toBe("wellbeing");
  });

  it("verbatim questionnaires ask the next theme exactly as written", async () => {
    const { gateway } = llm(plan("next_theme", "A paraphrase?", "answered"));
    const result = await planTurn(gateway, input({ verbatim: true }), { logger: quiet });
    expect(result.question).toBe("Where could Sam grow next?");
  });

  it("retries once, then succeeds", async () => {
    const { gateway, calls } = llm(new Error("overloaded"), plan("next_theme", "Where next?", "answered"));
    const result = await planTurn(gateway, input(), { logger: quiet });
    expect(calls).toHaveLength(2);
    expect(result).toMatchObject({ action: "next_theme", judgedBy: "llm" });
  });

  it("accepts JSON wrapped in a code fence", async () => {
    const { gateway } = llm("```json\n" + plan("next_theme", "Where next?", "answered") + "\n```");
    expect((await planTurn(gateway, input(), { logger: quiet })).judgedBy).toBe("llm");
  });

  describe("when the model is down or unusable", () => {
    it("keeps the conversation going with the next theme's own wording", async () => {
      const { gateway, calls } = llm(new Error("down"), new Error("down"));
      const result = await planTurn(gateway, input(), { logger: quiet });
      expect(calls).toHaveLength(2);
      expect(result).toEqual({ action: "next_theme", quality: "weak", question: "Where could Sam grow next?", judgedBy: "fallback", concern: "none" });
    });

    it("treats invalid output the same as an outage", async () => {
      const { gateway } = llm("not json", JSON.stringify({ action: "dance" }));
      expect((await planTurn(gateway, input(), { logger: quiet })).judgedBy).toBe("fallback");
    });

    it("judges a long reply as answered, and closes when no theme is left", async () => {
      const { gateway } = llm(new Error("down"), new Error("down"));
      const reply = "Sam led the incident review calmly and wrote a clear, specific plan everyone could follow";
      const result = await planTurn(gateway, input({ reply, nextTheme: null }), { logger: quiet });
      expect(result).toEqual({ action: "close", quality: "answered", question: null, judgedBy: "fallback", concern: "none" });
    });
  });
});

describe("themeQuestion", () => {
  it("uses the first example phrasing", () => {
    expect(themeQuestion(growth)).toBe("Where could Sam grow next?");
  });
  it("builds a question from the intent when there is no phrasing", () => {
    expect(themeQuestion(collab)).toBe("Could you say a little about collaboration?");
  });
});
