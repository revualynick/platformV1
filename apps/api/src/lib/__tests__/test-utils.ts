import type { LLMGateway, LLMCompletionRequest, LLMCompletionResponse } from "@revualy/ai-core";

/**
 * Mock LLM gateway that returns predictable responses.
 * Pass a response map keyed by tier or content substring for targeted mocking.
 * Falls back to a default JSON response for JSON mode, plain text otherwise.
 */
export function createMockLLM(
  responses?: Map<string, string>,
): LLMGateway {
  const complete = async (request: LLMCompletionRequest): Promise<LLMCompletionResponse> => {
    // Check tier-based response first
    if (responses?.has(request.tier)) {
      return {
        content: responses.get(request.tier)!,
        usage: { inputTokens: 10, outputTokens: 5 },
        model: "mock-model",
        latencyMs: 1,
      };
    }

    // Check content-based response (match against first system message)
    const firstMsg = request.messages[0]?.content ?? "";
    for (const [key, value] of responses ?? []) {
      if (firstMsg.includes(key)) {
        return {
          content: value,
          usage: { inputTokens: 10, outputTokens: 5 },
          model: "mock-model",
          latencyMs: 1,
        };
      }
    }

    // Default response based on jsonMode
    const content = request.jsonMode
      ? '{"score": 75, "hasExamples": true}'
      : "neutral";

    return {
      content,
      usage: { inputTokens: 10, outputTokens: 5 },
      model: "mock-model",
      latencyMs: 1,
    };
  };

  return { complete } as unknown as LLMGateway;
}

/**
 * Create a mock LLM that throws for specific tiers (to test graceful degradation).
 */
export function createFailingMockLLM(
  failingTiers: Set<string>,
  fallbackContent = "neutral",
): LLMGateway {
  const complete = async (request: LLMCompletionRequest): Promise<LLMCompletionResponse> => {
    if (failingTiers.has(request.tier)) {
      throw new Error(`Mock LLM failure for tier: ${request.tier}`);
    }

    return {
      content: request.jsonMode
        ? '{"score": 50, "hasExamples": false}'
        : fallbackContent,
      usage: { inputTokens: 10, outputTokens: 5 },
      model: "mock-model",
      latencyMs: 1,
    };
  };

  return { complete } as unknown as LLMGateway;
}

/**
 * Silent logger that captures log calls for assertion.
 */
export function createMockLogger() {
  const calls: { level: string; args: unknown[] }[] = [];
  return {
    logger: {
      info: (...args: unknown[]) => calls.push({ level: "info", args }),
      warn: (...args: unknown[]) => calls.push({ level: "warn", args }),
      error: (...args: unknown[]) => calls.push({ level: "error", args }),
    },
    calls,
  };
}
