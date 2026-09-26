# Encryption keys: backfill, check and rotation

> **Status (2026-09-26):** current. Covers the v1 keyring format, the backfill of legacy rows, the plaintext check and zero-downtime key rotation (C3 step 7). Tested against a local Postgres only; not yet run against a Railway tenant.

## How encryption works

- Values are stored as `enc:v1:{keyId}:{base64(iv | tag | ciphertext)}` (AES-256-GCM). Code: `packages/shared/src/utils/crypto.ts`.
- Keys come from `ENCRYPTION_KEYS="k2:<64 hex>,k1:<64 hex>"`. The first key encrypts new values; every listed key can decrypt. A single `ENCRYPTION_KEY` still works and counts as key id `k1`.
- Columns are encrypted in the ORM (`encryptedText()` and `encryptedJson()` in `packages/db/src/schema/tenant.ts`), with the column name as associated data. OAuth tokens and integration config are encrypted at their call sites with `encrypt()`.
- The API and web services must have the same `ENCRYPTION_KEYS`. Both refuse to start without a key.
- Losing a key loses the data under it for good. Keep every key in the password manager as well as in Railway.

## What is covered

`pnpm --filter @revualy/db encryption check` lists every column. The list is built from the schema, so a new encrypted column is covered automatically. It includes:

- Tier 1 text: messages, feedback, escalations, notes, reflections, 1:1 content, goals, kudos, imports and the rest marked `encryptedText` in the schema.
- Tier 2 jsonb: `feedback_digests.data`, `three_sixty_reviews.aggregated_data`, `discovered_themes.sample_evidence`, `calibration_reports.data`, `assessment_sessions.responses`; and `profile_development_goals.notes` (text). An encrypted jsonb value is stored as a JSON string; SQL NULL, `{}` and `[]` are left as they are.
- Secrets: `calendar_tokens` and `auth_account` tokens, `integrations.config._encrypted`.
- Redis: live 1:1 notes (`1on1:content:{sessionId}`) are encrypted with the session id as associated data. Old plaintext entries are ignored (the notes are reloaded from Postgres) and expire within 24 hours, so Redis needs no backfill.

## The commands

All three need the tenant's `DATABASE_URL` and its `ENCRYPTION_KEYS`. They print counts, key ids and row ids, never content.

```bash
pnpm --filter @revualy/db encryption check             # exit 1 if any value is not v1
pnpm --filter @revualy/db encryption check --current   # exit 1 if any value is not under the current key
pnpm --filter @revualy/db encryption backfill [--dry-run]
pnpm --filter @revualy/db encryption rotate   [--dry-run]   # same as: tsx scripts/rotate-encryption-key.ts
```

Options: `--batch <n>` (default 200), `--pause-ms <n>` between batches (default 25), `--only table,table.column`.

`backfill` and `rotate` are safe while the app is running:

- Each value is rewritten with a compare-and-swap (`WHERE column = old value`), so if the app writes a row in the meantime, the app's write stands. These show as "app wrote first".
- Work runs in small batches in short transactions, with a pause between batches.
- `updated_at` is not touched (migration 0042 lets the maintenance transaction skip the trigger).
- Stopping and rerunning is safe. Finished rows no longer match, so a rerun carries on with what is left.

A value that cannot be read (unknown key id, tampered, or a pre-v1 secret no configured key opens) is left alone and reported with its row id. The command then exits 1.

## Getting the keys to the command

The commands run from a laptop, so they need the public database URL and the service's keys. One way:

```bash
# in the tenant's linked Railway project
export ENCRYPTION_KEYS="$(railway variables --service api --kv | sed -n 's/^ENCRYPTION_KEYS=//p')"
railway run --service Postgres -- sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" pnpm --filter @revualy/db encryption check'
```

I haven't tested this against Railway yet. If the service still uses a single `ENCRYPTION_KEY`, export that instead.

## First run for an existing tenant (backfill)

1. Deploy the release that includes migration 0042 and run migrations (`pnpm tenant:fleet migrate`).
2. `encryption check` to see what is left. Rows written before encryption show as "not-v1".
3. `encryption backfill --dry-run`, then `encryption backfill`.
4. `encryption check` again. It should say `check ok`.
5. Then switch off legacy reads (next section).

## Switching off legacy reads

Legacy reads (plaintext rows and the two pre-v1 secret formats) are **off by default** (`ENCRYPTION_LEGACY_READS` unset or `off`): any value that is not v1 throws instead of being returned (fail closed). There is no customer data from before encryption, so new tenants never need them (decided 2026-09-26).

Only a database with rows from before encryption (the demo and Nick's test tenant) needs `ENCRYPTION_LEGACY_READS=on`, and only until `encryption backfill` and `encryption check` pass. Then remove the variable and redeploy. Reseeding the demo is an equally good alternative to backfilling it.

The backfill itself always reads legacy values, whatever the setting.

## Rotating a key

No maintenance window is needed.

1. Generate a key and store it in the password manager first:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Put it first in `ENCRYPTION_KEYS` on **both** API and web, keeping the old one: `k2:<new>,k1:<old>`. Redeploy both. New writes now use `k2`; old values still read under `k1`.
3. Run `encryption rotate --dry-run`, then `encryption rotate` with the same `ENCRYPTION_KEYS`. It re-encrypts everything not under `k2` (old key values, pre-v1 secrets and any plaintext) and ends with a report:
   - "Can be retired: k1" means no value uses `k1` any more.
   - "Still in use" lists keys with values left (usually unreadable rows or rows added by an app instance still on the old config). Rerun.
4. `encryption check --current` should pass.
5. Remove the old key: `ENCRYPTION_KEYS=k2:<new>` on both services, redeploy. Keep the old key in the password manager for as long as backups taken before step 3 are kept, because those backups still need it.

For a suspected compromise, do the same, then also rotate the database password: the old key can still decrypt any dump taken before the rotation.

Key ids are 1-16 lowercase letters or digits. Never reuse an id for a different key.

## Other secrets

| Secret | Rotation impact | Procedure |
|--------|----------------|-----------|
| `WS_TOKEN_SECRET` | Safe any time. In-flight WebSocket handshakes (60 s window) may fail once. | Set the new value in Railway, redeploy the API. |
| `INTERNAL_API_SECRET` | Must change on API and web together. | Set on both services, redeploy both at once. |
| `NEXTAUTH_SECRET` | Signs everyone out. | Set on the web service, redeploy. |
| `GOOGLE_CLIENT_SECRET` | Change in Google Cloud Console first. | Update in GCP, then set on the web service. |

## Known limits

- Anyone with access to the Railway project can read both the database URL and the keys. This protects dumps, backups and leaked database URLs, not project access.
- Raw `sql` selects bypass the ORM and see ciphertext; encrypted columns cannot be searched, sorted or indexed in SQL.
- A plaintext OAuth token that happens to look like a pre-v1 ciphertext (only base64 characters) cannot be told apart from one, so the backfill reports it as unreadable instead of guessing. The fix for that row is for the user to reconnect.
- Nothing yet runs the backfill or the check across the whole fleet in one go; each tenant is done by hand.
