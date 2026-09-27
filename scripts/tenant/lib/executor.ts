import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { redact } from "./secrets.js";

// ── Actions ──────────────────────────────────────────────
//
// Every external effect is described as an action first. A dry run prints
// the action; a live run prints the same (redacted) text and then performs
// it. Tokens are never part of an action: `auth` names the credential and
// the live executor looks it up at call time.

export interface CliAction {
  kind: "cli";
  purpose: string;
  argv: string[];
  cwd?: string;
  /** Extra environment for the child. Shown in the printout, so never secret. */
  env?: Record<string, string>;
  /** Piped to stdin. May contain secrets: redacted when printed. */
  stdin?: string;
  /** Stdout contains secrets: never echo it, even on failure. */
  sensitiveOutput?: boolean;
  /** What a dry run pretends the command printed, so later logic can proceed. */
  dryResult?: string;
}

export interface HttpAction {
  kind: "http";
  purpose: string;
  method: "GET" | "POST";
  url: string;
  auth?: "cloudflare" | "railway" | "ops";
  body?: unknown;
  dryResult?: HttpResult;
}

export interface HttpResult {
  status: number;
  body: string;
}

export interface ManualAction {
  kind: "manual";
  purpose: string;
  instructions: string[];
}

export interface LocalAction {
  kind: "local";
  purpose: string;
  run: () => void | Promise<void>;
}

export type Action = CliAction | HttpAction | ManualAction | LocalAction;

export interface Executor {
  readonly live: boolean;
  cli(action: Omit<CliAction, "kind">): Promise<string>;
  http(action: Omit<HttpAction, "kind">): Promise<HttpResult>;
  manual(action: Omit<ManualAction, "kind">): void;
  local(action: Omit<LocalAction, "kind">): Promise<void>;
  log(line: string): void;
}

// ── Formatting ───────────────────────────────────────────

export function shellQuote(arg: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

const AUTH_HEADER: Record<NonNullable<HttpAction["auth"]>, string> = {
  cloudflare: "Authorization: Bearer $CLOUDFLARE_API_TOKEN",
  railway: "Authorization: Bearer $RAILWAY_API_TOKEN (or the token in ~/.railway/config.json)",
  ops: "Authorization: Bearer $OPS_TOKEN",
};

/** Human-readable, copy-pasteable form of an action, with secrets redacted. */
export function formatAction(action: Action, secrets: Record<string, string | undefined>): string[] {
  const lines: string[] = [`# ${action.purpose}`];
  switch (action.kind) {
    case "cli": {
      const env = Object.entries(action.env ?? {}).map(([k, v]) => `${k}=${shellQuote(v)} `).join("");
      const cmd = `${env}${action.argv.map(shellQuote).join(" ")}`;
      const prefix = action.cwd ? `cd ${shellQuote(action.cwd)} && ` : "";
      if (action.stdin !== undefined) {
        lines.push(`$ ${prefix}${cmd} <<'EOF'`);
        lines.push(...action.stdin.split("\n"));
        lines.push("EOF");
      } else {
        lines.push(`$ ${prefix}${cmd}`);
      }
      break;
    }
    case "http":
      lines.push(`> ${action.method} ${action.url}`);
      if (action.auth) lines.push(`> ${AUTH_HEADER[action.auth]}`);
      if (action.body !== undefined) {
        lines.push("> Content-Type: application/json");
        lines.push(...JSON.stringify(action.body, null, 2).split("\n").map((l) => `> ${l}`));
      }
      break;
    case "manual":
      lines.push("MANUAL STEP (Nick):");
      lines.push(...action.instructions.map((i) => `  - ${i}`));
      break;
    case "local":
      lines.push("(local file operation, no network)");
      break;
  }
  return lines.map((l) => redact(l, secrets));
}

// ── Dry run ──────────────────────────────────────────────

export class DryRunExecutor implements Executor {
  readonly live = false;
  readonly actions: Action[] = [];

  constructor(
    private readonly secrets: () => Record<string, string | undefined>,
    private readonly out: (line: string) => void = console.log,
  ) {}

  private print(action: Action) {
    this.actions.push(action);
    for (const line of formatAction(action, this.secrets())) this.out(`  ${line}`);
    this.out("");
  }

  async cli(action: Omit<CliAction, "kind">): Promise<string> {
    this.print({ kind: "cli", ...action });
    return action.dryResult ?? "";
  }

  async http(action: Omit<HttpAction, "kind">): Promise<HttpResult> {
    this.print({ kind: "http", ...action });
    return action.dryResult ?? { status: 200, body: "{}" };
  }

  manual(action: Omit<ManualAction, "kind">): void {
    this.print({ kind: "manual", ...action });
  }

  async local(action: Omit<LocalAction, "kind">): Promise<void> {
    this.print({ kind: "local", ...action });
  }

  log(line: string): void {
    this.out(redact(line, this.secrets()));
  }
}

// ── Live ─────────────────────────────────────────────────

export class LiveExecutor implements Executor {
  readonly live = true;

  constructor(
    private readonly secrets: () => Record<string, string | undefined>,
    private readonly out: (line: string) => void = console.log,
  ) {}

  private announce(action: Action) {
    for (const line of formatAction(action, this.secrets())) this.out(`  ${line}`);
  }

  async cli(a: Omit<CliAction, "kind">): Promise<string> {
    const action: CliAction = { kind: "cli", ...a };
    this.announce(action);
    const [cmd, ...args] = action.argv;
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd: action.cwd,
        env: { ...process.env, ...action.env },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
      child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          if (!action.sensitiveOutput && stdout.trim()) this.out(redact(indent(stdout.trim()), this.secrets()));
          resolve(stdout);
        } else {
          const detail = action.sensitiveOutput ? "(output withheld: may contain secrets)" : redact(stderr.trim() || stdout.trim(), this.secrets()).slice(0, 2000);
          reject(new Error(`${cmd} exited with code ${code}: ${detail}`));
        }
      });
      if (action.stdin !== undefined) child.stdin.write(action.stdin);
      child.stdin.end();
    });
  }

  async http(a: Omit<HttpAction, "kind">): Promise<HttpResult> {
    const action: HttpAction = { kind: "http", ...a };
    this.announce(action);
    const headers: Record<string, string> = {};
    if (action.auth) headers.Authorization = `Bearer ${resolveToken(action.auth)}`;
    if (action.body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(action.url, {
      method: action.method,
      headers,
      body: action.body === undefined ? undefined : JSON.stringify(action.body),
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.text();
    this.out(`  < ${res.status}`);
    return { status: res.status, body };
  }

  manual(a: Omit<ManualAction, "kind">): void {
    this.announce({ kind: "manual", ...a });
  }

  async local(a: Omit<LocalAction, "kind">): Promise<void> {
    this.announce({ kind: "local", ...a });
    await a.run();
  }

  log(line: string): void {
    this.out(redact(line, this.secrets()));
  }
}

function indent(text: string): string {
  return text.split("\n").map((l) => `    ${l}`).join("\n");
}

function resolveToken(kind: "cloudflare" | "railway" | "ops"): string {
  if (kind === "ops") {
    const token = process.env.OPS_TOKEN;
    if (!token) throw new Error("OPS_TOKEN is not set (the fleet-wide ops token each tenant's web service has)");
    return token;
  }
  if (kind === "cloudflare") {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!token) throw new Error("CLOUDFLARE_API_TOKEN is not set (needs Zone.DNS edit on the revualy.com zone)");
    return token;
  }
  if (process.env.RAILWAY_API_TOKEN) return process.env.RAILWAY_API_TOKEN;
  const config = join(homedir(), ".railway", "config.json");
  if (existsSync(config)) {
    const token = (JSON.parse(readFileSync(config, "utf8")) as { user?: { token?: string } }).user?.token;
    if (token) return token;
  }
  throw new Error("No Railway token: run `railway login` or set RAILWAY_API_TOKEN");
}
