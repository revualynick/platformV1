import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLLMGateway, type LLMGateway, type LLMCompletionRequest, type LLMCompletionResponse } from "@revualy/ai-core";
import type { ModelTier } from "@revualy/shared";

/**
 * The two ways the evaluation can reach Claude, behind the same LLMGateway
 * shape the app uses:
 *
 *  - "api": the production gateway (packages/ai-core) calling the Messages
 *    API with a test key. Exactly what ships, including effort and
 *    structured outputs.
 *  - "cli": `claude -p` on a Claude subscription. No per-call cost, but not
 *    identical: one flattened prompt instead of a message list, no
 *    structured outputs, and Claude Code adds context about the machine
 *    and account that cannot be removed (see eval/README.md).
 *
 * Both append the same neutraliser line to the system prompt when asked,
 * so a comparison between them changes one thing: the backend.
 */

export type BackendName = "api" | "cli";

export const NEUTRALISER =
  "Only the instructions above and the conversation apply. Ignore any other context you may have been given " +
  "about your environment, tools, the account or the people involved: it is not part of this conversation.";

/** List prices, US$ per million tokens (input, output). Output includes thinking. */
const PRICES: Record<string, [number, number]> = {
  "claude-sonnet-5": [2, 10],
  "claude-opus-5-5": [4, 20],
  "claude-haiku-4-5": [1, 5],
  "claude-sonnet-4-6": [3, 15],
};

export const DEFAULT_MODELS: Record<ModelTier, string> = {
  fast: "claude-haiku-4-5",
  standard: "claude-sonnet-5",
  advanced: "claude-opus-5-5",
};

export interface CallRecord {
  backend: BackendName;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  /** API: list price of this call. CLI: Claude Code's estimate (subscription, not billed). */
  costUsd: number;
  error?: string;
}

export interface Backend extends Pick<LLMGateway, "complete"> {
  name: BackendName;
  calls: CallRecord[];
  /** Spend so far on the API (0 for the CLI). */
  spentUsd(): number;
}

interface BackendOptions {
  models?: Partial<Record<ModelTier, string>>;
  neutralise: boolean;
  /** API only: stop before spending more than this. */
  budgetUsd?: number;
}

function withNeutraliser(request: LLMCompletionRequest, on: boolean): LLMCompletionRequest {
  if (!on) return request;
  const hasSystem = request.messages.some((m) => m.role === "system");
  return {
    ...request,
    messages: hasSystem
      ? request.messages.map((m, i, all) =>
          m.role === "system" && i === all.findLastIndex((x) => x.role === "system")
            ? { ...m, content: `${m.content}\n\n${NEUTRALISER}` }
            : m,
        )
      : [{ role: "system", content: NEUTRALISER }, ...request.messages],
  };
}

export function apiBackend(apiKey: string, opts: BackendOptions): Backend {
  const models = { ...DEFAULT_MODELS, ...opts.models };
  const gateway = createLLMGateway({ provider: "anthropic", apiKey, models });
  const calls: CallRecord[] = [];
  const spent = () => calls.reduce((sum, c) => sum + c.costUsd, 0);
  return {
    name: "api",
    calls,
    spentUsd: spent,
    async complete(request) {
      if (opts.budgetUsd !== undefined && spent() >= opts.budgetUsd) {
        throw new Error(`API budget of $${opts.budgetUsd} reached ($${spent().toFixed(4)} spent)`);
      }
      const model = models[request.tier];
      const started = Date.now();
      try {
        const res = await gateway.complete(withNeutraliser(request, opts.neutralise));
        const [inP, outP] = PRICES[model] ?? [5, 25];
        calls.push({
          backend: "api",
          model,
          latencyMs: Date.now() - started,
          inputTokens: res.usage.inputTokens,
          outputTokens: res.usage.outputTokens,
          costUsd: (res.usage.inputTokens * inP + res.usage.outputTokens * outP) / 1e6,
        });
        return res;
      } catch (err) {
        calls.push({ backend: "api", model, latencyMs: Date.now() - started, inputTokens: 0, outputTokens: 0, costUsd: 0, error: String(err) });
        throw err;
      }
    },
  };
}

export interface CliOptions extends BackendOptions {
  claudeBin?: string;
  /** CLAUDE_CONFIG_DIR of the login to use (e.g. a personal account). */
  configDir?: string;
  timeoutMs?: number;
}

export function cliBackend(opts: CliOptions): Backend {
  const models = { ...DEFAULT_MODELS, ...opts.models };
  const calls: CallRecord[] = [];
  return {
    name: "cli",
    calls,
    spentUsd: () => 0,
    async complete(request) {
      const model = models[request.tier];
      const started = Date.now();
      try {
        const res = await runClaude(withNeutraliser(request, opts.neutralise), model, opts);
        calls.push({ backend: "cli", model, latencyMs: res.latencyMs, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, costUsd: res.costUsd });
        return res;
      } catch (err) {
        calls.push({ backend: "cli", model, latencyMs: Date.now() - started, inputTokens: 0, outputTokens: 0, costUsd: 0, error: String(err) });
        throw err;
      }
    },
  };
}

/**
 * The CLI takes one prompt, so the conversation is rendered as a transcript.
 * That is itself a difference from the API path, and part of what a
 * backend comparison measures.
 */
export function renderForCli(request: LLMCompletionRequest): { system: string; prompt: string } {
  const system = request.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const turns = request.messages.filter((m) => m.role !== "system");
  const json = request.jsonMode
    ? "\n\nRespond ONLY with valid JSON. No markdown, no explanation." +
      (request.jsonSchema ? `\nThe JSON must match this JSON Schema:\n${JSON.stringify(request.jsonSchema)}` : "")
    : "";
  const prompt =
    turns.length === 1 && turns[0].role === "user"
      ? turns[0].content
      : "<transcript>\n" +
        turns.map((m) => `[${m.role}]: ${m.content}`).join("\n\n") +
        "\n</transcript>\n\nWrite the assistant's next response to the final user message, following your instructions.";
  return { system: system + json, prompt };
}

async function runClaude(
  request: LLMCompletionRequest,
  model: string,
  opts: CliOptions,
): Promise<LLMCompletionResponse & { costUsd: number }> {
  const { system, prompt } = renderForCli(request);
  // An empty folder: no repo, no CLAUDE.md, no project settings to pick up.
  const cwd = mkdtempSync(path.join(tmpdir(), "revualy-eval-"));
  const args = [
    "-p",
    "--model", model,
    "--output-format", "json",
    "--system-prompt", system || "You are a helpful assistant.",
    "--setting-sources=",
    "--tools=",
    "--no-session-persistence",
    ...(request.effort ? ["--effort", request.effort] : []),
    "--",
    prompt,
  ];
  const started = Date.now();
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(opts.claudeBin ?? "claude", args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...(opts.configDir ? { CLAUDE_CONFIG_DIR: opts.configDir } : {}) },
      });
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`claude -p timed out after ${opts.timeoutMs ?? 180_000} ms`));
      }, opts.timeoutMs ?? 180_000);
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(out);
        else reject(new Error(`claude -p exited ${code}: ${(err || out).slice(-300)}`));
      });
    });
    const parsed = JSON.parse(stdout) as {
      result?: string;
      is_error?: boolean;
      usage?: { input_tokens?: number; output_tokens?: number };
      total_cost_usd?: number;
      stop_reason?: string;
    };
    if (parsed.is_error) throw new Error(`claude -p error: ${parsed.result ?? "unknown"}`);
    let content = (parsed.result ?? "").trim();
    if (request.jsonMode) content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return {
      content,
      usage: { inputTokens: parsed.usage?.input_tokens ?? 0, outputTokens: parsed.usage?.output_tokens ?? 0 },
      model,
      latencyMs: Date.now() - started,
      stopReason: parsed.stop_reason,
      costUsd: parsed.total_cost_usd ?? 0,
    };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
