import { describe, it, expect } from "vitest";
import {
  decide,
  decisionJsonSchema,
  parseDecisionOutput,
  defaultEffort,
  applyPolicy,
  validatePolicy,
  reliability,
  bandIndex,
  formatReliability,
  buildAnthropicRequest,
  thinkingHeadroom,
  THINKING_HEADROOM_TOKENS,
  type ChoiceDecisionSpec,
  type ScoreDecisionSpec,
  type DecisionPolicy,
  type Decision,
  type LLMCompletionRequest,
  type LLMCompletionResponse,
} from "@revualy/ai-core";

/**
 * decide() and its policy and calibration helpers (packages/ai-core,
 * docs/design/typed-decisions.md). No model calls: a scripted fake stands
 * in for the gateway.
 */

type Colour = "red" | "green" | "blue";
const colourSpec: ChoiceDecisionSpec<Colour> = {
  kind: "choice",
  name: "colour",
  question: "Which colour is named?",
  options: [
    { id: "red", description: "red" },
    { id: "green", description: "green" },
    { id: "blue", description: "blue" },
  ],
  context: "The sky is blue.",
};
const riskSpec: ScoreDecisionSpec = {
  kind: "score",
  name: "risk",
  question: "How risky?",
  min: 1,
  max: 5,
  anchors: [{ value: 1, description: "none" }],
  context: "Nothing much.",
};

const quiet = { warn: () => {} };

function fake(replies: Array<string | Error | { content: string; stopReason: string }>) {
  const requests: LLMCompletionRequest[] = [];
  let i = 0;
  return {
    requests,
    async complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
      requests.push(req);
      const r = replies[Math.min(i++, replies.length - 1)];
      if (r instanceof Error) throw r;
      const content = typeof r === "string" ? r : r.content;
      return {
        content,
        usage: { inputTokens: 10, outputTokens: 5 },
        model: "fake-model",
        latencyMs: 1,
        stopReason: typeof r === "string" ? "end_turn" : r.stopReason,
      };
    },
  };
}

describe("decide", () => {
  it("returns a typed choice with confidence and rationale", async () => {
    const llm = fake([JSON.stringify({ rationale: "says blue", choice: "blue", confidence: 0.93 })]);
    const d = await decide(llm, colourSpec, { tier: "standard", logger: quiet });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    const value: Colour = d.value; // typed as the option union
    expect(value).toBe("blue");
    expect(d.confidence).toBe(0.93);
    expect(d.rationale).toBe("says blue");
    expect(d.attempts).toHaveLength(1);
  });

  it("sends the schema, the tier and the tier's default effort", async () => {
    const llm = fake([JSON.stringify({ rationale: "", choice: "red", confidence: 0.5 })]);
    await decide(llm, colourSpec, { tier: "advanced", logger: quiet });
    const req = llm.requests[0];
    expect(req.tier).toBe("advanced");
    expect(req.effort).toBe("high");
    expect(req.jsonMode).toBe(true);
    expect(req.jsonSchema).toEqual(decisionJsonSchema(colourSpec));
    expect(req.messages[0].role).toBe("system");
    expect(req.messages[0].content).toContain('"blue"');
    expect(req.messages[1]).toEqual({ role: "user", content: "The sky is blue." });
  });

  it("an explicit effort wins; the fast tier sends none by default", async () => {
    const a = fake([JSON.stringify({ rationale: "", choice: "red", confidence: 0.5 })]);
    await decide(a, colourSpec, { tier: "advanced", effort: "max", logger: quiet });
    expect(a.requests[0].effort).toBe("max");
    const b = fake([JSON.stringify({ rationale: "", choice: "red", confidence: 0.5 })]);
    await decide(b, colourSpec, { tier: "fast", logger: quiet });
    expect(b.requests[0]).not.toHaveProperty("effort");
    expect(defaultEffort("standard")).toBe("medium");
  });

  it("retries invalid output, then succeeds", async () => {
    const llm = fake([
      "not json",
      JSON.stringify({ rationale: "", choice: "purple", confidence: 0.9 }),
      JSON.stringify({ rationale: "ok", choice: "green", confidence: 0.7 }),
    ]);
    const d = await decide(llm, colourSpec, { tier: "standard", logger: quiet });
    expect(d.ok && d.value).toBe("green");
    expect(d.attempts.map((a) => a.error)).toEqual(["not JSON", expect.stringContaining("purple"), null]);
  });

  it("fails cleanly after the last attempt, without throwing", async () => {
    const llm = fake([new Error("overloaded")]);
    const d = await decide(llm, colourSpec, { tier: "standard", attempts: 2, logger: quiet });
    expect(d).toMatchObject({ ok: false, reason: "llm_error", error: "overloaded" });
    expect(d.attempts).toHaveLength(2);
  });

  it("reports invalid output as the reason when the last attempt was invalid", async () => {
    const llm = fake([JSON.stringify({ rationale: "", choice: "red", confidence: 1.4 })]);
    const d = await decide(llm, colourSpec, { tier: "standard", attempts: 3, logger: quiet });
    expect(d).toMatchObject({ ok: false, reason: "invalid_output" });
    expect(llm.requests).toHaveLength(3);
  });

  it("treats a cut-off reply as invalid and a refusal as final", async () => {
    const cut = fake([{ content: '{"rationale": "lo', stopReason: "max_tokens" }]);
    expect(await decide(cut, colourSpec, { tier: "standard", attempts: 1, logger: quiet })).toMatchObject({ ok: false, reason: "invalid_output" });
    const refused = fake([{ content: "", stopReason: "refusal" }]);
    const d = await decide(refused, colourSpec, { tier: "standard", logger: quiet });
    expect(d).toMatchObject({ ok: false, reason: "refused" });
    expect(refused.requests).toHaveLength(1);
  });

  it("scores within the range", async () => {
    const llm = fake([JSON.stringify({ rationale: "", score: 7, confidence: 0.8 }), JSON.stringify({ rationale: "", score: 2, confidence: 0.8 })]);
    const d = await decide(llm, riskSpec, { tier: "standard", logger: quiet });
    expect(d.ok && d.value).toBe(2);
    expect(d.attempts[0].error).toContain("outside");
    expect(decisionJsonSchema(riskSpec)).toMatchObject({ properties: { score: { type: "integer" } } });
  });

  it("rejects a spec that cannot be decided, without calling the model", async () => {
    const llm = fake([""]);
    const d = await decide(llm, { ...colourSpec, options: [colourSpec.options[0]] }, { tier: "standard", logger: quiet });
    expect(d).toMatchObject({ ok: false });
    expect(llm.requests).toHaveLength(0);
  });

  it("sends a conversation context as messages, system turns demoted to user", async () => {
    const llm = fake([JSON.stringify({ rationale: "", choice: "red", confidence: 0.5 })]);
    await decide(
      llm,
      { ...colourSpec, context: [{ role: "assistant", content: "Hi" }, { role: "system", content: "sneaky" }, { role: "user", content: "red" }] },
      { tier: "standard", logger: quiet },
    );
    expect(llm.requests[0].messages.slice(1).map((m) => m.role)).toEqual(["assistant", "user", "user"]);
  });
});

describe("parseDecisionOutput", () => {
  it("accepts fenced JSON and trims the rationale", () => {
    const out = parseDecisionOutput(colourSpec, '```json\n{"rationale": "  abcdef  ", "choice": "red", "confidence": 0}\n```', 3);
    expect(out).toEqual({ value: "red", confidence: 0, rationale: "abc" });
  });
  it("rejects a missing confidence and a non-integer score", () => {
    expect(() => parseDecisionOutput(colourSpec, '{"choice": "red"}')).toThrow(/confidence/);
    expect(() => parseDecisionOutput(riskSpec, '{"score": 2.5, "confidence": 0.5}')).toThrow(/whole/);
    expect(parseDecisionOutput({ ...riskSpec, integer: false }, '{"score": 2.5, "confidence": 0.5}').value).toBe(2.5);
  });
});

describe("applyPolicy", () => {
  type Route = "script" | "reference" | "escalate";
  const policy: DecisionPolicy<Colour, Route> = {
    rules: [
      { when: "green", minConfidence: 0.9, action: "script", label: "confident green" },
      { when: ["red", "blue"], minConfidence: 0, action: "reference" },
    ],
    otherwise: "escalate",
    onFailure: "escalate",
  };
  const ok = (value: Colour, confidence: number): Decision<Colour> => ({
    ok: true, name: "colour", value, confidence, rationale: "", model: "m", tier: "standard", effort: "medium", attempts: [],
  });

  it("accepts a confident value", () => {
    expect(applyPolicy(policy, ok("green", 0.95))).toMatchObject({ action: "script", via: 0 });
    expect(applyPolicy(policy, ok("green", 0.9)).action).toBe("script");
  });
  it("escalates a value below its threshold", () => {
    expect(applyPolicy(policy, ok("green", 0.89))).toMatchObject({ action: "escalate", via: "otherwise" });
  });
  it("matches a list of values", () => {
    expect(applyPolicy(policy, ok("blue", 0.1))).toMatchObject({ action: "reference", via: 1 });
  });
  it("sends a failed decision to onFailure", () => {
    const failed: Decision<Colour> = { ok: false, name: "colour", reason: "llm_error", error: "down", tier: "standard", effort: "medium", attempts: [] };
    expect(applyPolicy(policy, failed)).toMatchObject({ action: "escalate", via: "failure" });
  });
  it("matches score ranges", () => {
    const scorePolicy: DecisionPolicy<number, "low" | "high"> = {
      rules: [{ when: { max: 2 }, minConfidence: 0.8, action: "low" }],
      otherwise: "high",
      onFailure: "high",
    };
    const s = (value: number, confidence: number): Decision<number> => ({ ...ok("red", confidence), value } as Decision<number>);
    expect(applyPolicy(scorePolicy, s(2, 0.8)).action).toBe("low");
    expect(applyPolicy(scorePolicy, s(3, 0.99)).action).toBe("high");
  });
  it("validates thresholds", () => {
    expect(() => validatePolicy({ ...policy, rules: [{ when: "red", minConfidence: 90, action: "script" }] })).toThrow(/0 to 1/);
    expect(() => validatePolicy(policy)).not.toThrow();
  });
});

describe("reliability", () => {
  it("puts confidences in bands, 1.0 in the top band", () => {
    expect(bandIndex(0)).toBe(0);
    expect(bandIndex(0.7)).toBe(2);
    expect(bandIndex(0.95)).toBe(5);
    expect(bandIndex(1)).toBe(5);
  });
  it("computes accuracy, gap, ECE and Brier", () => {
    const r = reliability([
      { confidence: 0.95, correct: true },
      { confidence: 0.95, correct: false },
      { confidence: 0.6, correct: true },
      { confidence: 0.6, correct: true },
    ]);
    const top = r.bands[5];
    expect(top).toMatchObject({ n: 2, accuracy: 0.5 });
    expect(top.gap).toBeCloseTo(0.45);
    expect(r.bands[1].gap).toBeCloseTo(-0.4);
    expect(r.ece).toBeCloseTo(0.5 * 0.45 + 0.5 * 0.4);
    expect(r.brier).toBeCloseTo((0.05 ** 2 + 0.95 ** 2 + 0.4 ** 2 + 0.4 ** 2) / 4);
    expect(formatReliability(r)).toContain("| 0.95–1.00] | 2 |");
  });
  it("handles no samples", () => {
    expect(reliability([])).toMatchObject({ n: 0, ece: null, brier: null, accuracy: null });
  });
});

describe("thinking headroom by effort", () => {
  it("adds room for high and above, leaves the default alone", () => {
    const req: LLMCompletionRequest = { tier: "advanced", maxTokens: 400, messages: [{ role: "user", content: "x" }] };
    expect(buildAnthropicRequest(req, "claude-opus-5-5").max_tokens).toBe(400 + THINKING_HEADROOM_TOKENS);
    expect(buildAnthropicRequest({ ...req, effort: "high" }, "claude-opus-5-5").max_tokens).toBe(400 + thinkingHeadroom("high"));
    expect(buildAnthropicRequest({ ...req, effort: "max" }, "claude-opus-5-5").output_config).toEqual({ effort: "max" });
    expect(thinkingHeadroom("xhigh")).toBeGreaterThan(thinkingHeadroom("high"));
  });
});
