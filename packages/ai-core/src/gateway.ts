import type { ModelTier } from "@revualy/shared";
import type {
  LLMProviderAdapter,
  LLMCompletionRequest,
  LLMCompletionResponse,
  EmbeddingProviderAdapter,
  EmbeddingRequest,
  EmbeddingResponse,
  LLMProvider,
  LLMGatewayConfig,
  LLMToolLoopRequest,
  LLMToolLoopResponse,
} from "./types.js";
import { AnthropicAdapter } from "./providers/anthropic.js";
import { OpenAICompatAdapter } from "./providers/openai-compat.js";

const MAX_TOKENS_CAP = 4096;

// Newest model per tier until a stable base is pinned (Nick, 2026-09-26).
// There is no "latest" alias on the API: bump these when a model ships, or
// pin a tier with LLM_MODEL_FAST / LLM_MODEL_STANDARD / LLM_MODEL_ADVANCED.
const ANTHROPIC_DEFAULTS: Record<ModelTier, string> = {
  fast: "claude-haiku-4-5",
  standard: "claude-sonnet-5",
  advanced: "claude-opus-5-5",
};

const OPENAI_DEFAULTS: Record<ModelTier, string> = {
  fast: "gpt-4o-mini",
  standard: "gpt-4o",
  advanced: "gpt-4o",
};

/**
 * LLMGateway — provider-agnostic AI interface.
 * Routes requests to the configured provider (Anthropic, OpenAI, etc.).
 * Handles fallback and usage tracking.
 */
export class LLMGateway {
  private providers = new Map<LLMProvider, LLMProviderAdapter>();
  private embeddingProviders = new Map<LLMProvider, EmbeddingProviderAdapter>();
  private defaultProvider: LLMProvider;

  constructor(defaultProvider: LLMProvider) {
    this.defaultProvider = defaultProvider;
  }

  registerProvider(adapter: LLMProviderAdapter): void {
    this.providers.set(adapter.provider, adapter);
  }

  registerEmbeddingProvider(adapter: EmbeddingProviderAdapter): void {
    this.embeddingProviders.set(adapter.provider, adapter);
  }

  async complete(
    request: LLMCompletionRequest,
    provider?: LLMProvider,
  ): Promise<LLMCompletionResponse> {
    if (!request.messages || request.messages.length === 0) {
      throw new Error("LLM completion request must have at least one message");
    }
    if (request.maxTokens != null && request.maxTokens <= 0) {
      throw new Error("maxTokens must be a positive number");
    }
    // Cap maxTokens to prevent runaway costs
    if (request.maxTokens && request.maxTokens > MAX_TOKENS_CAP) {
      request = { ...request, maxTokens: MAX_TOKENS_CAP };
    }
    const target = provider ?? this.defaultProvider;
    const adapter = this.providers.get(target);
    if (!adapter) {
      throw new Error(`No LLM provider registered: ${target}`);
    }
    // On timeout, abort the request too, so it doesn't run on (and bill) in
    // the background after the caller has moved on (review finding 2026-09-28).
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const result = await Promise.race([
      adapter.complete({ ...request, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        // Newer models think before replying, so allow more than a plain call needs.
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("LLM completion timed out after 60s"));
        }, 60_000);
      }),
    ]).finally(() => clearTimeout(timer));
    return result;
  }

  /**
   * Completion with client-side tools, looping until the model answers.
   * Anthropic only for now; other providers throw.
   */
  async completeWithTools(request: LLMToolLoopRequest, provider?: LLMProvider): Promise<LLMToolLoopResponse> {
    if (!request.messages?.length) throw new Error("LLM completion request must have at least one message");
    if (request.maxTokens && request.maxTokens > MAX_TOKENS_CAP) request = { ...request, maxTokens: MAX_TOKENS_CAP };
    const target = provider ?? this.defaultProvider;
    const adapter = this.providers.get(target);
    if (!adapter?.completeWithTools) throw new Error(`Provider ${target} does not support tool use`);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([
      adapter.completeWithTools({ ...request, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        // Several model calls in one loop, each of which may think.
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("LLM tool loop timed out after 180s"));
        }, 180_000);
      }),
    ]).finally(() => clearTimeout(timer));
  }

  async embed(
    request: EmbeddingRequest,
    provider?: LLMProvider,
  ): Promise<EmbeddingResponse> {
    const target = provider ?? this.defaultProvider;
    const adapter = this.embeddingProviders.get(target);
    if (!adapter) {
      throw new Error(`No embedding provider registered: ${target}`);
    }
    return adapter.embed(request);
  }
}

/**
 * Factory: create a fully-wired LLMGateway from config.
 * Provider is "anthropic" → AnthropicAdapter, anything else → OpenAICompatAdapter.
 */
export function createLLMGateway(config: LLMGatewayConfig): LLMGateway {
  const defaults =
    config.provider === "anthropic"
      ? ANTHROPIC_DEFAULTS
      : config.provider === "openai"
        ? OPENAI_DEFAULTS
        : undefined;

  if (!defaults && !config.models?.fast && !config.models?.standard && !config.models?.advanced) {
    throw new Error(
      `Provider "${config.provider}" has no default model names. Provide explicit model names via config.models.`,
    );
  }

  const models: Record<ModelTier, string> = {
    fast: config.models?.fast ?? defaults?.fast ?? config.provider,
    standard: config.models?.standard ?? defaults?.standard ?? config.provider,
    advanced: config.models?.advanced ?? defaults?.advanced ?? config.provider,
  };

  const providerConfig = {
    provider: config.provider,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    models,
  };

  const adapter =
    config.provider === "anthropic"
      ? new AnthropicAdapter(providerConfig)
      : new OpenAICompatAdapter(providerConfig);

  const gateway = new LLMGateway(config.provider);
  gateway.registerProvider(adapter);
  // Register the same adapter as embedding provider if it supports embeddings
  if ("embed" in adapter && typeof (adapter as unknown as EmbeddingProviderAdapter).embed === "function") {
    gateway.registerEmbeddingProvider(adapter as unknown as EmbeddingProviderAdapter);
  }
  return gateway;
}
