#!/usr/bin/env tsx
/**
 * Encryption maintenance for one tenant database. Needs DATABASE_URL and the
 * tenant's ENCRYPTION_KEYS (or ENCRYPTION_KEY). Prints counts and row ids
 * only, never content.
 *
 *   pnpm --filter @revualy/db encryption check              exit 1 if any value is not v1
 *   pnpm --filter @revualy/db encryption check --current    exit 1 if any value is not under the current key
 *   pnpm --filter @revualy/db encryption backfill [--dry-run]
 *   pnpm --filter @revualy/db encryption rotate [--dry-run]
 *
 * Options: --batch <n> (default 200), --pause-ms <n> (default 25),
 * --only <table|table.column,...>
 *
 * backfill and rotate are safe while the app is live and can be stopped
 * and rerun at any point (see encryption-maintenance.ts).
 */
import { parseArgs } from "node:util";
import postgres from "postgres";
import { assertEncryptionReady, configuredKeyIds, currentKeyId } from "@revualy/shared/server";
import {
  encryptionStatus,
  retirementReport,
  rewriteEncryptedColumns,
  type ColumnStatus,
} from "./encryption-maintenance.js";

function printStatus(status: ColumnStatus[], current: string): void {
  for (const s of status) {
    const name = `${s.table}.${s.column}`.padEnd(48);
    if (!s.present) {
      console.log(`${name} MISSING (run migrations)`);
      continue;
    }
    const keys = Object.entries(s.byKey)
      .map(([k, n]) => `${k}=${n}${k === current ? "" : " (old)"}`)
      .join(" ");
    console.log(`${name} rows ${String(s.withContent).padStart(6)}  not-v1 ${String(s.notV1).padStart(6)}  ${keys}`);
  }
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "dry-run": { type: "boolean", default: false },
      current: { type: "boolean", default: false },
      batch: { type: "string" },
      "pause-ms": { type: "string" },
      only: { type: "string" },
    },
  });
  const command = positionals[0];
  if (!command || !["check", "backfill", "rotate"].includes(command)) {
    console.error("Usage: encryption <check [--current] | backfill | rotate> [--dry-run] [--batch n] [--pause-ms n] [--only t.c,...]");
    return 2;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    return 2;
  }
  assertEncryptionReady();
  const current = currentKeyId();
  const configured = configuredKeyIds();
  const only = values.only?.split(",").map((s) => s.trim()).filter(Boolean);
  const sql = postgres(url, { max: 1, onnotice: () => {} });

  try {
    console.log(`keys configured: ${configured.join(", ")} (current ${current})`);
    const before = await encryptionStatus(sql, { only });
    printStatus(before, current);

    if (command === "check" || values["dry-run"]) {
      const missing = before.filter((s) => !s.present).length;
      const notV1 = before.reduce((n, s) => n + s.notV1, 0);
      const notCurrent = before.reduce(
        (n, s) => n + s.notV1 + Object.entries(s.byKey).filter(([k]) => k !== current).reduce((m, [, c]) => m + c, 0),
        0,
      );
      const r = retirementReport(before, configured);
      console.log("");
      console.log(`not v1: ${notV1}; not under current key ${current}: ${notCurrent}; missing columns: ${missing}`);
      if (Object.keys(r.unknown).length) console.log(`UNREADABLE: values under unconfigured key ids ${JSON.stringify(r.unknown)}`);
      if (command === "check") {
        const bad = missing > 0 || Object.keys(r.unknown).length > 0 || (values.current ? notCurrent : notV1) > 0;
        console.log(bad ? "check FAILED" : "check ok");
        return bad ? 1 : 0;
      }
      console.log(`DRY RUN: ${command} would rewrite up to ${command === "rotate" ? notCurrent : notV1} value(s). No changes made.`);
      return 0;
    }

    console.log("");
    console.log(`${command === "rotate" ? "Rotating to key " + current : "Backfilling to v1"} (safe to stop and rerun)`);
    const results = await rewriteEncryptedColumns(sql, {
      target: command === "rotate" ? "current-key" : "v1",
      currentKeyId: current,
      batchSize: values.batch ? Number(values.batch) : undefined,
      pauseMs: values["pause-ms"] ? Number(values["pause-ms"]) : undefined,
      only,
      onProgress: (p) => {
        if (p.done && p.scanned === 0) return;
        const label = `${p.table}.${p.column}`;
        if (p.missing) console.log(`  ${label}: MISSING`);
        else
          console.log(
            `  ${label}: scanned ${p.scanned}, rewritten ${p.rewritten}, app wrote first ${p.raced}, unreadable ${p.unreadable}${p.done ? " (done)" : ""}`,
          );
      },
    });
    const unreadable = results.filter((r) => r.unreadable > 0);
    for (const r of unreadable) {
      console.log(`  unreadable in ${r.table}.${r.column}, row ids: ${r.unreadableIds.join(", ")}`);
    }

    const after = await encryptionStatus(sql, { only });
    console.log("");
    printStatus(after, current);
    const r = retirementReport(after, configured);
    if (command === "rotate") {
      console.log("");
      if (r.retirable.length) console.log(`Can be retired (no values left under them): ${r.retirable.join(", ")}`);
      const stillUsed = Object.entries(r.inUse).filter(([k]) => k !== current);
      if (stillUsed.length) console.log(`Still in use, keep for now: ${stillUsed.map(([k, n]) => `${k} (${n})`).join(", ")}`);
      if (r.notV1 > 0) console.log(`${r.notV1} value(s) are not v1, so no old key can be retired yet.`);
      if (configured.length === 1) console.log("Only one key is configured: nothing to retire.");
    }
    const remaining = command === "rotate" ? r.notV1 + Object.entries(r.inUse).filter(([k]) => k !== current).reduce((m, [, n]) => m + n, 0) : r.notV1;
    return unreadable.length > 0 || remaining > 0 ? 1 : 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("encryption maintenance failed:", (err as Error).message);
    process.exit(1);
  },
);
