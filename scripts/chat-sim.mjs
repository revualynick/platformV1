#!/usr/bin/env node
/**
 * chat-sim — drive a Revualy feedback conversation locally against the running
 * API's /api/v1/dev/simulate-chat harness. Designed so `claude -p` can play the
 * employee side of a chat across turns.
 *
 * Setup: API running on :3000 with TEST_LOGIN_ENABLED=true and TEST_LOGIN_KEY
 * set (see .env). The key is read from $TEST_LOGIN_KEY or the repo .env.
 *
 * Usage:
 *   node scripts/chat-sim.mjs --email sarah.chen@acmecorp.com --start
 *   node scripts/chat-sim.mjs --email sarah.chen@acmecorp.com --message "It went well, shipped the API."
 *   node scripts/chat-sim.mjs --email sarah.chen@acmecorp.com --reset
 *
 * Flags:
 *   --email <e>     (required) the person chatting (a seeded user)
 *   --message <m>   send a reply; starts a conversation first if none is active
 *   --start         force-start a new conversation (prints the opening question)
 *   --type <t>      interaction type for a new conversation (default self_reflection)
 *   --subject <e>   subject email for peer_review / three_sixty
 *   --reset         forget the saved conversation for this email
 *   --url <u>       API base URL (default http://localhost:3000)
 *   --json          print raw JSON instead of formatted text
 *
 * Conversation continuity is stored in scripts/.chat-sim-state.json keyed by email.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, ".chat-sim-state.json");
const ENV_FILE = join(__dirname, "..", ".env");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function loadEnvVar(name) {
  if (process.env[name]) return process.env[name];
  if (existsSync(ENV_FILE)) {
    for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
      const m = line.match(new RegExp(`^${name}=(.+)$`));
      if (m) return m[1].trim();
    }
  }
  return "";
}

function loadState() {
  if (!existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}
function saveState(s) {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

async function call(url, key, internalSecret, body) {
  const res = await fetch(`${url}/api/v1/dev/simulate-chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-test-login-key": key,
      // Satisfies the API's internal-secret trust layer for /api/v1 routes.
      "x-internal-secret": internalSecret,
      "x-user-id": "chat-sim",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint = json.hint ? `\n  hint: ${json.hint}` : "";
    throw new Error(`${res.status}: ${json.error ?? "request failed"}${hint}`);
  }
  return json;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email;
  const url = args.url || "http://localhost:3000";
  const key = loadEnvVar("TEST_LOGIN_KEY");
  const internalSecret = loadEnvVar("INTERNAL_API_SECRET");

  if (!email) {
    console.error("--email is required");
    process.exit(1);
  }
  if (!key) {
    console.error("TEST_LOGIN_KEY not found (env or .env)");
    process.exit(1);
  }
  if (!internalSecret) {
    console.error("INTERNAL_API_SECRET not found (env or .env)");
    process.exit(1);
  }

  const state = loadState();

  if (args.reset) {
    delete state[email];
    saveState(state);
    console.log(`reset conversation for ${email}`);
    return;
  }

  const active = state[email]?.conversationId;
  let result;

  const wantStart = args.start || !active;
  if (wantStart) {
    result = await call(url, key, internalSecret, {
      email,
      interactionType: args.type || "self_reflection",
      subjectEmail: args.subject,
    });
    state[email] = { conversationId: result.conversationId };
    saveState(state);
    // If a message was also supplied, send it immediately as the first reply.
    if (typeof args.message === "string") {
      printResult(result, args.json, "bot");
      result = await call(url, key, internalSecret, {
        email,
        conversationId: result.conversationId,
        message: args.message,
      });
    }
  } else {
    if (typeof args.message !== "string") {
      console.error("--message is required to continue a conversation");
      process.exit(1);
    }
    result = await call(url, key, internalSecret, {
      email,
      conversationId: active,
      message: args.message,
    });
  }

  if (result.closed) {
    delete state[email];
    saveState(state);
  }
  printResult(result, args.json, "bot");
}

function printResult(result, asJson, who) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`\n${who}: ${result.reply}`);
  console.log(
    `\n[conversation=${result.conversationId} turn=${result.messageCount}${result.closed ? " CLOSED" : ""}]`,
  );
}

main().catch((e) => {
  console.error(`chat-sim error: ${e.message}`);
  process.exit(1);
});
