import type { ModelTier } from "@revualy/shared";

export type LLMProvider = "anthropic" | "openai";

/**
 * An image or PDF sent alongside a user message (base64, no data: prefix).
 * Anthropic only for now: other providers reject messages that carry them.
 */
export type LLMAttachment =
  | { type: "image"; mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; data: string }
  | { type: "document"; mediaType: "application/pdf"; data: string };

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** User messages only. Sent before the text, as the Anthropic docs advise. */
  attachments?: LLMAttachment[];
}

/**
 * How much the model thinks (Anthropic `output_config.effort`). Sonnet 5 and
 * Opus 5.5 accept all five; Opus 5.5 defaults to "medium" when unset.
 */
export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

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
  /** Aborts the request (the gateway sets it on timeout, so an abandoned call stops). */
  signal?: AbortSignal;
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

/** A client-side tool the model may call during a completion. */
export interface LLMTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LLMToolLoopRequest extends LLMCompletionRequest {
  tools: LLMTool[];
  /** Runs one tool call; the returned text goes back to the model. */
  runTool(name: string, input: unknown): Promise<string>;
  /** Tool rounds before giving up (default 4). */
  maxToolRounds?: number;
}

export interface LLMToolLoopResponse extends LLMCompletionResponse {
  toolCalls: Array<{ name: string; input: unknown; output: string }>;
  /** Model calls made (1 = answered without tools). */
  rounds: number;
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

  /** Completion with client-side tools. Optional: not every provider supports it. */
  completeWithTools?(request: LLMToolLoopRequest): Promise<LLMToolLoopResponse>;
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
