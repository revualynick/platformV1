import Anthropic from "@anthropic-ai/sdk";
import { performance } from "node:perf_hooks";
import type {
  LLMProvider,
  LLMProviderAdapter,
  LLMProviderConfig,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMMessage,
} from "../types.js";

export class AnthropicAdapter implements LLMProviderAdapter {
  readonly provider: LLMProvider;
  private client: Anthropic;
  private models: LLMProviderConfig["models"];

  constructor(config: LLMProviderConfig) {
    this.provider = config.provider;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    this.models = config.models;
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const model = this.models[request.tier];
    const start = performance.now();
    const response = await this.client.messages.create(buildAnthropicRequest(request, model));
    const latencyMs = Math.round(performance.now() - start);

    // Thinking blocks come first on models that think; only text is the reply.
    let content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Strip markdown code fences that Anthropic sometimes wraps JSON in
    if (request.jsonMode) {
      content = stripCodeFences(content);
    }

    return {
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      model: response.model,
      latencyMs,
      stopReason: response.stop_reason ?? undefined,
    };
  }

}

function extractMessages(
  msgs: LLMMessage[],
  jsonMode?: boolean,
): { systemPrompt: string | undefined; messages: Anthropic.MessageParam[] } {
  const systemMsgs: string[] = [];
  const nonSystem: Anthropic.MessageParam[] = [];

  for (const msg of msgs) {
    if (msg.role === "system") {
      systemMsgs.push(msg.content);
    } else {
      nonSystem.push({ role: msg.role, content: msg.content });
    }
  }

  let systemPrompt = systemMsgs.join("\n\n") || undefined;

  if (jsonMode && systemPrompt) {
    systemPrompt += "\n\nRespond ONLY with valid JSON. No markdown, no explanation.";
  } else if (jsonMode) {
    systemPrompt = "Respond ONLY with valid JSON. No markdown, no explanation.";
  }

  // Anthropic requires at least one user message.
  // Most call sites send only system messages — promote the last system
  // message to a user message so the API call succeeds.
  if (nonSystem.length === 0 && systemMsgs.length > 0) {
    const last = systemMsgs.pop()!;
    systemPrompt = systemMsgs.join("\n\n") || undefined;
    if (jsonMode) {
      const suffix = "\n\nRespond ONLY with valid JSON. No markdown, no explanation.";
      systemPrompt = systemPrompt ? systemPrompt + suffix : suffix;
    }
    nonSystem.push({ role: "user" as const, content: last });
  }

  // A conversation replayed from the bot's opening question starts with
  // the assistant. Reference docs say the first message must be the
  // user's; the live API accepted assistant-first on Sonnet 4.6 and 5
  // (checked 2026-09-26). A neutral user line costs nothing and holds
  // either way.
  if (nonSystem[0]?.role === "assistant") {
    nonSystem.unshift({ role: "user" as const, content: CONVERSATION_START });
  }

  return { systemPrompt, messages: nonSystem };
}

function stripCodeFences(text: string): string {
const trimmed = text.trim();
if (trimmed.startsWith("```")) {
  // Remove opening fence (with optional language tag) and closing fence
  const stripped = trimmed
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
  // Validate the result is valid JSON; if stripping broke it, return original
  try {
    JSON.parse(stripped);
    return stripped;
  } catch {
    return trimmed;
  }
}
return trimmed;
}

export const CONVERSATION_START = "(Conversation start.)";

/** Extra output room for models that think before replying: thinking counts toward max_tokens. */
export const THINKING_HEADROOM_TOKENS = 4000;

// Model capabilities, by id. Newer models reject sampling parameters and
// think by default; unknown ids are treated as newer (omitting temperature
// and adding headroom is valid everywhere; sending them is not).
const SAMPLING_MODELS = /^claude-(3|haiku-4-5|(sonnet|opus)-4-[0-6]|(sonnet|opus)-4-1)/;
const NO_EFFORT_MODELS = /^claude-(3|haiku|sonnet-4-5|(sonnet|opus)-4-[01]|sonnet-4-2)/;

export function modelCapabilities(model: string) {
  const sampling = SAMPLING_MODELS.test(model);
  return {
    /** Accepts temperature / top_p / top_k. */
    sampling,
    /** Thinks unless told not to (so max_tokens must leave room for it). */
    thinksByDefault: !sampling,
    /** Accepts output_config.effort. */
    effort: !NO_EFFORT_MODELS.test(model),
  };
}

/** The Messages API request for a gateway request on a given model. Pure, for testing. */
export function buildAnthropicRequest(
  request: LLMCompletionRequest,
  model: string,
): Anthropic.MessageCreateParamsNonStreaming {
  const caps = modelCapabilities(model);
  const { systemPrompt, messages } = extractMessages(request.messages, request.jsonMode);
  const replyTokens = request.maxTokens ?? 1024;
  const effort = caps.effort ? (request.effort ?? (caps.thinksByDefault ? "medium" : undefined)) : undefined;
  const outputConfig: Anthropic.OutputConfig = {
    ...(effort ? { effort } : {}),
    ...(request.jsonSchema ? { format: { type: "json_schema", schema: request.jsonSchema } } : {}),
  };
  return {
    model,
    max_tokens: caps.thinksByDefault ? replyTokens + THINKING_HEADROOM_TOKENS : replyTokens,
    ...(caps.sampling && request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages,
  };
}
