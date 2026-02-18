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
} from "./types.js";
import { AnthropicAdapter } from "./providers/anthropic.js";
import { OpenAICompatAdapter } from "./providers/openai-compat.js";

const ANTHROPIC_DEFAULTS: Record<ModelTier, string> = {
  fast: "claude-haiku-4-5-20251001",
  standard: "claude-sonnet-4-6",
  advanced: "claude-opus-4-6",
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
    const target = provider ?? this.defaultProvider;
    const adapter = this.providers.get(target);
    if (!adapter) {
      throw new Error(`No LLM provider registered: ${target}`);
    }
    return adapter.complete(request);
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
  return gateway;
}
