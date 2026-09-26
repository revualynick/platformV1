import type { ModelTier } from "@revualy/shared";

export type LLMProvider = "anthropic" | "openai";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** How much the model thinks (Anthropic `output_config.effort`). */
export type EffortLevel = "low" | "medium" | "high";

export interface LLMCompletionRequest {
  messages: LLMMessage[];
  tier: ModelTier;
  /** Length of the reply. Models that think get extra room for it on top. */
  maxTokens?: number;
  /** Ignored by models that reject sampling parameters (Sonnet 5, Opus 4.7+). */
  temperature?: number;
  jsonMode?: boolean;
  /** Anthropic: thinking depth. Defaults to "medium" on models that think by default. */
  effort?: EffortLevel;
  /** Anthropic: JSON Schema the reply must match (structured outputs). Use with jsonMode. */
  jsonSchema?: Record<string, unknown>;
}

export interface LLMCompletionResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
  latencyMs: number;
  /** Why generation stopped, when the provider says ("max_tokens" means cut off). */
  stopReason?: string;
}

export interface LLMProviderConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl?: string;
  models: Record<ModelTier, string>;
}

/**
 * LLMProviderAdapter — abstraction over AI providers.
 * Same pattern as ChatAdapter: swap providers without touching core logic.
 */
export interface LLMProviderAdapter {
  readonly provider: LLMProvider;

  complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse>;
}

export interface LLMGatewayConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl?: string;
  models?: Partial<Record<ModelTier, string>>;
}

export interface EmbeddingRequest {
  texts: string[];
}

export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
}

export interface EmbeddingProviderAdapter {
  readonly provider: LLMProvider;

  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}
