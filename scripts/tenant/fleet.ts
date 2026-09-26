#!/usr/bin/env tsx
/**
 * Fleet view over every tenant state file.
 *
 *   pnpm tenant:fleet list
 *   pnpm tenant:fleet migrate [--canary <sub>] [--only a,b] [--apply]
 *   pnpm tenant:fleet health [--apply]
 *
 * migrate and health are DRY RUNS unless --apply is given.
 */
import { parseArgs } from "node:util";
import { tenantPaths } from "./lib/context.js";
import { DryRunExecutor, LiveExecutor, type Executor } from "./lib/executor.js";
import { formatTable, healthUrls, planMigrationOrder, summarise } from "./lib/fleet.js";
import { listStates, type TenantState } from "./lib/state.js";
import { migrateAction, statusAction } from "./lib/steps.js";
import { parseRailwayStatus } from "./lib/railway.js";

const noSecrets = () => ({});

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const { values, positionals } = parseArgs({
    args: argv[0] === "--" ? argv.slice(1) : argv,
    allowPositionals: true,
    options: {
      apply: { type: "boolean", default: false },
      canary: { type: "string" },
      only: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const command = positionals[0];
  if (values.help || !command || !["list", "migrate", "health"].includes(command)) {
    console.log("Usage: pnpm tenant:fleet <list | migrate [--canary sub] [--only a,b] | health> [--apply]");
    return command ? 1 : 0;
  }

  // The state dir does not depend on the subdomain; any label resolves it.
  const { stateDir } = tenantPaths("fleet");
  const { states, errors } = listStates(stateDir);
  for (const e of errors) console.error(`warning: unreadable state file ${e}`);
  if (states.length === 0) {
    console.log(`No tenant state files in ${stateDir}`);
    return 0;
  }

  const exec: Executor = values.apply ? new LiveExecutor(noSecrets) : new DryRunExecutor(noSecrets);

  if (command === "list") {
    for (const line of formatTable(states.map((s) => ({ ...summarise(s) })))) console.log(line);
    return 0;
  }

  if (command === "migrate") {
    const only = values.only?.split(",").map((s) => s.trim()).filter(Boolean);
    const { order, skipped } = planMigrationOrder(states, { canary: values.canary, only });
    console.log(`${values.apply ? "APPLY" : "DRY RUN"}: migrate ${order.length} tenant(s), in this order, stopping at the first failure:`);
    order.forEach((s, i) => console.log(`  ${i + 1}. ${s.input.subdomain}${i === 0 && values.canary ? " (canary)" : ""}`));
    for (const s of skipped) console.log(`  skipped ${s.subdomain}: ${s.reason}`);
    console.log("");
    exec.manual({
      purpose: "Before starting",
      instructions: [
        "Confirm each tenant's Railway Postgres has a recent backup (Railway dashboard → Postgres → Backups)",
        "Confirm the migration has been applied to a local database and the app still starts",
        "The api also applies migrations on boot, so deploy the new code only after this rollout succeeds",
      ],
    });
    for (const [i, state] of order.entries()) {
      exec.log(`\n[${i + 1}/${order.length}] ${state.input.subdomain}`);
      try {
        await migrateTenant(exec, state);
      } catch (err) {
        console.error(`\nMigration stopped at ${state.input.subdomain}: ${(err as Error).message}`);
        console.error(`Tenants after it were not touched: ${order.slice(i + 1).map((s) => s.input.subdomain).join(", ") || "(none)"}`);
        return 1;
      }
    }
    return 0;
  }

  // health
  console.log(values.apply ? "Health summary:" : "DRY RUN: requests a live health check would make:");
  const rows: Record<string, string>[] = [];
  for (const state of states) {
    for (const h of healthUrls(state)) {
      try {
        const res = await exec.http({ purpose: `${state.input.subdomain} ${h.label}`, method: "GET", url: h.url });
        rows.push({ tenant: state.input.subdomain, check: h.label, result: res.status === h.expect ? "ok" : `FAIL (${res.status})` });
      } catch (err) {
        rows.push({ tenant: state.input.subdomain, check: h.label, result: `FAIL (${(err as Error).message})` });
      }
    }
  }
  if (values.apply) for (const line of formatTable(rows)) console.log(line);
  return values.apply && rows.some((r) => r.result !== "ok") ? 1 : 0;
}

async function migrateTenant(exec: Executor, state: TenantState): Promise<void> {
  const paths = tenantPaths(state.input.subdomain);
  const status = parseRailwayStatus(await exec.cli(statusAction(paths, state, true, "Confirm the link directory points at this tenant's project")));
  if (status.projectId !== state.railway.projectId) {
    throw new Error(`link directory points at ${status.projectId}, state file says ${state.railway.projectId}`);
  }
  await exec.cli(migrateAction(paths));
  for (const h of healthUrls(state)) {
    const res = await exec.http({ purpose: `Post-migration ${h.label}`, method: "GET", url: h.url });
    if (res.status !== h.expect) throw new Error(`${h.label} returned ${res.status} after migrating`);
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error((err as Error).message);
    process.exit(1);
  },
);
