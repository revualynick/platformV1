import { describe, it, expect } from "vitest";
import { buildAnthropicRequest, CONVERSATION_START, THINKING_HEADROOM_TOKENS } from "@revualy/ai-core";
import type { LLMCompletionRequest } from "@revualy/ai-core";

/**
 * What the gateway sends to the Messages API, per model. Guards the model
 * move to Sonnet 5 / Opus 5.5 (2026-09-26): those reject sampling
 * parameters and think by default. Histories always start with a user
 * message (docs require it; the live API was found to tolerate either).
 */

const turn: LLMCompletionRequest = {
  tier: "standard",
  maxTokens: 300,
  temperature: 0.5,
  messages: [
    { role: "system", content: "You are a coach." },
    { role: "assistant", content: "How has Sam been to work with?" },
    { role: "user", content: "Great in standups." },
  ],
};

describe("buildAnthropicRequest", () => {
  it("Sonnet 5: no temperature, medium effort by default, room to think", () => {
    const req = buildAnthropicRequest(turn, "claude-sonnet-5");
    expect(req).not.toHaveProperty("temperature");
    expect(req.output_config).toEqual({ effort: "medium" });
    expect(req.max_tokens).toBe(300 + THINKING_HEADROOM_TOKENS);
    expect(req.system).toBe("You are a coach.");
  });

  it("starts the conversation with a user message when history opens with the bot", () => {
    const req = buildAnthropicRequest(turn, "claude-sonnet-5");
    expect(req.messages[0]).toEqual({ role: "user", content: CONVERSATION_START });
    expect(req.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  it("leaves a conversation that already starts with the user alone", () => {
    const req = buildAnthropicRequest(
      { tier: "fast", messages: [{ role: "user", content: "Hi" }] },
      "claude-haiku-4-5",
    );
    expect(req.messages).toEqual([{ role: "user", content: "Hi" }]);
  });

  it("Opus 5.5: explicit effort and structured output are passed through", () => {
    const schema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false };
    const req = buildAnthropicRequest({ ...turn, effort: "low", jsonMode: true, jsonSchema: schema }, "claude-opus-5-5");
    expect(req.output_config).toEqual({ effort: "low", format: { type: "json_schema", schema } });
    expect(req).not.toHaveProperty("temperature");
  });

  it("Haiku 4.5: keeps temperature, sends no effort (it would be rejected), no extra room", () => {
    const req = buildAnthropicRequest({ ...turn, tier: "fast", effort: "low" }, "claude-haiku-4-5");
    expect(req.temperature).toBe(0.5);
    expect(req).not.toHaveProperty("output_config");
    expect(req.max_tokens).toBe(300);
  });

  it("Sonnet 4.6 (a pinned older model): keeps temperature; effort only when asked", () => {
    expect(buildAnthropicRequest(turn, "claude-sonnet-4-6")).toMatchObject({ temperature: 0.5, max_tokens: 300 });
    expect(buildAnthropicRequest(turn, "claude-sonnet-4-6")).not.toHaveProperty("output_config");
    expect(buildAnthropicRequest({ ...turn, effort: "low" }, "claude-sonnet-4-6").output_config).toEqual({ effort: "low" });
  });

  it("treats an unknown future model as a newer one (the safe direction)", () => {
    const req = buildAnthropicRequest(turn, "claude-sonnet-6");
    expect(req).not.toHaveProperty("temperature");
    expect(req.max_tokens).toBe(300 + THINKING_HEADROOM_TOKENS);
  });

  it("sends image and PDF attachments as base64 blocks before the text", () => {
    const req = buildAnthropicRequest(
      {
        tier: "standard",
        messages: [
          { role: "system", content: "Read the org chart." },
          {
            role: "user",
            content: "Page 1 of 1.",
            attachments: [
              { type: "image", mediaType: "image/png", data: "iVBORw0K" },
              { type: "document", mediaType: "application/pdf", data: "JVBERi0x" },
            ],
          },
        ],
      },
      "claude-sonnet-5",
    );
    expect(req.system).toBe("Read the org chart.");
    expect(req.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0K" } },
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBERi0x" } },
          { type: "text", text: "Page 1 of 1." },
        ],
      },
    ]);
  });

  it("rejects attachments on a system or assistant message rather than dropping them", () => {
    const image = [{ type: "image" as const, mediaType: "image/png" as const, data: "x" }];
    expect(() =>
      buildAnthropicRequest({ tier: "fast", messages: [{ role: "system", content: "s", attachments: image }] }, "claude-haiku-4-5"),
    ).toThrow(/only supported on user messages/);
    expect(() =>
      buildAnthropicRequest({ tier: "fast", messages: [{ role: "assistant", content: "a", attachments: image }] }, "claude-haiku-4-5"),
    ).toThrow(/only supported on user messages/);
  });
});
