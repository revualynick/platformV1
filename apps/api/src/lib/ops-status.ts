import { sql } from "drizzle-orm";
import type { Queue } from "bullmq";
import { opsHeartbeats, type TenantDb } from "@revualy/db";
import { verifyAuditChain } from "./audit-log.js";

/**
 * Monitoring for the beta gate (C3 step 8). Every check is a count or an
 * age worked out from the database the pipeline already writes, plus
 * heartbeats from the scheduled jobs. Nothing here reads or returns
 * content or names: it is safe to email and to show fleet-wide.
 *
 * Thresholds sit a little behind the sweeper's own (5 minutes stuck, 24
 * hours stale, 48 hour retry window), so a check only trips when the
 * sweeper has had its chance and something is still wrong.
 */

export type CheckStatus = "ok" | "warn" | "fail";

export interface OpsCheck {
  name: string;
  status: CheckStatus;
  /** The count or age in minutes behind the status. */
  value: number;
  /** One line a person can act on. Never content. */
  detail: string;
}

export interface OpsStatus {
  status: CheckStatus;
  checkedAt: string;
  checks: OpsCheck[];
}

type Tx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];
type DbOrTx = TenantDb | Tx;

/** Jobs that record a heartbeat, and how long each may go quiet before it's a problem. */
export const HEARTBEATS: Record<string, { warnAfterMin: number; failAfterMin: number; what: string }> = {
  sweep: { warnAfterMin: 15, failAfterMin: 30, what: "the sweeper (every 5 minutes)" },
  "scheduling-pass": { warnAfterMin: 26 * 60, failAfterMin: 50 * 60, what: "the daily scheduling pass" },
  "calendar-model": { warnAfterMin: 26 * 60, failAfterMin: 50 * 60, what: "the nightly calendar model" },
  "calendar-sync": { warnAfterMin: 45, failAfterMin: 3 * 60, what: "calendar sync (every 15 minutes)" },
};

/** Record that a job ran. `error` must be a class name or short code, never a message. */
export async function recordHeartbeat(db: DbOrTx, job: string, ok: boolean, error?: string, now = new Date()): Promise<void> {
  await db
    .insert(opsHeartbeats)
    .values({ job, lastRunAt: now, lastOkAt: ok ? now : null, lastError: ok ? null : (error ?? "failed").slice(0, 200) })
    .onConflictDoUpdate({
      target: opsHeartbeats.job,
      set: ok ? { lastRunAt: now, lastOkAt: now, lastError: null } : { lastRunAt: now, lastError: (error ?? "failed").slice(0, 200) },
    });
}

async function count(db: DbOrTx, query: ReturnType<typeof sql>): Promise<number> {
  const rows = (await db.execute(query)) as unknown as Array<{ n: string | number }>;
  return Number(rows[0]?.n ?? 0);
}

const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;

export async function computeOpsStatus(
  db: TenantDb,
  opts: { queues?: Record<string, Pick<Queue, "getFailed">>; now?: Date; bootedAt?: Date } = {},
): Promise<OpsStatus> {
  const now = opts.now ?? new Date();
  const min = (m: number) => new Date(now.getTime() - m * 60_000);
  const checks: OpsCheck[] = [];
  const add = (name: string, status: CheckStatus, value: number, detail: string) => checks.push({ name, status, value, detail });

  // ── The conversation pipeline ──
  const inbound = await count(
    db,
    sql`SELECT count(*) AS n FROM inbound_messages WHERE status = 'pending' AND received_at < ${ts(min(10))} AND received_at > ${ts(min(48 * 60))}`,
  );
  add("inbound_stuck", inbound > 0 ? "fail" : "ok", inbound, inbound ? `${inbound} incoming chat messages not processed after 10 minutes` : "Incoming messages are being processed");

  const undelivered = await count(
    db,
    sql`SELECT count(*) AS n FROM conversation_messages m JOIN conversations c ON c.id = m.conversation_id
        WHERE m.role = 'assistant' AND m.delivered_at IS NULL AND c.platform <> 'web'
          AND m.created_at < ${ts(min(15))} AND m.created_at > ${ts(min(48 * 60))}`,
  );
  add("undelivered", undelivered > 0 ? "fail" : "ok", undelivered, undelivered ? `${undelivered} bot messages not delivered after 15 minutes` : "Bot messages are being delivered");

  const unanswered = await count(
    db,
    sql`SELECT count(*) AS n FROM conversations c
        JOIN LATERAL (SELECT role, created_at FROM conversation_messages WHERE conversation_id = c.id ORDER BY seq DESC LIMIT 1) m ON true
        WHERE c.status IN ('initiated', 'in_progress') AND c.platform <> 'web' AND m.role = 'user'
          AND m.created_at < ${ts(min(15))} AND m.created_at > ${ts(min(48 * 60))}`,
  );
  add("unanswered", unanswered > 0 ? "fail" : "ok", unanswered, unanswered ? `${unanswered} people waiting over 15 minutes for the bot to reply` : "Replies are being answered");

  const staleOpen = await count(
    db,
    sql`SELECT count(*) AS n FROM conversations WHERE status IN ('initiated', 'in_progress') AND last_activity_at < ${ts(min(26 * 60))}`,
  );
  add("stale_open", staleOpen > 0 ? "warn" : "ok", staleOpen, staleOpen ? `${staleOpen} conversations quiet for over 26 hours but still open (the sweeper should close them)` : "Quiet conversations are being closed");

  const unanalysed = await count(
    db,
    sql`SELECT count(*) AS n FROM conversations c
        WHERE c.status IN ('closed', 'incomplete') AND c.closed_at < ${ts(min(120))} AND c.closed_at > ${ts(min(48 * 60))}
          AND c.phase <> 'support'
          AND EXISTS (SELECT 1 FROM conversation_messages m WHERE m.conversation_id = c.id AND m.role = 'user')
          AND NOT EXISTS (SELECT 1 FROM feedback_entries f WHERE f.conversation_id = c.id)
          AND NOT EXISTS (SELECT 1 FROM self_reflections r WHERE r.conversation_id = c.id)
          AND NOT (c.off_script_streak >= 3 AND NOT EXISTS (SELECT 1 FROM conversation_theme_outcomes o WHERE o.conversation_id = c.id AND o.outcome <> 'unanswered'))`,
  );
  add("analysis_missing", unanalysed > 0 ? "warn" : "ok", unanalysed, unanalysed ? `${unanalysed} finished conversations not analysed after 2 hours` : "Finished conversations are being analysed");

  // ── The model ──
  const judged = (await db.execute(
    sql`SELECT count(*) FILTER (WHERE judged_by = 'fallback') AS fallback, count(*) FILTER (WHERE judged_by IS NOT NULL) AS judged
        FROM conversation_theme_outcomes WHERE updated_at > ${ts(min(24 * 60))}`,
  )) as unknown as Array<{ fallback: string | number; judged: string | number }>;
  const fallback = Number(judged[0]?.fallback ?? 0);
  const total = Number(judged[0]?.judged ?? 0);
  const fallbackBad = fallback >= 5 && fallback / Math.max(total, 1) >= 0.2;
  add(
    "model_fallbacks",
    fallbackBad ? "warn" : "ok",
    fallback,
    fallbackBad
      ? `${fallback} of ${total} answers in 24 hours were judged without the model (it failed or timed out)`
      : `${fallback} of ${total} answers in 24 hours judged without the model`,
  );

  // ── Scheduled jobs ──
  const beats = await db.select().from(opsHeartbeats);
  const byJob = new Map(beats.map((b) => [b.job, b]));
  const upMin = opts.bootedAt ? (now.getTime() - opts.bootedAt.getTime()) / 60_000 : Infinity;
  for (const [job, rule] of Object.entries(HEARTBEATS)) {
    const beat = byJob.get(job);
    if (!beat?.lastOkAt) {
      // Just deployed: a job that hasn't had its first chance yet isn't late.
      const status: CheckStatus = upMin < rule.warnAfterMin ? "ok" : "warn";
      add(`job_${job}`, status, -1, beat ? `${rule.what} has never succeeded (last error: ${beat.lastError ?? "unknown"})` : `${rule.what} hasn't run yet`);
      continue;
    }
    const age = Math.round((now.getTime() - beat.lastOkAt.getTime()) / 60_000);
    const status: CheckStatus = age >= rule.failAfterMin ? "fail" : age >= rule.warnAfterMin ? "warn" : "ok";
    add(`job_${job}`, status, age, status === "ok" ? `${rule.what} last succeeded ${age} minutes ago` : `${rule.what} hasn't succeeded for ${age} minutes${beat.lastError ? ` (last error: ${beat.lastError})` : ""}`);
  }

  // ── Queues ──
  if (opts.queues) {
    let failed = 0;
    for (const q of Object.values(opts.queues)) {
      const jobs = await q.getFailed(0, 199);
      failed += jobs.filter((j) => (j.finishedOn ?? 0) > min(60).getTime()).length;
    }
    add("failed_jobs", failed >= 5 ? "warn" : "ok", failed, `${failed} background jobs failed for good in the last hour`);
  }

  // ── Integrity ──
  const chain = await verifyAuditChain(db);
  add("audit_chain", chain.ok ? "ok" : "fail", chain.rows, chain.ok ? `Audit log intact (${chain.rows} entries)` : `Audit log chain broken at entry ${chain.brokenAt} (${chain.problem})`);

  const legacy = (process.env.ENCRYPTION_LEGACY_READS ?? "").trim().toLowerCase() === "on";
  add("encryption_legacy_reads", legacy ? "warn" : "ok", legacy ? 1 : 0, legacy ? "Legacy (unencrypted) reads are still on: run the encryption backfill and turn them off" : "All data read as encrypted");

  const status: CheckStatus = checks.some((c) => c.status === "fail") ? "fail" : checks.some((c) => c.status === "warn") ? "warn" : "ok";
  return { status, checkedAt: now.toISOString(), checks };
}
