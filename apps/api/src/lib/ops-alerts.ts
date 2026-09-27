import { eq } from "drizzle-orm";
import { opsHeartbeats, orgSettings, type TenantDb } from "@revualy/db";
import { computeOpsStatus, recordHeartbeat, type CheckStatus, type OpsCheck } from "./ops-status.js";

/**
 * Alerts for the beta gate (C3 step 8). Runs every 15 minutes in each
 * tenant: works out the ops status and emails OPS_ALERT_EMAIL (the
 * operator, not the customer) when a check goes wrong, again while it
 * stays wrong (every 6 hours for a failure, 24 for a warning), and once
 * when it recovers. Counts only; never names or content.
 */

const REPEAT_MIN: Record<Exclude<CheckStatus, "ok">, number> = { fail: 6 * 60, warn: 24 * 60 };
const JOB = "ops-alerts";

interface Remembered {
  status: CheckStatus;
  lastSentAt: string | null;
}

export interface AlertDecision {
  raised: OpsCheck[];
  resolved: string[];
}

/** Which checks to report now, given what was reported before. Pure, for testing. */
export function decideAlerts(checks: OpsCheck[], before: Record<string, Remembered>, now: Date): { decision: AlertDecision; after: Record<string, Remembered> } {
  const raised: OpsCheck[] = [];
  const resolved: string[] = [];
  const after: Record<string, Remembered> = {};
  for (const c of checks) {
    const prev = before[c.name];
    if (c.status === "ok") {
      if (prev && prev.status !== "ok" && prev.lastSentAt) resolved.push(c.name);
      after[c.name] = { status: "ok", lastSentAt: null };
      continue;
    }
    const due =
      !prev ||
      prev.status === "ok" ||
      !prev.lastSentAt ||
      // Worse than before (warn -> fail) is news.
      (prev.status === "warn" && c.status === "fail") ||
      now.getTime() - new Date(prev.lastSentAt).getTime() >= REPEAT_MIN[c.status] * 60_000;
    if (due) raised.push(c);
    after[c.name] = { status: c.status, lastSentAt: due ? now.toISOString() : prev!.lastSentAt };
  }
  return { decision: { raised, resolved }, after };
}

export type AlertSender = (subject: string, text: string) => Promise<void>;

export async function runOpsAlerts(
  db: TenantDb,
  send: AlertSender,
  opts: Parameters<typeof computeOpsStatus>[1] = {},
): Promise<AlertDecision> {
  const now = opts.now ?? new Date();
  const status = await computeOpsStatus(db, { ...opts, now });
  const [row] = await db.select({ details: opsHeartbeats.details }).from(opsHeartbeats).where(eq(opsHeartbeats.job, JOB));
  const before = ((row?.details as { checks?: Record<string, Remembered> } | undefined)?.checks ?? {}) as Record<string, Remembered>;
  const { decision, after } = decideAlerts(status.checks, before, now);

  if (decision.raised.length || decision.resolved.length) {
    const [org] = await db.select({ name: orgSettings.name, subdomain: orgSettings.subdomain }).from(orgSettings).limit(1);
    const tenant = org?.subdomain || org?.name || process.env.ORG_ID || "tenant";
    const worst = decision.raised.some((c) => c.status === "fail") ? "FAIL" : decision.raised.length ? "WARN" : "RESOLVED";
    const lines = [
      `Revualy ops status for ${tenant} at ${now.toISOString()}`,
      "",
      ...decision.raised.map((c) => `${c.status.toUpperCase()}  ${c.name}: ${c.detail}`),
      ...decision.resolved.map((n) => `OK    ${n}: back to normal`),
      "",
      "Full status: pnpm tenant:fleet health --apply (or GET /api/ops/status with the ops token).",
    ];
    await send(`[Revualy ${worst}] ${tenant}: ${decision.raised.length} problem(s), ${decision.resolved.length} resolved`, lines.join("\n"));
  }

  // Only remember what was sent once the email went (a failed send is retried next run).
  await db
    .insert(opsHeartbeats)
    .values({ job: JOB, lastRunAt: now, lastOkAt: now, details: { checks: after } })
    .onConflictDoUpdate({ target: opsHeartbeats.job, set: { lastRunAt: now, lastOkAt: now, lastError: null, details: { checks: after } } });
  return decision;
}

export { recordHeartbeat };
