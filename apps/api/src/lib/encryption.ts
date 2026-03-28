import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";

let _key: Buffer | null = null;

function getKey(): Buffer {
  if (_key) return _key;

  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY env var is required in production (64-char hex string)");
    }
    // Development only: derive from INTERNAL_API_SECRET (never use in production)
    const secret = process.env.INTERNAL_API_SECRET;
    if (!secret) {
      throw new Error("ENCRYPTION_KEY or INTERNAL_API_SECRET is required for encryption");
    }
    console.warn("[encryption] WARNING: Using derived key from INTERNAL_API_SECRET — set ENCRYPTION_KEY for production");
    _key = crypto.createHash("sha256").update(secret).digest();
    return _key;
  }

  const buf = Buffer.from(key, "hex");
  if (buf.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must be a 64-char hex string (32 bytes), got ${buf.length} bytes`);
  }
  _key = buf;
  return _key;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all base64)
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decrypt(encoded: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = encoded.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Invalid encrypted format");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString("utf8") + decipher.final("utf8");
}

export function encryptConfig(config: Record<string, unknown>): string {
  return encrypt(JSON.stringify(config));
}

export function decryptConfig(encrypted: string): Record<string, unknown> {
  // Let errors propagate — silent failures hide tampering/misconfiguration
  return JSON.parse(decrypt(encrypted)) as Record<string, unknown>;
}
