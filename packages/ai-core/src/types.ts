import type { ModelTier } from "@revualy/shared";

export type LLMProvider = string;

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCompletionRequest {
  messages: LLMMessage[];
  tier: ModelTier;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export interface LLMCompletionResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
  latencyMs: number;
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
