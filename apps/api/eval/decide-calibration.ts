/**
 * Calibration of decide() on the concern decision (docs/design/typed-decisions.md).
 *
 * Runs the concern decision through decide() over the frozen snapshots, the
 * local-model rewrites and the topic grid, --repeats times each, and reports:
 *  - a reliability table: accuracy per confidence band (is 0.9 right 9 in 10?)
 *  - the same for routing (concern vs none), which is what a policy acts on
 *  - a threshold sweep for "accept none only above t, otherwise escalate"
 *  - consistency across repeats, and every wrong answer at 0.9 or above
 *  - agreement with the current turn planner's concern flag, from a live run
 *    (--planner) or an earlier e2e run's results (--planner-results)
 *
 * Correct means the choice is in the snapshot's acceptable concerns
 * (snapshots.ts): a person's judgement, not ground truth.
 *
 *   # on the box, in apps/api (API key as for the other experiments):
 *   pnpm exec tsx eval/decide-calibration.ts --repeats 3 --budget 5
 *   pnpm exec tsx eval/decide-calibration.ts --configs standard:medium,advanced:high --repeats 3 --budget 15
 *   pnpm exec tsx eval/decide-calibration.ts --planner-results eval/results/e2e-<stamp>/results.json
 *   # no key, no calls (CI, or to check the report):
 *   pnpm exec tsx eval/decide-calibration.ts --dry-run
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  decide,
  formatReliability,
  reliability,
  DEFAULT_BAND_EDGES,
  type EffortLevel,
  type LLMCompletionRequest,
  type LLMCompletionResponse,
  type Decision,
} from "@revualy/ai-core";
import type { ModelTier } from "@revualy/shared";
import { planTurnTraced } from "../src/lib/turn-planner.js";
import type { Concern } from "../src/lib/bot-references.js";
import { apiBackend, type Backend } from "./lib/backends.js";
import { SNAPSHOTS, concernsFor, paraphraseSnapshots, type Snapshot } from "./lib/snapshots.js";
import { TOPIC_GRID } from "./lib/topic-grid.js";
import { concernDecisionSpec } from "./lib/concern-decision.js";

const { values: args } = parseArgs({
  options: {
    repeats: { type: "string", default: "3" },
    budget: { type: "string", default: "5" },
    // tier:effort pairs; effort "default" uses decide()'s default for the tier.
    configs: { type: "string", default: "standard:medium" },
    only: { type: "string" },
    "no-grid": { type: "boolean", default: false },
    "no-paraphrases": { type: "boolean", default: false },
    // Also run the turn planner live on the same inputs (one call per snapshot per repeat).
    planner: { type: "boolean", default: false },
    // Or read its flags from an earlier e2e-concerns run (results.json or cases.jsonl).
    "planner-results": { type: "string" },
    "dry-run": { type: "boolean", default: false },
    concurrency: { type: "string", default: "4" },
    out: { type: "string", default: "eval/results" },
  },
});

interface Config {
  tier: ModelTier;
  effort: EffortLevel | undefined;
  label: string;
}

function parseConfigs(text: string): Config[] {
  return text.split(",").map((part) => {
    const [tier, effort = "default"] = part.trim().split(":");
    if (!["fast", "standard", "advanced"].includes(tier)) throw new Error(`unknown tier "${tier}" in --configs`);
    if (effort !== "default" && !["low", "medium", "high", "xhigh", "max"].includes(effort)) throw new Error(`unknown effort "${effort}"`);
    return { tier: tier as ModelTier, effort: effort === "default" ? undefined : (effort as EffortLevel), label: `${tier}:${effort}` };
  });
}

function loadApiKey(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const file = process.env.REVUALY_EVAL_ENV ?? path.join(homedir(), ".config/revualy-eval/anthropic.env");
  if (!existsSync(file)) throw new Error(`No ANTHROPIC_API_KEY and no ${file} (use --dry-run to run without one)`);
  const m = /^ANTHROPIC_API_KEY=(.+)$/m.exec(readFileSync(file, "utf8"));
  if (!m) throw new Error(`${file} has no ANTHROPIC_API_KEY line`);
  return m[1].trim();
}

/** Deterministic stand-in for the model: plausible JSON, sometimes invalid, never a network call. */
function fakeBackend(seed = 1): Backend {
  let calls = 0;
  const hash = (s: string) => {
    let h = 2166136261 ^ seed;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0) / 2 ** 32;
  };
  return {
    name: "api",
    calls: [],
    spentUsd: () => 0,
    async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
      const n = ++calls;
      const last = request.messages[request.messages.length - 1]?.content ?? "";
      const r = hash(`${last}#${n}`);
      const schema = request.jsonSchema as { properties?: Record<string, { enum?: string[] }> } | undefined;
      const options = schema?.properties?.choice?.enum;
      let content: string;
      if (r < 0.04) content = "sorry, not JSON";
      else if (options) {
        // Mostly "none" unless the text sounds heavy, so the report has some shape.
        const heavy = /(anxi|burn|dread|end|disappear|better off|harass|religion|bully|shout|who sees|manager (get|read)|chatgpt|off the record)/i.test(last);
        const choice = heavy ? options[1 + Math.floor(hash(last) * (options.length - 1))] : r < 0.85 ? "none" : options[Math.floor(r * options.length)];
        content = JSON.stringify({ rationale: "fake", choice, confidence: Math.round((0.55 + 0.45 * hash(`${last}c${n}`)) * 100) / 100 });
      } else {
        content = JSON.stringify({ rationale: "fake", quality: "answered", action: "next_theme", question: "And how clear is their communication?", concern: "none" });
      }
      return { content, usage: { inputTokens: 0, outputTokens: 0 }, model: "fake", latencyMs: 0, stopReason: "end_turn" };
    },
    async completeWithTools() {
      throw new Error("fake backend: no tools");
    },
  };
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

interface Row {
  config: string;
  snapshot: string;
  paraphraseOf?: string;
  repeat: number;
  expected: Concern[];
  ok: boolean;
  choice: Concern | null;
  confidence: number | null;
  rationale: string;
  error?: string;
  attempts: number;
  latencyMs: number;
  correct: boolean | null;
  routeCorrect: boolean | null;
  plannerFlag?: Concern | null;
}

/** Routing view: does the choice send the turn where an acceptable label would? */
const routeOk = (choice: Concern, expected: Concern[]) => expected.some((e) => (e === "none") === (choice === "none"));
const isRealConcern = (expected: Concern[]) => !expected.includes("none");

function loadPlannerFlags(file: string): Map<string, Concern[]> {
  const text = readFileSync(file, "utf8");
  const rows: Array<{ snapshot: string; scriptFlag: Concern }> = file.endsWith(".jsonl")
    ? text.split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : JSON.parse(text);
  const map = new Map<string, Concern[]>();
  for (const r of rows) map.set(r.snapshot, [...(map.get(r.snapshot) ?? []), r.scriptFlag]);
  return map;
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "-");

function thresholdSweep(rows: Row[]): string {
  const decided = rows.filter((r) => r.ok);
  const lines = [
    "### Policy sweep: accept \"none\" only at or above t, otherwise escalate to the reference path",
    "",
    "Failures always escalate. Missed = a real concern accepted as none. Over-routed = a turn whose acceptable labels include none, escalated.",
    "",
    "| t | accepted none | missed concerns | real concerns | miss rate | over-routed | ordinary turns | over-route rate |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const t of [0, 0.7, 0.8, 0.9, 0.95, 0.99]) {
    let accepted = 0, missed = 0, overRouted = 0;
    const real = rows.filter((r) => isRealConcern(r.expected)).length;
    const ordinary = rows.length - real;
    for (const r of rows) {
      const acceptNone = r.ok && r.choice === "none" && (r.confidence ?? 0) >= t;
      if (acceptNone) {
        accepted++;
        if (isRealConcern(r.expected)) missed++;
      } else if (!isRealConcern(r.expected)) {
        overRouted++;
      }
    }
    lines.push(`| ${t} | ${accepted} | ${missed} | ${real} | ${pct(missed, real)} | ${overRouted} | ${ordinary} | ${pct(overRouted, ordinary)} |`);
  }
  lines.push("", `(${rows.length - decided.length} failed decisions counted as escalations.)`);
  return lines.join("\n");
}

function consistency(rows: Row[]): string {
  const by = new Map<string, Row[]>();
  for (const r of rows) if (!r.paraphraseOf) by.set(r.snapshot, [...(by.get(r.snapshot) ?? []), r]);
  const unstable: string[] = [];
  let stable = 0;
  for (const [id, rs] of by) {
    if (rs.length < 2) continue;
    const counts = new Map<string, number>();
    for (const r of rs) counts.set(r.choice ?? "FAILED", (counts.get(r.choice ?? "FAILED") ?? 0) + 1);
    if (counts.size === 1) stable++;
    else unstable.push(`- ${id} (expected ${rs[0].expected.join("|")}): ${[...counts].map(([c, n]) => `${c}×${n}`).join(", ")}; confidences ${rs.map((r) => r.confidence?.toFixed(2) ?? "-").join(", ")}`);
  }
  const total = [...by.values()].filter((rs) => rs.length >= 2).length;
  return [
    "### Consistency across repeats",
    "",
    `${stable} of ${total} repeated inputs gave the same choice every time.`,
    ...(unstable.length ? ["", "Varied:", ...unstable] : []),
  ].join("\n");
}

function byExpected(rows: Row[]): string {
  const groups = new Map<string, Row[]>();
  for (const r of rows) groups.set(r.expected[0], [...(groups.get(r.expected[0]) ?? []), r]);
  const lines = ["### By expected concern (primary label)", "", "| expected | n | correct | mean confidence | failed |", "|---|---|---|---|---|"];
  for (const [k, rs] of [...groups].sort()) {
    const ok = rs.filter((r) => r.ok);
    const mean = ok.length ? ok.reduce((s, r) => s + (r.confidence ?? 0), 0) / ok.length : null;
    lines.push(`| ${k} | ${rs.length} | ${pct(ok.filter((r) => r.correct).length, ok.length)} | ${mean === null ? "-" : mean.toFixed(3)} | ${rs.length - ok.length} |`);
  }
  return lines.join("\n");
}

function versusPlanner(rows: Row[]): string {
  const withPlanner = rows.filter((r) => r.ok && r.plannerFlag !== undefined && r.plannerFlag !== null);
  if (!withPlanner.length) return "### Versus the turn planner\n\nNo planner flags (run with --planner or --planner-results).";
  let both = 0, onlyDecide = 0, onlyPlanner = 0, neither = 0, agree = 0;
  const diffs: string[] = [];
  for (const r of withPlanner) {
    const d = r.correct!;
    const p = r.expected.includes(r.plannerFlag!);
    if (r.choice === r.plannerFlag) agree++;
    if (d && p) both++;
    else if (d) onlyDecide++;
    else if (p) onlyPlanner++;
    else neither++;
    if (d !== p) diffs.push(`- ${r.snapshot}#${r.repeat} expected ${r.expected.join("|")}: decide ${r.choice} (${r.confidence?.toFixed(2)}), planner ${r.plannerFlag}`);
  }
  const plannerRoute = withPlanner.filter((r) => routeOk(r.plannerFlag!, r.expected)).length;
  const decideRoute = withPlanner.filter((r) => r.routeCorrect).length;
  return [
    "### Versus the turn planner's concern flag",
    "",
    `Same inputs, n=${withPlanner.length}. Label accuracy: decide ${pct(both + onlyDecide, withPlanner.length)}, planner ${pct(both + onlyPlanner, withPlanner.length)}. Routing accuracy: decide ${pct(decideRoute, withPlanner.length)}, planner ${pct(plannerRoute, withPlanner.length)}. Same label: ${pct(agree, withPlanner.length)}.`,
    "",
    "| | planner right | planner wrong |",
    "|---|---|---|",
    `| decide right | ${both} | ${onlyDecide} |`,
    `| decide wrong | ${onlyPlanner} | ${neither} |`,
    ...(diffs.length ? ["", "Where one is right and the other wrong:", ...diffs.slice(0, 60)] : []),
  ].join("\n");
}

function report(rows: Row[], config: Config, meta: string): string {
  const ok = rows.filter((r) => r.ok);
  const label = ok.map((r) => ({ confidence: r.confidence!, correct: r.correct! }));
  const route = ok.map((r) => ({ confidence: r.confidence!, correct: r.routeCorrect! }));
  const noneRows = ok.filter((r) => r.choice === "none").map((r) => ({ confidence: r.confidence!, correct: !isRealConcern(r.expected) }));
  const confidentWrong = ok.filter((r) => !r.correct && (r.confidence ?? 0) >= 0.9);
  const failures = rows.filter((r) => !r.ok);
  return [
    `## ${config.label}`,
    "",
    meta,
    "",
    `Decisions: ${rows.length}, failed after retries: ${failures.length}${failures.length ? ` (${[...new Set(failures.map((f) => f.error))].slice(0, 3).join("; ")})` : ""}. Label accuracy ${pct(ok.filter((r) => r.correct).length, ok.length)}, routing accuracy ${pct(ok.filter((r) => r.routeCorrect).length, ok.length)}. Mean latency ${ok.length ? Math.round(ok.reduce((s, r) => s + r.latencyMs, 0) / ok.length) : "-"} ms; retries used on ${rows.filter((r) => r.attempts > 1).length}.`,
    "",
    formatReliability(reliability(label, DEFAULT_BAND_EDGES), "Reliability: label (choice is an acceptable concern)"),
    "",
    formatReliability(reliability(route, DEFAULT_BAND_EDGES), "Reliability: routing (concern vs none)"),
    "",
    formatReliability(reliability(noneRows, DEFAULT_BAND_EDGES), 'Reliability of "none" alone (wrong = a real concern missed)'),
    "",
    thresholdSweep(rows),
    "",
    byExpected(rows),
    "",
    consistency(rows),
    "",
    versusPlanner(rows),
    "",
    "### Wrong at confidence 0.9 or above",
    "",
    ...(confidentWrong.length
      ? confidentWrong.map((r) => `- ${r.snapshot}#${r.repeat} expected ${r.expected.join("|")}, chose ${r.choice} at ${r.confidence?.toFixed(2)}: ${r.rationale}`)
      : ["None."]),
  ].join("\n");
}

async function main() {
  const dryRun = args["dry-run"];
  const repeats = Number(args.repeats);
  const budget = Number(args.budget);
  const configs = parseConfigs(args.configs!);
  const backend = dryRun ? fakeBackend() : apiBackend(loadApiKey(), { neutralise: false, budgetUsd: budget });
  const all = [
    ...SNAPSHOTS,
    ...(args["no-paraphrases"] ? [] : paraphraseSnapshots()),
    ...(args["no-grid"] ? [] : TOPIC_GRID),
  ];
  const snapshots = args.only ? all.filter((s) => args.only!.split(",").some((id) => s.id === id || s.paraphraseOf === id)) : all;
  const priorFlags = args["planner-results"] ? loadPlannerFlags(args["planner-results"]) : null;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = path.resolve(args.out!, `decide-${dryRun ? "dry-" : ""}${stamp}`);
  mkdirSync(dir, { recursive: true });
  const log = (line: string) => {
    console.log(line);
    appendFileSync(path.join(dir, "progress.log"), line + "\n");
  };
  log(`snapshots=${snapshots.length} repeats=${repeats} configs=${configs.map((c) => c.label).join(",")} budget=$${budget}${dryRun ? " DRY RUN (fake model)" : ""}`);
  const quiet = { warn: () => {} };

  const sections: string[] = [];
  const allRows: Row[] = [];
  let stoppedForBudget = false;
  for (const config of configs) {
    const jobs = snapshots.flatMap((s) => Array.from({ length: s.paraphraseOf ? 1 : repeats }, (_, r) => ({ s, r })));
    const rows: Row[] = [];
    await pool(jobs, Number(args.concurrency), async ({ s, r }: { s: Snapshot; r: number }) => {
      if (!dryRun && backend.spentUsd() >= budget) {
        stoppedForBudget = true;
        return;
      }
      const expected = concernsFor(s);
      const started = Date.now();
      const d: Decision<Concern> = await decide(backend, concernDecisionSpec(s.input), { tier: config.tier, effort: config.effort, logger: quiet });
      const row: Row = {
        config: config.label,
        snapshot: s.id,
        paraphraseOf: s.paraphraseOf,
        repeat: r,
        expected,
        ok: d.ok,
        choice: d.ok ? d.value : null,
        confidence: d.ok ? d.confidence : null,
        rationale: d.ok ? d.rationale : "",
        error: d.ok ? undefined : `${d.reason}: ${d.error}`,
        attempts: d.attempts.length,
        latencyMs: Date.now() - started,
        correct: d.ok ? expected.includes(d.value) : null,
        routeCorrect: d.ok ? routeOk(d.value, expected) : null,
      };
      if (args.planner) {
        try {
          row.plannerFlag = (await planTurnTraced(backend, s.input, { logger: quiet })).proposal?.concern ?? null;
        } catch {
          row.plannerFlag = null;
        }
      } else if (priorFlags?.has(s.id)) {
        const flags = priorFlags.get(s.id)!;
        row.plannerFlag = flags[r % flags.length];
      }
      rows.push(row);
      appendFileSync(path.join(dir, "cases.jsonl"), JSON.stringify(row) + "\n");
      log(`${config.label} ${s.id}#${r} expected=${expected.join("|")} got=${row.choice ?? "FAILED"}@${row.confidence?.toFixed(2) ?? "-"} ${row.correct ? "ok" : "WRONG"}${row.plannerFlag !== undefined ? ` planner=${row.plannerFlag}` : ""} $${backend.spentUsd().toFixed(3)}`);
    });
    rows.sort((a, b) => a.snapshot.localeCompare(b.snapshot) || a.repeat - b.repeat);
    allRows.push(...rows);
    const meta = `Inputs: ${snapshots.length} (${snapshots.filter((s) => s.paraphraseOf).length} rewrites, run once), hand-written and grid inputs ×${repeats}. Planner flags: ${args.planner ? "live run" : priorFlags ? args["planner-results"] : "none"}.`;
    sections.push(report(rows, config, meta));
  }

  const header = [
    "# decide() calibration: concern decision",
    "",
    `${new Date().toISOString()}${dryRun ? ". DRY RUN with a fake model: the numbers mean nothing" : ""}. Spend $${backend.spentUsd().toFixed(3)} of $${budget}.${stoppedForBudget ? " Stopped early: budget reached, results are partial." : ""}`,
    "",
    "Correct = the choice is one of the snapshot's acceptable concerns (a person's judgement, 2026-09-26). A well-calibrated model's accuracy in each band matches its mean confidence; a positive gap is overconfidence.",
  ].join("\n");
  writeFileSync(path.join(dir, "results.json"), JSON.stringify(allRows, null, 2));
  writeFileSync(path.join(dir, "report.md"), [header, ...sections].join("\n\n") + "\n");
  log(`report: ${path.join(dir, "report.md")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
