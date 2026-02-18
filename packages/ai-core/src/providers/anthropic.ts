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

    // Anthropic API: system messages go to the top-level `system` param,
    // and the `messages` array must contain at least one user message.
    const { systemPrompt, messages } = this.extractMessages(request.messages, request.jsonMode);

    const start = performance.now();
    const response = await this.client.messages.create({
      model,
      max_tokens: request.maxTokens ?? 1024,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages,
    });
    const latencyMs = Math.round(performance.now() - start);

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
    };
  }

  private extractMessages(
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

    return { systemPrompt, messages: nonSystem };
  }
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    // Remove opening fence (with optional language tag) and closing fence
    return trimmed
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();
  }
  return trimmed;
}
