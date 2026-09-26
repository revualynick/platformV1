# Encryption backfill and legacy reads off (C3 step 7)

Status: merged 2026-09-26, not reviewed
Commits: c26597e, ae1496c, 1363b63 (merged f9d724b), 528b3d5 · Migration: 0042 · Design: `docs/c3-plan.md` Phase E, `docs/key-rotation.md`

## What and why
Rows written before encryption was switched on were still plaintext, some jsonb columns were never encrypted, and key rotation was built for the old single key. Now there is one tool to check, backfill and rotate, more columns are encrypted, and non-v1 values are refused by default.

## What changed
- **Engine** `packages/db/src/encryption-maintenance.ts`: rewrites values in small throttled batches with a compare-and-set (`WHERE col = old value`), so a concurrent app write wins. Idempotent and resumable. Reports counts and row ids only. Unreadable values are skipped and reported.
- **Column registry** `packages/db/src/encrypted-columns.ts`: `encryptedText()` and the new `encryptedJson()` register themselves; OAuth token columns and `integrations.config._encrypted` are listed by hand.
- **Newly encrypted** (jsonb type unchanged, no schema change): `feedback_digests.data`, `three_sixty_reviews.aggregated_data`, `discovered_themes.sample_evidence`, `calibration_reports.data`, `assessment_sessions.responses`, `profile_development_goals.notes`.
- **Migration 0042**: the `updated_at` trigger ignores maintenance writes.
- **CLI** `pnpm --filter @revualy/db encryption <check|backfill|rotate>` (`encryption-cli.ts`); `scripts/rotate-encryption-key.ts` hands over to it.
- **Legacy reads switch** `ENCRYPTION_LEGACY_READS` in `packages/shared/src/utils/crypto.ts`. **Default changed to off** (528b3d5) because Nick confirmed only demo data and his own test tenant predate encryption.
- **Redis** `1on1:content` notes encrypted, bound to the session id (`apps/api/src/modules/one-on-one/ws.ts`).
- `docs/key-rotation.md` rewritten.

## Where it differs from the design
The agent built the legacy switch defaulting to on; it was flipped to off on merge, per Nick.

## How it was tested
- `apps/api/src/__tests__/encryption-backfill.integration.test.ts` (8, on a throwaway database): backfill, check, rotation, compare-and-set never overwrites a newer write, refusal when legacy reads are off.
- `apps/api/src/lib/__tests__/field-crypto.test.ts`: default off, switch on reads legacy formats.
- Local `revualy_dev` backfilled: `encryption check` reports 0 values not v1.
- **Not run:** against Railway (the demo or test tenant).

## Review checklist
- [ ] Read the compare-and-set in `encryption-maintenance.ts`: a value changed between read and write must be left alone.
- [ ] `encryption check` never prints column values, only counts and ids.
- [ ] With `ENCRYPTION_LEGACY_READS` unset, a plaintext row read through Drizzle throws rather than returning plaintext.
- [ ] Every `encryptedText`/`encryptedJson` column appears in the registry output of `encryption check`.

## Not done / limits
- The demo and Nick's test tenant still need a backfill (or a reseed) before this branch deploys; set `ENCRYPTION_LEGACY_READS=on` there until then.
- No CI rule stops raw `sql` selects on encrypted columns bypassing decryption.
- Tier-2 encryption not exercised through the real web pages.

## Decisions pending
- A plaintext OAuth token that looks like old ciphertext is reported as unreadable; the owner reconnects Google. Only affects Nick's test account.

## Later changes
