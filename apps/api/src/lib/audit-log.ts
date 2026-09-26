import { createHash } from "node:crypto";
import { asc, desc, gt, sql } from "drizzle-orm";
import { auditLog, type TenantDb } from "@revualy/db";

/**
 * The audit log (migration 0043): append-only and hash-chained.
 *
 *  - Append-only: triggers reject UPDATE, DELETE and TRUNCATE on
 *    audit_log, whoever runs them (grants cannot bind the table owner).
 *  - Hash-chained: each row stores the previous row's hash and its own,
 *    computed here over a canonical form of the row. Rows are written under
 *    a transaction-scoped advisory lock, so `seq` is gap-free and the chain
 *    never forks.
 *  - verifyAuditChain() recomputes the chain: an altered row, a deleted row
 *    or a row inserted behind this module's back breaks it.
 *
 * Limits: the chain cannot show that the newest rows were cut off (the
 * remaining chain is still valid), or that someone with owner rights
 * disabled the triggers and rewrote the whole chain consistently. Both are
 * caught by keeping the head (seq and hash) outside the database and
 * comparing, which is not built yet.
 *
 * Never put feedback content in an entry.
 */

type Tx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];
export type DbOrTx = TenantDb | Tx;

export const GENESIS_HASH = "0".repeat(64);
// Arbitrary constant for pg_advisory_xact_lock: serialises appends.
const AUDIT_LOCK_KEY = 7_243_001;

export interface AuditEntryInput {
  actorId: string | null;
  action: string;
  target?: string | null;
  reason?: string | null;
  outcome: string;
  /** Small, non-content facts only (ids, counts, flags). */
  details?: Record<string, unknown>;
}

interface ChainRow {
  seq: number;
  occurredAt: Date;
  actorId: string | null;
  action: string;
  target: string | null;
  reason: string | null;
  outcome: string;
  details: Record<string, unknown>;
  prevHash: string;
}

/** JSON with object keys sorted at every level (jsonb does not keep key order). */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function hashAuditRow(row: ChainRow): string {
  const canonical = stableJson([
    row.seq,
    row.occurredAt.toISOString(),
    row.actorId,
    row.action,
    row.target,
    row.reason,
    row.outcome,
    row.details,
    row.prevHash,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

/** Append one entry. Returns its sequence number and hash. */
export async function appendAudit(db: TenantDb, input: AuditEntryInput): Promise<{ seq: number; rowHash: string }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`);
    const [head] = await tx
      .select({ seq: auditLog.seq, rowHash: auditLog.rowHash })
      .from(auditLog)
      .orderBy(desc(auditLog.seq))
      .limit(1);
    const row: ChainRow = {
      seq: (head?.seq ?? 0) + 1,
      occurredAt: new Date(),
      actorId: input.actorId,
      action: input.action,
      target: input.target ?? null,
      reason: input.reason ?? null,
      outcome: input.outcome,
      details: input.details ?? {},
      prevHash: head?.rowHash ?? GENESIS_HASH,
    };
    const rowHash = hashAuditRow(row);
    await tx.insert(auditLog).values({ ...row, rowHash });
    return { seq: row.seq, rowHash };
  });
}

export interface AuditVerification {
  ok: boolean;
  rows: number;
  /** The first sequence number where the chain breaks. */
  brokenAt: number | null;
  problem: "gap" | "prev_hash" | "row_hash" | null;
  /** The last row checked: keep it outside the database to catch truncation of the tail. */
  head: { seq: number; rowHash: string } | null;
}

/** Recompute the whole chain. Pass a transaction to verify uncommitted state. */
export async function verifyAuditChain(db: DbOrTx, pageSize = 1000): Promise<AuditVerification> {
  let expectedSeq = 1;
  let prevHash = GENESIS_HASH;
  let rows = 0;
  let head: AuditVerification["head"] = null;
  const fail = (seq: number, problem: NonNullable<AuditVerification["problem"]>): AuditVerification => ({
    ok: false,
    rows,
    brokenAt: seq,
    problem,
    head,
  });

  for (;;) {
    const page = await db
      .select()
      .from(auditLog)
      .where(gt(auditLog.seq, expectedSeq - 1))
      .orderBy(asc(auditLog.seq))
      .limit(pageSize);
    for (const r of page) {
      if (r.seq !== expectedSeq) return fail(expectedSeq, "gap");
      if (r.prevHash !== prevHash) return fail(r.seq, "prev_hash");
      const recomputed = hashAuditRow({
        seq: r.seq,
        occurredAt: r.occurredAt,
        actorId: r.actorId,
        action: r.action,
        target: r.target,
        reason: r.reason,
        outcome: r.outcome,
        details: r.details,
        prevHash: r.prevHash,
      });
      if (recomputed !== r.rowHash) return fail(r.seq, "row_hash");
      prevHash = r.rowHash;
      head = { seq: r.seq, rowHash: r.rowHash };
      expectedSeq++;
      rows++;
    }
    if (page.length < pageSize) break;
  }
  return { ok: true, rows, brokenAt: null, problem: null, head };
}
