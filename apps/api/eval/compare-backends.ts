/**
 * Experiment 1: does `claude -p` behave like the real API for the bot?
 *
 * Every snapshot is answered by both backends, several times, with the same
 * prompt (including the same neutraliser line). Hard rules are checked in
 * code; a separate Opus 5.5 judge scores each turn blind. The only thing
 * that differs between the two columns of the report is the backend.
 *
 *   pnpm --filter @revualy/api exec tsx eval/compare-backends.ts \
 *     --repeats 3 --budget 2 --claude-config-dir ~/.claude-personal
 *
 * Options: --repeats N (3), --backends api,cli, --only id,id, --budget USD
 * (API spend cap, 2), --no-judge, --no-neutralise, --out DIR (eval/results).
 * The API key is read from $ANTHROPIC_API_KEY or the file in
 * $REVUALY_EVAL_ENV (default ~/.config/revualy-eval/anthropic.env).
 */
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { planTurnTraced, type PlanTrace } from "../src/lib/turn-planner.js";
import { apiBackend, cliBackend, type Backend, type BackendName } from "./lib/backends.js";
import { SNAPSHOTS, type Snapshot } from "./lib/snapshots.js";
import { check, passes, type CheckResult } from "./lib/checks.js";
import { judgeTurn, RUBRIC_VERSION, SCORE_KEYS, type JudgeScores } from "./lib/judge.js";

const { values: args } = parseArgs({
  options: {
    repeats: { type: "string", default: "3" },
    backends: { type: "string", default: "api,cli" },
    only: { type: "string" },
    budget: { type: "string", default: "2" },
    "no-judge": { type: "boolean", default: false },
    "no-neutralise": { type: "boolean", default: false },
    "claude-config-dir": { type: "string" },
    "claude-bin": { type: "string" },
    out: { type: "string", default: "eval/results" },
  },
});

interface Result {
  snapshot: string;
  edge: boolean;
  backend: BackendName;
  repeat: number;
  trace: PlanTrace;
  checks: CheckResult;
  pass: boolean;
  latencyMs: number;
  judge?: JudgeScores;
  judgeError?: string;
}

const quiet = { warn: () => {} };

function loadApiKey(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const file = process.env.REVUALY_EVAL_ENV ?? path.join(homedir(), ".config/revualy-eval/anthropic.env");
  if (!existsSync(file)) throw new Error(`No ANTHROPIC_API_KEY and no ${file}`);
  const m = /^ANTHROPIC_API_KEY=(.+)$/m.exec(readFileSync(file, "utf8"));
  if (!m) throw new Error(`${file} has no ANTHROPIC_API_KEY line`);
  return m[1].trim();
}

/** Run tasks with at most `limit` in flight. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

async function main() {
  const repeats = Number(args.repeats);
  const neutralise = !args["no-neutralise"];
  const configDir = args["claude-config-dir"]?.replace(/^~/, homedir());
  const names = args.backends!.split(",") as BackendName[];
  const snapshots = args.only ? SNAPSHOTS.filter((s) => args.only!.split(",").includes(s.id)) : SNAPSHOTS;

  const backends: Record<string, Backend> = {};
  if (names.includes("api")) backends.api = apiBackend(loadApiKey(), { neutralise, budgetUsd: Number(args.budget) });
  if (names.includes("cli")) backends.cli = cliBackend({ neutralise, configDir, claudeBin: args["claude-bin"] });
  const judge = cliBackend({ neutralise, configDir, claudeBin: args["claude-bin"] });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = path.resolve(args.out!, `compare-${stamp}`);
  mkdirSync(dir, { recursive: true });
  const log = (line: string) => {
    console.log(line);
    appendFileSync(path.join(dir, "progress.log"), line + "\n");
  };
  log(`backends=${names.join(",")} snapshots=${snapshots.length} repeats=${repeats} neutralise=${neutralise} rubric=${RUBRIC_VERSION}`);

  // ── Generate ──
  const results: Result[] = [];
  const jobs = snapshots.flatMap((s) => names.flatMap((b) => Array.from({ length: repeats }, (_, r) => ({ s, b, r }))));
  const byBackend = (b: BackendName) => jobs.filter((j) => j.b === b);
  const runJob = async ({ s, b, r }: { s: Snapshot; b: BackendName; r: number }) => {
    const started = Date.now();
    const trace = await planTurnTraced(backends[b], s.input, { logger: quiet });
    const checks = check(s, trace);
    const res: Result = { snapshot: s.id, edge: Boolean(s.edge), backend: b, repeat: r, trace, checks, pass: passes(checks), latencyMs: Date.now() - started };
    results.push(res);
    appendFileSync(path.join(dir, "results.jsonl"), JSON.stringify(res) + "\n");
    log(`${b} ${s.id}#${r} ${res.pass ? "pass" : "FAIL"} ${trace.plan.action} ${res.latencyMs}ms ${trace.plan.question ? JSON.stringify(trace.plan.question.slice(0, 90)) : ""}`);
  };
  await Promise.all([
    names.includes("api") ? pool(byBackend("api"), 4, runJob) : Promise.resolve(),
    names.includes("cli") ? pool(byBackend("cli"), 2, runJob) : Promise.resolve(),
  ]);

  // ── Judge (blind: shuffled, no backend shown) ──
  if (!args["no-judge"]) {
    const order = [...results].sort(() => Math.random() - 0.5);
    let done = 0;
    await pool(order, 2, async (res) => {
      const s = snapshots.find((x) => x.id === res.snapshot)!;
      try {
        res.judge = await judgeTurn(judge, s, res.trace);
      } catch (err) {
        res.judgeError = String(err);
      }
      if (++done % 10 === 0) log(`judged ${done}/${order.length}`);
    });
  }

  writeFileSync(path.join(dir, "results.json"), JSON.stringify(results, null, 2));
  const report = buildReport(results, snapshots, backends, judge, { repeats, neutralise });
  writeFileSync(path.join(dir, "report.md"), report);
  log(`report: ${path.join(dir, "report.md")}`);
}

// ── Report ─────────────────────────────────────────────

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "n/a");
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) : 0;
};
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN;
};
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "n/a");

function buildReport(
  results: Result[],
  snapshots: Snapshot[],
  backends: Record<string, Backend>,
  judge: Backend,
  meta: { repeats: number; neutralise: boolean },
): string {
  const names = Object.keys(backends) as BackendName[];
  const of = (b: string) => results.filter((r) => r.backend === b);
  const rate = (rs: Result[], key: keyof CheckResult) => {
    const applicable = rs.filter((r) => r.checks[key] !== null);
    const good = applicable.filter((r) => (key === "fallback" || key === "overridden" || key === "leak" ? !r.checks[key] : r.checks[key]));
    return pct(good.length, applicable.length);
  };
  const row = (label: string, f: (b: string) => string) => `| ${label} | ${names.map(f).join(" | ")} |`;
  const head = `| | ${names.join(" | ")} |\n|---|${names.map(() => "---").join("|")}|`;

  const lines: string[] = [];
  lines.push(`# Backend comparison: ${names.join(" vs ")}`, "");
  lines.push(
    `${snapshots.length} snapshots x ${meta.repeats} repeats per backend. Same prompt for both${meta.neutralise ? ", including the neutraliser line" : ""}. ` +
      `Judge: Opus 5.5 via claude -p, rubric ${RUBRIC_VERSION}, blind to the backend.`,
    "",
  );
  lines.push("## Hard rules (share of turns that hold each rule)", "", head);
  lines.push(row("All rules pass", (b) => pct(of(b).filter((r) => r.pass).length, of(b).length)));
  lines.push(row("Usable plan, no fallback", (b) => rate(of(b), "fallback")));
  lines.push(row("Usable on first try", (b) => rate(of(b), "validFirstTry")));
  lines.push(row("Action as expected", (b) => rate(of(b), "actionMatch")));
  lines.push(row("Judgement as expected", (b) => rate(of(b), "qualityMatch")));
  lines.push(row("Rules did not need to override", (b) => rate(of(b), "overridden")));
  lines.push(row("One question", (b) => rate(of(b), "oneQuestion")));
  lines.push(row("Short enough", (b) => rate(of(b), "shortEnough")));
  lines.push(row("Nothing revealed", (b) => rate(of(b), "noReveal")));
  lines.push(row("Self-reflection in 2nd person", (b) => rate(of(b), "selfNoThirdPerson")));
  lines.push(row("Injection / forbidden text resisted", (b) => rate(of(b), "mustNotContain")));
  lines.push(row("No account/machine leak (artefact)", (b) => rate(of(b), "leak")));
  lines.push("");

  lines.push("## Judge scores (mean, 1-5; sd across all turns)", "", head);
  for (const k of SCORE_KEYS) {
    lines.push(row(k, (b) => {
      const xs = of(b).flatMap((r) => (r.judge ? [r.judge[k]] : []));
      return `${f1(mean(xs))} (${f1(sd(xs))})`;
    }));
  }
  lines.push(row("judge errors", (b) => String(of(b).filter((r) => r.judgeError).length)));
  lines.push(row("expected cases: overall", (b) => f1(mean(of(b).filter((r) => !r.edge && r.judge).map((r) => r.judge!.overall)))));
  lines.push(row("edge cases: overall", (b) => f1(mean(of(b).filter((r) => r.edge && r.judge).map((r) => r.judge!.overall)))));
  lines.push(
    row("run-to-run spread (mean sd of overall per snapshot)", (b) =>
      f1(mean(snapshots.map((s) => sd(of(b).filter((r) => r.snapshot === s.id && r.judge).map((r) => r.judge!.overall))))),
    ),
  );
  lines.push("");

  lines.push("## Speed and cost", "", head);
  lines.push(row("latency p50 / p95 (s)", (b) => {
    const xs = of(b).map((r) => r.latencyMs / 1000);
    return `${f1(quantile(xs, 0.5))} / ${f1(quantile(xs, 0.95))}`;
  }));
  lines.push(row("backend errors", (b) => String(backends[b].calls.filter((c) => c.error).length)));
  lines.push(row("cost (US$)", (b) => (b === "api" ? `$${backends[b].spentUsd().toFixed(4)} billed` : `$${backends[b].calls.reduce((s, c) => s + c.costUsd, 0).toFixed(4)} est., subscription`)));
  lines.push(`\nJudge: ${judge.calls.length} calls, ${judge.calls.filter((c) => c.error).length} errors.`, "");

  lines.push("## Per snapshot", "", `| snapshot | ${names.map((b) => `${b}: pass / overall / actions`).join(" | ")} |`, `|---|${names.map(() => "---").join("|")}|`);
  for (const s of snapshots) {
    const cells = names.map((b) => {
      const rs = of(b).filter((r) => r.snapshot === s.id);
      const actions = [...new Set(rs.map((r) => r.trace.plan.action))].join(",");
      return `${rs.filter((r) => r.pass).length}/${rs.length} / ${f1(mean(rs.flatMap((r) => (r.judge ? [r.judge.overall] : []))))} / ${actions}`;
    });
    lines.push(`| ${s.edge ? "(edge) " : ""}${s.id} | ${cells.join(" | ")} |`);
  }
  lines.push("");

  lines.push("## What each backend said (first repeat)", "");
  for (const s of snapshots) {
    lines.push(`### ${s.id}: ${s.about}`, "", `> ${s.input.reply.replace(/\n+/g, " ")}`, "");
    for (const b of names) {
      const r = of(b).find((x) => x.snapshot === s.id && x.repeat === 0);
      if (!r) continue;
      const failed = (Object.keys(r.checks) as Array<keyof CheckResult>).filter((k) =>
        k === "fallback" || k === "overridden" || k === "leak" ? r.checks[k] === true : r.checks[k] === false,
      );
      lines.push(
        `- **${b}** (${r.trace.plan.quality}, ${r.trace.plan.action}${failed.length ? `; failed: ${failed.join(", ")}` : ""}${r.judge ? `; overall ${r.judge.overall}` : ""}): ${r.trace.plan.question ?? "(close)"}`,
      );
      if (r.judge?.issues.length) lines.push(`  - judge: ${r.judge.issues.join("; ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
