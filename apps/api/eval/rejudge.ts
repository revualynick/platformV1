/**
 * Re-run the judge panel on a finished e2e-concerns results directory,
 * without regenerating any bot replies (so no API spend).
 *
 * Saves results.json after every judged item. If a judge call hits the
 * subscription session limit, it stops cleanly and says how many are left;
 * run it again with --only-missing to carry on. Rewrites report.md at the end.
 *
 *   pnpm exec tsx eval/rejudge.ts --dir eval/results/e2e-<stamp> --claude-config-dir ~/.claude-personal [--concurrency 1] [--only-missing]
 */
import { existsSync, readFileSync, renameSync, writeFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { cliBackend } from "./lib/backends.js";
import { SNAPSHOTS, paraphraseSnapshots } from "./lib/snapshots.js";
import { TOPIC_GRID } from "./lib/topic-grid.js";
import { judgeDescription } from "./lib/judge.js";
import { describe, report, type CaseResult, type RefRun } from "./lib/e2e-report.js";

const { values: args } = parseArgs({
  options: {
    dir: { type: "string" },
    "claude-config-dir": { type: "string" },
    concurrency: { type: "string", default: "1" },
    "only-missing": { type: "boolean", default: false },
  },
});

const JUDGES = [["opus", "advanced"], ["sonnet", "standard"]] as const;

async function main() {
  if (!args.dir) throw new Error("--dir is required");
  const dir = path.resolve(args.dir);
  const resultsFile = path.join(dir, "results.json");
  const reportFile = path.join(dir, "report.md");
  const results = JSON.parse(readFileSync(resultsFile, "utf8")) as CaseResult[];
  const configDir = args["claude-config-dir"]?.replace(/^~/, homedir());
  const judges = cliBackend({ neutralise: true, configDir });
  const snapshots = [...SNAPSHOTS, ...paraphraseSnapshots(), ...TOPIC_GRID];
  const onlyMissing = args["only-missing"];

  const log = (line: string) => {
    console.log(line);
    appendFileSync(path.join(dir, "rejudge.log"), line + "\n");
  };
  const save = () => {
    const tmp = `${resultsFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(results, null, 2));
    renameSync(tmp, resultsFile);
  };

  const todo = results.flatMap((c) =>
    [c.design, c.baseline]
      .filter((x): x is RefRun => Boolean(x?.result))
      .filter((run) => !onlyMissing || !run.judges.opus || !run.judges.sonnet)
      .map((run) => ({ c, run })),
  );
  const unknown = new Set(todo.filter(({ c }) => !snapshots.some((s) => s.id === c.snapshot)).map(({ c }) => c.snapshot));
  if (unknown.size) log(`skipping snapshots no longer defined: ${[...unknown].join(", ")}`);
  const items = todo.filter(({ c }) => !unknown.has(c.snapshot));
  log(`${items.length} runs to judge${onlyMissing ? " (missing only)" : ""}, concurrency ${args.concurrency}`);

  let next = 0;
  let done = 0;
  let failed = 0;
  let stopped: string | null = null;
  const worker = async () => {
    while (!stopped && next < items.length) {
      const { c, run } = items[next++];
      const s = snapshots.find((x) => x.id === c.snapshot)!;
      const text = describe(s, run.result!);
      for (const [name, tier] of JUDGES) {
        if (stopped) break;
        if (onlyMissing && run.judges[name]) continue;
        try {
          run.judges[name] = await judgeDescription(judges, text, tier);
        } catch (err) {
          const msg = String(err);
          // The subscription session limit: stop rather than burn through the queue.
          if (/limit/i.test(msg)) {
            stopped = msg.slice(0, 300);
            break;
          }
          failed++;
          log(`${c.snapshot}#${c.repeat} ${name} judge failed (previous score kept, if any): ${msg.slice(0, 200)}`);
        }
      }
      save();
      if (!stopped && ++done % 10 === 0) log(`judged ${done}/${items.length}`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(Number(args.concurrency), items.length)) }, worker));
  save();

  const remaining = results
    .flatMap((c) => [c.design, c.baseline])
    .filter((x) => x?.result && (!x.judges.opus || !x.judges.sonnet)).length;
  if (stopped) {
    log(`stopped at the usage limit: ${stopped}`);
    log(`${remaining} runs still missing a judge; rerun with --only-missing once the limit resets`);
  } else {
    log(`done: ${done} runs judged, ${failed} judge calls failed, ${remaining} runs still missing a judge`);
  }

  const prior = existsSync(reportFile) ? readFileSync(reportFile, "utf8") : "";
  const m = /API spend \$(\d+(?:\.\d+)?)/.exec(prior);
  const spent = m ? Number(m[1]) : null;
  const repeats = Math.max(1, ...results.filter((c) => !c.paraphraseOf).map((c) => c.repeat + 1));
  writeFileSync(reportFile, report(results, spent, repeats, snapshots));
  log(`report: ${reportFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
