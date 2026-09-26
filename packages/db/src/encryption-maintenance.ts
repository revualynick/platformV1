/**
 * Encryption maintenance: the plaintext check, the backfill (legacy values
 * -> v1) and key rotation (v1 under an old key -> current key).
 *
 * Works on raw stored values through postgres.js, not through Drizzle, so
 * it sees exactly what is on disk. Covers every column in
 * encrypted-columns.ts. Safe while the app is live:
 *  - each value is rewritten with a compare-and-swap (`WHERE col = old`),
 *    so a concurrent write by the app always wins and is never overwritten
 *  - batches are small, run in short transactions and are throttled
 *  - updated_at is left alone (migration 0042, `revualy.maintenance`)
 * Idempotent and resumable: finished rows no longer match the work filter,
 * so a rerun (after a crash, a deploy, Ctrl-C) carries on from what is
 * left. Reports counts and row ids only, never content.
 */
import type { Sql } from "postgres";
import {
  decryptField,
  decryptLegacySecret,
  encryptField,
  isEncryptedValue,
} from "@revualy/shared/server";
import { isEmptyJson } from "./schema/tenant.js";
import { encryptedColumns, type EncryptedColumn } from "./encrypted-columns.js";

export type { EncryptedColumn } from "./encrypted-columns.js";
export { encryptedColumns } from "./encrypted-columns.js";

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const KEY_ID_RE = /^[a-z0-9]{1,16}$/;

function q(ident: string): string {
  if (!IDENT_RE.test(ident)) throw new Error(`Unsafe SQL identifier: ${ident}`);
  return `"${ident}"`;
}

/** SQL for the string that carries the v1 value (NULL if there is none). */
function storedExpr(col: EncryptedColumn): string {
  const c = q(col.column);
  switch (col.kind) {
    case "text":
    case "secret":
      return c;
    case "json":
      return `(CASE WHEN jsonb_typeof(${c}) = 'string' THEN ${c} #>> '{}' END)`;
    case "secret-config":
      return `(${c} ->> '_encrypted')`;
  }
}

/** SQL: the row holds something that should be encrypted. */
function hasContent(col: EncryptedColumn): string {
  const c = q(col.column);
  switch (col.kind) {
    case "text":
    case "secret":
      return `(${c} IS NOT NULL AND ${c} <> '')`;
    case "json":
      return `(${c} IS NOT NULL AND ${c} NOT IN ('{}'::jsonb, '[]'::jsonb, 'null'::jsonb))`;
    case "secret-config":
      return `(${c} IS NOT NULL AND ${c} <> '{}'::jsonb)`;
  }
}

/** SQL: the stored value is v1 (under `keyId` if given). */
function isV1(col: EncryptedColumn, keyId?: string): string {
  if (keyId !== undefined && !KEY_ID_RE.test(keyId)) throw new Error(`Invalid key id: ${keyId}`);
  const pattern = keyId ? `enc:v1:${keyId}:%` : "enc:v1:%";
  return `(COALESCE(${storedExpr(col)}, '') LIKE '${pattern}')`;
}

// ── Status (the plaintext check) ────────────────────────

export interface ColumnStatus {
  table: string;
  column: string;
  kind: EncryptedColumn["kind"];
  /** False if the table or column does not exist (tenant not migrated). */
  present: boolean;
  /** Rows holding a value that should be encrypted. */
  withContent: number;
  /** Of those, how many are not in the v1 format (plaintext or pre-v1). */
  notV1: number;
  /** v1 values per key id. */
  byKey: Record<string, number>;
}

async function columnExists(sql: Sql, col: EncryptedColumn): Promise<boolean> {
  const rows = await sql`
    select 1 from information_schema.columns
    where table_schema = current_schema() and table_name = ${col.table} and column_name = ${col.column}`;
  return rows.length > 0;
}

function selectColumns(only?: string[]): EncryptedColumn[] {
  const all = encryptedColumns();
  if (!only || only.length === 0) return all;
  const picked = all.filter((c) => only.includes(c.table) || only.includes(`${c.table}.${c.column}`));
  const unknown = only.filter((o) => !all.some((c) => c.table === o || `${c.table}.${c.column}` === o));
  if (unknown.length) throw new Error(`Not an encrypted column or table: ${unknown.join(", ")}`);
  return picked;
}

/** Counts per encrypted column. Never reads content into the process. */
export async function encryptionStatus(sql: Sql, opts: { only?: string[] } = {}): Promise<ColumnStatus[]> {
  const out: ColumnStatus[] = [];
  for (const col of selectColumns(opts.only)) {
    const base = { table: col.table, column: col.column, kind: col.kind };
    if (!(await columnExists(sql, col))) {
      out.push({ ...base, present: false, withContent: 0, notV1: 0, byKey: {} });
      continue;
    }
    const t = q(col.table);
    const [counts] = await sql.unsafe(
      `select count(*) filter (where ${hasContent(col)})::int as with_content,
              count(*) filter (where ${hasContent(col)} and not ${isV1(col)})::int as not_v1
       from ${t}`,
    );
    const keyRows = await sql.unsafe(
      `select split_part(${storedExpr(col)}, ':', 3) as key_id, count(*)::int as n
       from ${t} where ${hasContent(col)} and ${isV1(col)} group by 1 order by 1`,
    );
    const byKey: Record<string, number> = {};
    for (const r of keyRows) byKey[r.key_id as string] = r.n as number;
    out.push({
      ...base,
      present: true,
      withContent: counts.with_content as number,
      notV1: counts.not_v1 as number,
      byKey,
    });
  }
  return out;
}

export interface RetirementReport {
  /** Configured keys other than the current one that nothing uses. */
  retirable: string[];
  /** Keys still in use, with the number of values under each. */
  inUse: Record<string, number>;
  /** Key ids found in the data that are not configured (cannot decrypt). */
  unknown: Record<string, number>;
  /** Values not in v1: may be under any key, so no key is retirable. */
  notV1: number;
}

/** Which old keys can be removed from ENCRYPTION_KEYS. */
export function retirementReport(status: ColumnStatus[], configured: string[]): RetirementReport {
  const totals: Record<string, number> = {};
  let notV1 = 0;
  for (const s of status) {
    notV1 += s.notV1;
    for (const [k, n] of Object.entries(s.byKey)) totals[k] = (totals[k] ?? 0) + n;
  }
  const old = configured.slice(1);
  const inUse: Record<string, number> = {};
  const unknown: Record<string, number> = {};
  for (const [k, n] of Object.entries(totals)) {
    if (configured.includes(k)) inUse[k] = n;
    else unknown[k] = n;
  }
  const retirable = notV1 > 0 ? [] : old.filter((k) => !totals[k]);
  return { retirable, inUse, unknown, notV1 };
}

// ── Rewrite (backfill and rotation) ─────────────────────

export type RewriteTarget =
  /** Backfill: every value becomes v1 (any configured key). */
  | "v1"
  /** Rotation: every value becomes v1 under the current key. */
  | "current-key";

export interface RewriteOptions {
  target: RewriteTarget;
  /** Current key id (required for "current-key"). */
  currentKeyId?: string;
  batchSize?: number;
  /** Pause between batches, to keep load on a live database low. */
  pauseMs?: number;
  only?: string[];
  onProgress?: (p: ColumnProgress) => void;
}

export interface ColumnProgress {
  table: string;
  column: string;
  scanned: number;
  rewritten: number;
  /** The app changed the value first; its write stands. */
  raced: number;
  /** Could not be read (unknown key, tampered, unrecognised format). */
  unreadable: number;
  unreadableIds: string[];
  done: boolean;
  missing?: boolean;
}

/**
 * Pre-v1 secrets are base64 blobs (shared format) or three base64 parts
 * joined by ':' (old API format). Anything else (Google tokens contain
 * '.', '-' or '_') cannot be a pre-v1 ciphertext, so it is plaintext.
 */
export function looksLikePlaintextSecret(v: string): boolean {
  const b64 = "[A-Za-z0-9+/]+={0,2}";
  return !new RegExp(`^${b64}$`).test(v) && !new RegExp(`^${b64}:${b64}:(${b64})?$`).test(v);
}

class Unreadable extends Error {}

function rewriteSecret(stored: string, currentKey: string | undefined): string {
  if (isEncryptedValue(stored)) {
    try {
      const plain = decryptField(stored, "");
      return encryptField(plain, "");
    } catch {
      throw new Unreadable();
    }
  }
  let plain: string;
  try {
    plain = decryptLegacySecret(stored);
  } catch {
    if (!looksLikePlaintextSecret(stored)) throw new Unreadable();
    plain = stored;
  }
  return encryptField(plain, "");
}

/** New stored value for one row, as the SQL literal the column takes. */
function rewriteValue(col: EncryptedColumn, raw: string, currentKey: string | undefined): string {
  switch (col.kind) {
    case "text": {
      if (!isEncryptedValue(raw)) return encryptField(raw, col.aad);
      try {
        return encryptField(decryptField(raw, col.aad), col.aad);
      } catch {
        throw new Unreadable();
      }
    }
    case "secret":
      return rewriteSecret(raw, currentKey);
    case "json": {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === "string" && isEncryptedValue(parsed)) {
        try {
          return JSON.stringify(encryptField(decryptField(parsed, col.aad), col.aad));
        } catch {
          throw new Unreadable();
        }
      }
      return JSON.stringify(encryptField(JSON.stringify(parsed), col.aad));
    }
    case "secret-config": {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Unreadable();
      const obj = parsed as Record<string, unknown>;
      if (typeof obj._encrypted === "string") {
        return JSON.stringify({ ...obj, _encrypted: rewriteSecret(obj._encrypted, currentKey) });
      }
      // Plain config written before it was encrypted: wrap it the way
      // encryptConfig() does.
      return JSON.stringify({ _encrypted: encryptField(JSON.stringify(obj), "") });
    }
  }
}

async function primaryKey(sql: Sql, table: string): Promise<string[]> {
  const rows = await sql`
    select a.attname as name
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
    where i.indrelid = ${`"${table}"`}::regclass and i.indisprimary
    order by array_position(i.indkey::int2[], a.attnum)`;
  if (rows.length === 0) throw new Error(`${table} has no primary key`);
  return rows.map((r) => r.name as string);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = new Set(["40001", "40P01", "55P03"]);

async function rewriteColumn(sql: Sql, col: EncryptedColumn, opts: RewriteOptions): Promise<ColumnProgress> {
  const progress: ColumnProgress = {
    table: col.table,
    column: col.column,
    scanned: 0,
    rewritten: 0,
    raced: 0,
    unreadable: 0,
    unreadableIds: [],
    done: false,
  };
  if (!(await columnExists(sql, col))) {
    progress.missing = true;
    progress.done = true;
    opts.onProgress?.(progress);
    return progress;
  }

  const batchSize = opts.batchSize ?? 200;
  const pauseMs = opts.pauseMs ?? 25;
  const pk = await primaryKey(sql, col.table);
  const pkList = pk.map(q).join(", ");
  const t = q(col.table);
  const c = q(col.column);
  const isJson = col.kind === "json" || col.kind === "secret-config";
  const done =
    opts.target === "current-key"
      ? isV1(col, opts.currentKeyId ?? (() => { throw new Error("currentKeyId is required for rotation"); })())
      : isV1(col);
  const work = `${hasContent(col)} and not ${done}`;
  const valueSql = isJson ? `${c}::text` : c;
  const pkSelect = pk.map((k, i) => `${q(k)}::text as k${i}`).join(", ");

  let after: string[] | null = null;
  for (;;) {
    const params: string[] = after ?? [];
    const keyCond: string = after ? `and (${pkList}) > (${pk.map((_, i) => `$${i + 1}`).join(", ")})` : "";
    const rows: Array<Record<string, unknown>> = await sql.unsafe(
      `select ${pkSelect}, ${valueSql} as v from ${t} where ${work} ${keyCond} order by ${pkList} limit ${batchSize}`,
      params,
    );
    if (rows.length === 0) break;

    const updates: Array<{ keys: string[]; old: string; next: string }> = [];
    for (const row of rows) {
      const keys = pk.map((_, i) => row[`k${i}`] as string);
      progress.scanned++;
      try {
        updates.push({ keys, old: row.v as string, next: rewriteValue(col, row.v as string, opts.currentKeyId) });
      } catch (err) {
        if (!(err instanceof Unreadable) && !(err instanceof SyntaxError)) throw err;
        progress.unreadable++;
        if (progress.unreadableIds.length < 20) progress.unreadableIds.push(keys.join("/"));
      }
    }

    const cast = isJson ? "::jsonb" : "";
    const n = pk.length;
    const whereKeys = pk.map((k, i) => `${q(k)} = $${i + 2}`).join(" and ");
    const updateSql = `update ${t} set ${c} = $1${cast} where ${whereKeys} and ${valueSql} = $${n + 2}`;
    for (let attempt = 1; ; attempt++) {
      try {
        let rewritten = 0;
        await sql.begin(async (tx) => {
          await tx.unsafe(`select set_config('revualy.maintenance', 'on', true)`);
          await tx.unsafe(`set local lock_timeout = '2s'`);
          for (const u of updates) {
            const res = await tx.unsafe(updateSql, [u.next, ...u.keys, u.old]);
            rewritten += res.count;
          }
        });
        progress.rewritten += rewritten;
        progress.raced += updates.length - rewritten;
        break;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (attempt < 3 && code && RETRYABLE.has(code)) {
          await sleep(200 * attempt);
          continue;
        }
        throw err;
      }
    }

    const last: Record<string, unknown> = rows[rows.length - 1];
    after = pk.map((_, i) => last[`k${i}`] as string);
    opts.onProgress?.({ ...progress });
    if (rows.length < batchSize) break;
    if (pauseMs > 0) await sleep(pauseMs);
  }

  progress.done = true;
  opts.onProgress?.({ ...progress });
  return progress;
}

/**
 * Rewrite every encrypted column to the target format, one column at a
 * time, in primary-key order. Returns per-column results.
 */
export async function rewriteEncryptedColumns(sql: Sql, opts: RewriteOptions): Promise<ColumnProgress[]> {
  const results: ColumnProgress[] = [];
  for (const col of selectColumns(opts.only)) {
    results.push(await rewriteColumn(sql, col, opts));
  }
  return results;
}

export { isEmptyJson };
