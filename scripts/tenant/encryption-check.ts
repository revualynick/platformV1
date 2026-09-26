#!/usr/bin/env tsx
/**
 * Encryption round trip with a deployed service's configured key. Meant to
 * run under `railway run --service <api|web>`, which injects that service's
 * ENCRYPTION_KEYS. Uses the application's own crypto (@revualy/shared), so
 * a pass means the app can read what it writes. Prints the key id and
 * fingerprint only, never the key.
 *
 * Usage: tsx encryption-check.ts [--expect sha256:<16 hex>]
 */
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { assertEncryptionReady, decryptField, encryptField } from "@revualy/shared/server";
import { encryptionKeyFingerprint } from "./lib/secrets.js";

function fail(message: string): never {
  console.error(`encryption check FAILED: ${message}`);
  process.exit(1);
}

const { values } = parseArgs({ options: { expect: { type: "string" } } });

try {
  assertEncryptionReady();
} catch (err) {
  fail((err as Error).message);
}

const configured = process.env.ENCRYPTION_KEYS?.trim() || process.env.ENCRYPTION_KEY?.trim() || "";
const { id, fingerprint } = encryptionKeyFingerprint(configured);
if (values.expect && values.expect !== fingerprint) {
  fail(`current key ${id} is ${fingerprint}, expected ${values.expect} (the key in Railway is not the one that was backed up)`);
}

const aad = "readiness.encryption_check";
const sample = `revualy-readiness-${randomUUID()}`;
const stored = encryptField(sample, aad);
if (!stored.startsWith(`enc:v1:${id}:`)) fail("ciphertext is not in the enc:v1 format under the current key id");
if (stored.includes(sample)) fail("ciphertext contains the plaintext");
if (decryptField(stored, aad) !== sample) fail("decrypted value does not match");
let aadBound = false;
try {
  decryptField(stored, "readiness.wrong_column");
} catch {
  aadBound = true;
}
if (!aadBound) fail("value decrypted under the wrong associated data");

console.log(`encryption check ok: key ${id} ${fingerprint}, round trip and AAD binding verified`);
