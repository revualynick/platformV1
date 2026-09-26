#!/usr/bin/env tsx
/**
 * Encryption key rotation (keyring, ENCRYPTION_KEYS). See docs/key-rotation.md.
 *
 * Re-encrypts every encrypted value that is not under the current key (the
 * first entry in ENCRYPTION_KEYS) with the current key: v1 values under old
 * key ids, pre-v1 secret formats and any legacy plaintext. Runs while the
 * app is live, in small throttled batches, and can be stopped and rerun at
 * any point. At the end it reports which old keys no longer protect any
 * value and can be removed from ENCRYPTION_KEYS.
 *
 * Usage (from the repo root, with the tenant's DATABASE_URL and the NEW
 * ENCRYPTION_KEYS, e.g. "k2:<new>,k1:<old>"):
 *   tsx scripts/rotate-encryption-key.ts --dry-run
 *   tsx scripts/rotate-encryption-key.ts [--batch 200] [--pause-ms 25] [--only table.column]
 *
 * Equivalent to `pnpm --filter @revualy/db encryption rotate`; the logic
 * lives in packages/db/src/encryption-maintenance.ts.
 */
process.argv.splice(2, 0, "rotate");
import("../packages/db/src/encryption-cli.js").catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
