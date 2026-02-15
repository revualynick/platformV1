import type {
  LLMProviderAdapter,
  LLMCompletionRequest,
  LLMCompletionResponse,
  EmbeddingProviderAdapter,
  EmbeddingRequest,
  EmbeddingResponse,
  LLMProvider,
} from "./types.js";

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
