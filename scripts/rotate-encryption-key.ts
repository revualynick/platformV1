#!/usr/bin/env tsx
/**
 * ENCRYPTION_KEY rotation script.
 *
 * Decrypts all encrypted data with the old key and re-encrypts with the new key.
 * Must be run while the application is stopped (or in maintenance mode) to avoid
 * race conditions with concurrent writes.
 *
 * Affected tables:
 *   1. calendar_tokens  — access_token, refresh_token  (format: @revualy/shared)
 *   2. auth_account     — access_token, refresh_token, id_token (format: @revualy/shared)
 *   3. integrations     — config (JSONB with _encrypted key, format: apps/api colon-delimited)
 *
 * Usage:
 *   OLD_ENCRYPTION_KEY=<old-hex> ENCRYPTION_KEY=<new-hex> DATABASE_URL=<url> tsx scripts/rotate-encryption-key.ts
 *
 * Dry-run (shows counts, no writes):
 *   OLD_ENCRYPTION_KEY=<old-hex> ENCRYPTION_KEY=<new-hex> DATABASE_URL=<url> tsx scripts/rotate-encryption-key.ts --dry-run
 */

import crypto from "node:crypto";
import postgres from "postgres";

// ── Config ──────────────────────────────────────────────

const OLD_KEY_HEX = process.env.OLD_ENCRYPTION_KEY;
const NEW_KEY_HEX = process.env.ENCRYPTION_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const DRY_RUN = process.argv.includes("--dry-run");

if (!OLD_KEY_HEX || !NEW_KEY_HEX || !DATABASE_URL) {
  console.error(
    "Required env vars: OLD_ENCRYPTION_KEY, ENCRYPTION_KEY, DATABASE_URL",
  );
  process.exit(1);
}

if (OLD_KEY_HEX === NEW_KEY_HEX) {
  console.error("OLD_ENCRYPTION_KEY and ENCRYPTION_KEY must be different");
  process.exit(1);
}

function validateKeyHex(hex: string, label: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    console.error(`${label} must be a 64-char hex string (32 bytes)`);
    process.exit(1);
  }
  return Buffer.from(hex, "hex");
}

const oldKey = validateKeyHex(OLD_KEY_HEX, "OLD_ENCRYPTION_KEY");
const newKey = validateKeyHex(NEW_KEY_HEX, "ENCRYPTION_KEY");

// ── Shared-format encrypt/decrypt (binary base64: IV || tag || ciphertext) ──

function decryptShared(encoded: string, key: Buffer): string {
  const combined = Buffer.from(encoded, "base64");
  const iv = combined.subarray(0, 12);
  const tag = combined.subarray(12, 28);
  const ciphertext = combined.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function encryptShared(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

// ── API-format encrypt/decrypt (colon-delimited base64: iv:tag:ciphertext) ──

function decryptApi(encoded: string, key: Buffer): string {
  const [ivB64, tagB64, dataB64] = encoded.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Invalid API encrypted format");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  if (iv.length !== 12) throw new Error("Invalid IV length");
  if (tag.length !== 16) throw new Error("Invalid auth tag length");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString("utf8") + decipher.final("utf8");
}

function encryptApi(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

// ── Re-encrypt helper ───────────────────────────────────

function reencryptShared(value: string): string {
  const plaintext = decryptShared(value, oldKey);
  return encryptShared(plaintext, newKey);
}

function reencryptApi(value: string): string {
  const plaintext = decryptApi(value, oldKey);
  return encryptApi(plaintext, newKey);
}

// ── Main ────────────────────────────────────────────────

async function main() {
  const sql = postgres(DATABASE_URL!);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log("");

  let totalRotated = 0;

  // 1. calendar_tokens (shared format)
  const calendarRows = await sql`
    SELECT id, access_token, refresh_token FROM calendar_tokens
  `;
  console.log(`calendar_tokens: ${calendarRows.length} rows`);

  for (const row of calendarRows) {
    try {
      const newAccess = reencryptShared(row.access_token);
      const newRefresh = reencryptShared(row.refresh_token);
      if (!DRY_RUN) {
        await sql`
          UPDATE calendar_tokens
          SET access_token = ${newAccess}, refresh_token = ${newRefresh}, updated_at = now()
          WHERE id = ${row.id}
        `;
      }
      totalRotated++;
    } catch (err) {
      console.error(`  SKIP calendar_tokens id=${row.id}: ${(err as Error).message}`);
    }
  }

  // 2. auth_account (shared format)
  const authRows = await sql`
    SELECT provider, "providerAccountId", access_token, refresh_token, id_token
    FROM auth_account
  `;
  console.log(`auth_account: ${authRows.length} rows`);

  for (const row of authRows) {
    try {
      const updates: Record<string, string> = {};
      if (row.access_token) updates.access_token = reencryptShared(row.access_token);
      if (row.refresh_token) updates.refresh_token = reencryptShared(row.refresh_token);
      if (row.id_token) updates.id_token = reencryptShared(row.id_token);

      if (Object.keys(updates).length > 0 && !DRY_RUN) {
        await sql`
          UPDATE auth_account
          SET
            access_token = ${updates.access_token ?? row.access_token},
            refresh_token = ${updates.refresh_token ?? row.refresh_token},
            id_token = ${updates.id_token ?? row.id_token}
          WHERE provider = ${row.provider} AND "providerAccountId" = ${row.providerAccountId}
        `;
      }
      totalRotated++;
    } catch (err) {
      // May not be encrypted yet (pre-migration plaintext) — skip
      console.error(
        `  SKIP auth_account ${row.provider}/${row.providerAccountId}: ${(err as Error).message}`,
      );
    }
  }

  // 3. integrations (API colon-delimited format, stored in JSONB as { _encrypted: "..." })
  const integrationRows = await sql`
    SELECT id, platform, config FROM integrations
    WHERE config IS NOT NULL AND config::text != '{}'
  `;
  console.log(`integrations: ${integrationRows.length} rows with config`);

  for (const row of integrationRows) {
    try {
      const config = row.config as Record<string, unknown>;
      if (!config._encrypted || typeof config._encrypted !== "string") continue;

      const newEncrypted = reencryptApi(config._encrypted);
      if (!DRY_RUN) {
        const newConfig = JSON.stringify({ _encrypted: newEncrypted });
        await sql`
          UPDATE integrations
          SET config = ${newConfig}::jsonb, updated_at = now()
          WHERE id = ${row.id}
        `;
      }
      totalRotated++;
    } catch (err) {
      console.error(`  SKIP integrations id=${row.id} (${row.platform}): ${(err as Error).message}`);
    }
  }

  console.log("");
  console.log(`Done. ${totalRotated} records ${DRY_RUN ? "would be" : ""} rotated.`);
  if (DRY_RUN) {
    console.log("Re-run without --dry-run to apply changes.");
  }

  await sql.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
