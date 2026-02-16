import OpenAI from "openai";
import { performance } from "node:perf_hooks";
import type {
  LLMProviderAdapter,
  LLMProviderConfig,
  LLMCompletionRequest,
  LLMCompletionResponse,
} from "../types.js";

/**
 * OpenAI-compatible adapter. Works with:
 * - OpenAI cloud (no baseUrl)
 * - Ollama (baseUrl: http://localhost:11434/v1)
 * - vLLM (baseUrl: http://localhost:8000/v1)
 * - Any OpenAI-compatible API
 */
export class OpenAICompatAdapter implements LLMProviderAdapter {
  readonly provider: string;
  private client: OpenAI;
  private models: LLMProviderConfig["models"];

  constructor(config: LLMProviderConfig) {
    this.provider = config.provider;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    this.models = config.models;
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const model = this.models[request.tier];

    const messages: OpenAI.ChatCompletionMessageParam[] = request.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const start = performance.now();
    const response = await this.client.chat.completions.create({
      model,
      messages,
      max_tokens: request.maxTokens ?? 1024,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    });
    const latencyMs = Math.round(performance.now() - start);

    const choice = response.choices[0];
    const content = choice?.message?.content ?? "";

    return {
      content,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      model: response.model,
      latencyMs,
    };
  }
}
