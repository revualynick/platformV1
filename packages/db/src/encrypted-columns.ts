/**
 * Every column that holds encrypted data, for the backfill, the plaintext
 * check and key rotation (see encryption-maintenance.ts).
 *
 * `encryptedText()` and `encryptedJson()` in the schema register themselves
 * here when the schema module loads, so a new encrypted column is covered by
 * maintenance without a second list to keep in step. The secret columns
 * below are encrypted by hand at their call sites (OAuth tokens, integration
 * config), so they are listed explicitly.
 *
 * Kinds:
 *  - text:   `text` column, v1 value with AAD "table.column"; '' allowed
 *  - json:   `jsonb` column holding a JSON string with a v1 value (AAD
 *            "table.column"); SQL NULL, {} and [] are left as they are
 *  - secret: `text` column, v1 value with empty AAD (encrypt()/decrypt());
 *            may also hold the two pre-v1 formats or plaintext tokens
 *  - secret-config: `integrations.config`, a jsonb object whose
 *            `_encrypted` field is a secret (encryptConfig())
 */

export type EncryptedColumnKind = "text" | "json" | "secret" | "secret-config";

export interface EncryptedColumn {
  table: string;
  column: string;
  kind: EncryptedColumnKind;
  /** Associated data used when encrypting ("" for secrets). */
  aad: string;
}

const registry = new Map<string, EncryptedColumn>();

export function registerEncryptedColumn(col: EncryptedColumn): void {
  registry.set(`${col.table}.${col.column}`, col);
}

const SECRET_COLUMNS: EncryptedColumn[] = [
  { table: "calendar_tokens", column: "access_token", kind: "secret", aad: "" },
  { table: "calendar_tokens", column: "refresh_token", kind: "secret", aad: "" },
  { table: "auth_account", column: "access_token", kind: "secret", aad: "" },
  { table: "auth_account", column: "refresh_token", kind: "secret", aad: "" },
  { table: "auth_account", column: "id_token", kind: "secret", aad: "" },
  { table: "integrations", column: "config", kind: "secret-config", aad: "" },
];
for (const c of SECRET_COLUMNS) registerEncryptedColumn(c);

/**
 * All registered encrypted columns, sorted by table then column. Import the
 * schema before calling this (encryption-maintenance.ts does), or the
 * schema's columns will not have registered yet.
 */
export function encryptedColumns(): EncryptedColumn[] {
  return [...registry.values()].sort((a, b) =>
    a.table === b.table ? a.column.localeCompare(b.column) : a.table.localeCompare(b.table),
  );
}
