#!/usr/bin/env node
/**
 * claude-llm-shim — a minimal OpenAI-compatible chat-completions server that
 * proxies every request to the local `claude -p` CLI. This lets the Revualy
 * app's LLMGateway (via its OpenAI-compat adapter) generate the bot's turns
 * with NO paid API key — `claude -p` is the model.
 *
 * Run:  node scripts/claude-llm-shim.mjs            # listens on :8787
 * Point the API at it:
 *   LLM_PROVIDER=openai
 *   LLM_BASE_URL=http://localhost:8787/v1
 *   LLM_API_KEY=sk-local
 *   LLM_MODEL_FAST=claude-cli  LLM_MODEL_STANDARD=claude-cli  LLM_MODEL_ADVANCED=claude-cli
 */
import http from "node:http";
import { spawn } from "node:child_process";

const PORT = Number(process.env.SHIM_PORT ?? 8787);

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p"], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("claude -p timed out"));
    }, 90_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !out.trim()) reject(new Error(`claude -p exited ${code}: ${err}`));
      else resolve(out.trim());
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/** Pull the first balanced JSON value out of noisy model output. */
function extractJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : text;
  const start = body.search(/[[{]/);
  if (start === -1) return body.trim();
  const open = body[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = start; i < body.length; i++) {
    if (body[i] === open) depth++;
    else if (body[i] === close) {
      depth--;
      if (depth === 0) return body.slice(start, i + 1).trim();
    }
  }
  return body.slice(start).trim();
}

function buildPrompt(messages) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const convo = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");
  const wantJson = /json/i.test(system) || /json/i.test(convo);
  const directive = wantJson
    ? "Return ONLY the JSON the instructions ask for. No markdown, no code fences, no commentary."
    : "Return ONLY the assistant message text the instructions call for — one message, no preamble, no markdown, no surrounding quotes.";
  const prompt = [system, convo ? `Conversation so far:\n${convo}` : "", directive]
    .filter(Boolean)
    .join("\n\n");
  return { prompt, wantJson };
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || !req.url.includes("/chat/completions")) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", async () => {
    try {
      const body = JSON.parse(raw || "{}");
      const { prompt, wantJson } = buildPrompt(body.messages ?? []);
      let content = await runClaude(prompt);
      if (wantJson) content = extractJson(content);
      const now = 1_700_000_000; // fixed stamp; time not meaningful here
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: `chatcmpl-shim-${now}`,
          object: "chat.completion",
          created: now,
          model: body.model ?? "claude-cli",
          choices: [
            { index: 0, message: { role: "assistant", content }, finish_reason: "stop" },
          ],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        }),
      );
      process.stdout.write(`[shim] ${wantJson ? "json" : "text"} → ${content.slice(0, 80).replace(/\n/g, " ")}\n`);
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message ?? e) }));
      process.stdout.write(`[shim] ERROR ${e.message}\n`);
    }
  });
});

server.listen(PORT, () => process.stdout.write(`claude-llm-shim listening on http://localhost:${PORT}/v1\n`));
