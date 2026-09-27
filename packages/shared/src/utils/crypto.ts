import crypto from "node:crypto";

/**
 * Application-layer encryption at rest (AES-256-GCM).
 *
 * Format (v1): `enc:v1:{keyId}:{base64(iv | tag | ciphertext)}`
 *  - the prefix tells ciphertext apart from legacy plaintext, so columns can
 *    switch to encryption with no downtime and be backfilled later
 *  - the key id lets old keys keep decrypting during rotation
 *  - associated data (AAD) binds a value to where it lives (e.g.
 *    "feedback_entries.raw_content"), so ciphertext copied into another
 *    column fails to decrypt
 *
 * Keys: ENCRYPTION_KEYS="k2:<64 hex>,k1:<64 hex>" (first = current key), or
 * a single legacy ENCRYPTION_KEY, which is treated as key id "k1". Keys are
 * parsed once and cached: no per-call key derivation, so encryption adds
 * microseconds, not milliseconds. There is no plaintext fallback: without a
 * key, every encrypt and decrypt throws (fail closed).
 *
 * Legacy reads: rows written before a column was encrypted (plaintext) and
 * secrets in the two pre-v1 formats are readable only while
 * ENCRYPTION_LEGACY_READS=on. The default is off (fail closed): there is no
 * customer data from before encryption (2026-09-26), so only the demo and
 * test tenants ever need "on", briefly, until their backfill has run.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const PREFIX = "enc:v1:";
const KEY_ID_RE = /^[a-z0-9]{1,16}$/;
const HEX_KEY_RE = /^[0-9a-fA-F]{64}$/;

interface Keyring {
  currentId: string;
  keys: Map<string, Buffer>;
}

let cachedKeyring: Keyring | null = null;
let cachedLegacyReads: boolean | null = null;

function parseKeyring(): Keyring {
  const multi = process.env.ENCRYPTION_KEYS?.trim();
  const keys = new Map<string, Buffer>();

  if (multi) {
    for (const entry of multi.split(",")) {
      const [id, hex] = entry.trim().split(":");
      if (!id || !KEY_ID_RE.test(id)) {
        throw new Error("ENCRYPTION_KEYS: each entry must be <id>:<64 hex>, id = 1-16 lowercase letters/digits");
      }
      if (!hex || !HEX_KEY_RE.test(hex)) {
        throw new Error(`ENCRYPTION_KEYS: key "${id}" must be 64 hex characters`);
      }
      if (keys.has(id)) throw new Error(`ENCRYPTION_KEYS: duplicate key id "${id}"`);
      keys.set(id, Buffer.from(hex, "hex"));
    }
  } else {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex) {
      throw new Error(
        "Encryption key missing: set ENCRYPTION_KEYS or ENCRYPTION_KEY (64 hex chars). " +
          "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      );
    }
    if (!HEX_KEY_RE.test(hex)) {
      throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
    }
    keys.set("k1", Buffer.from(hex, "hex"));
  }

  const currentId = keys.keys().next().value as string;
  return { currentId, keys };
}

function keyring(): Keyring {
  if (!cachedKeyring) cachedKeyring = parseKeyring();
  return cachedKeyring;
}

function parseLegacyReads(): boolean {
  const raw = (process.env.ENCRYPTION_LEGACY_READS ?? "").trim().toLowerCase();
  if (raw === "on") return true;
  if (raw === "" || raw === "off") return false;
  throw new Error('ENCRYPTION_LEGACY_READS must be "on" or "off"');
}

/**
 * Whether values not in the v1 format may still be read (legacy plaintext
 * rows, pre-v1 secret formats). ENCRYPTION_LEGACY_READS: "off" by default;
 * "on" only for a tenant with pre-encryption rows until its backfill runs.
 */
export function legacyReadsAllowed(): boolean {
  if (cachedLegacyReads === null) cachedLegacyReads = parseLegacyReads();
  return cachedLegacyReads;
}

/**
 * Validate the key configuration now, so a misconfigured deployment fails
 * at startup instead of on the first request that touches encrypted data.
 */
export function assertEncryptionReady(): void {
  keyring();
  legacyReadsAllowed();
}

/** Test hook: forget cached keys and settings so a test can change the env. */
export function resetKeyringForTests(): void {
  cachedKeyring = null;
  cachedLegacyReads = null;
}

/** Id of the key new values are encrypted with (first in ENCRYPTION_KEYS). */
export function currentKeyId(): string {
  return keyring().currentId;
}

/** Every configured key id, current first. */
export function configuredKeyIds(): string[] {
  return [...keyring().keys.keys()];
}

/** Key id of a v1 value, or null if the value is not in the v1 format. */
export function storedKeyId(stored: string): string | null {
  if (!stored.startsWith(PREFIX)) return null;
  const rest = stored.slice(PREFIX.length);
  const sep = rest.indexOf(":");
  return sep < 1 ? null : rest.slice(0, sep);
}

// ── Field encryption (with associated data) ──────────────

/**
 * Encrypt a value for storage. Empty strings are stored as-is: encrypting
 * them hides nothing, and it keeps DB defaults of '' meaningful.
 */
export function encryptField(plaintext: string, aad: string): string {
  if (plaintext === "") return "";
  const { currentId, keys } = keyring();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keys.get(currentId)!, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const packed = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
  return `${PREFIX}${currentId}:${packed}`;
}

/**
 * Decrypt a stored value. Values without the `enc:v1:` prefix are legacy
 * plaintext written before the column was encrypted: returned unchanged
 * while legacy reads are allowed, refused once ENCRYPTION_LEGACY_READS=off.
 * Tampered values, wrong AAD or an unknown key id always throw.
 */
export function decryptField(stored: string, aad: string): string {
  if (!stored.startsWith(PREFIX)) {
    if (stored === "" || legacyReadsAllowed()) return stored;
    throw new Error(
      `Refusing an unencrypted value in ${aad || "a secret field"} (ENCRYPTION_LEGACY_READS=off). Run the encryption backfill.`,
    );
  }
  const rest = stored.slice(PREFIX.length);
  const sep = rest.indexOf(":");
  const keyId = rest.slice(0, sep);
  const key = keyring().keys.get(keyId);
  if (sep < 1 || !key) {
    throw new Error(`Cannot decrypt: unknown encryption key id "${keyId}"`);
  }
  const packed = Buffer.from(rest.slice(sep + 1), "base64");
  return openGcm(key, packed, Buffer.from(aad, "utf8"));
}

/** True if a stored value is in the current encrypted format. */
export function isEncryptedValue(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

function openGcm(key: Buffer, packed: Buffer, aad?: Buffer): string {
  const iv = packed.subarray(0, IV_LENGTH);
  const tag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// ── Secrets without a column binding (OAuth tokens, config) ──

/**
 * Encrypt a secret (OAuth token, integration config). Writes the v1 format
 * with empty associated data.
 */
export function encrypt(plaintext: string): string {
  return encryptField(plaintext, "");
}

/**
 * Decrypt a secret. Reads the v1 format and, while legacy reads are
 * allowed, both pre-v1 formats (see decryptLegacySecret). Throws if nothing
 * decrypts, or on a pre-v1 value once ENCRYPTION_LEGACY_READS=off.
 */
export function decrypt(stored: string): string {
  // encrypt("") stores "" (see encryptField), so read it back as "" rather
  // than refuse it as a pre-v1 secret (review finding 2026-09-28).
  if (stored === "") return "";
  if (stored.startsWith(PREFIX)) return decryptField(stored, "");
  if (!legacyReadsAllowed()) {
    throw new Error("Refusing a pre-v1 secret (ENCRYPTION_LEGACY_READS=off). Run the encryption backfill.");
  }
  return decryptLegacySecret(stored);
}

/**
 * Read a secret in one of the two pre-v1 formats, whatever the legacy-reads
 * setting (the backfill needs it to rewrite them):
 *  - `@revualy/shared` legacy: base64(iv | tag | ciphertext)
 *  - `apps/api` legacy: base64(iv):base64(tag):base64(ciphertext)
 * Tried against every configured key (the GCM tag proves which one is
 * right). Throws if nothing decrypts.
 */
export function decryptLegacySecret(stored: string): string {
  let packed: Buffer;
  const parts = stored.split(":");
  if (parts.length === 3) {
    const [iv, tag, data] = parts.map((p) => Buffer.from(p, "base64"));
    packed = Buffer.concat([iv, tag, data]);
  } else {
    packed = Buffer.from(stored, "base64");
  }
  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Cannot decrypt: value is not in a recognised encrypted format");
  }

  for (const key of keyring().keys.values()) {
    try {
      return openGcm(key, packed);
    } catch {
      // wrong key, try the next
    }
  }
  throw new Error("Cannot decrypt: no configured key matches this value");
}

/**
 * @deprecated Encryption is mandatory (fail closed). Kept so older call
 * sites compile; do not use it to skip encryption.
 */
export function isEncryptionConfigured(): boolean {
  try {
    keyring();
    return true;
  } catch {
    return false;
  }
}

/** Cryptographically-random UUID v4. Node-only (uses node:crypto). */
export function generateId(): string {
  return crypto.randomUUID();
}
