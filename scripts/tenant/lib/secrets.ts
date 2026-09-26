import crypto from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ENCRYPTION_KEY_ID, GENERATED_SECRET_NAMES, type GeneratedSecretName } from "./constants.js";

export type TenantSecrets = Record<GeneratedSecretName, string>;

type RandomBytes = (size: number) => Buffer;

/**
 * Fresh per-tenant secrets. The encryption key uses the ENCRYPTION_KEYS
 * format read by packages/shared/src/utils/crypto.ts ("<id>:<64 hex>").
 * The others are base64url so they survive shells and headers unquoted.
 */
export function generateTenantSecrets(randomBytes: RandomBytes = crypto.randomBytes): TenantSecrets {
  return {
    ENCRYPTION_KEYS: `${ENCRYPTION_KEY_ID}:${randomBytes(32).toString("hex")}`,
    NEXTAUTH_SECRET: randomBytes(32).toString("base64url"),
    INTERNAL_API_SECRET: randomBytes(32).toString("base64url"),
    WS_TOKEN_SECRET: randomBytes(32).toString("hex"),
    REVIEWER_PSEUDONYM_SECRET: randomBytes(32).toString("hex"),
  };
}

const KEYS_ENTRY_RE = /^([a-z0-9]{1,16}):([0-9a-f]{64})$/;

export function validateSecrets(secrets: Partial<Record<string, unknown>>): string[] {
  const errors: string[] = [];
  for (const name of GENERATED_SECRET_NAMES) {
    if (typeof secrets[name] !== "string" || !secrets[name]) errors.push(`${name} is missing`);
  }
  if (errors.length > 0) return errors;
  const s = secrets as TenantSecrets;
  if (!KEYS_ENTRY_RE.test(s.ENCRYPTION_KEYS)) errors.push("ENCRYPTION_KEYS must be a single <id>:<64 hex> entry");
  if (!/^[A-Za-z0-9_-]{43}$/.test(s.NEXTAUTH_SECRET)) errors.push("NEXTAUTH_SECRET must be 32 bytes of base64url");
  if (!/^[A-Za-z0-9_-]{43}$/.test(s.INTERNAL_API_SECRET)) errors.push("INTERNAL_API_SECRET must be 32 bytes of base64url");
  if (!/^[0-9a-f]{64}$/.test(s.WS_TOKEN_SECRET)) errors.push("WS_TOKEN_SECRET must be 64 hex characters");
  if (!/^[0-9a-f]{64}$/.test(s.REVIEWER_PSEUDONYM_SECRET)) errors.push("REVIEWER_PSEUDONYM_SECRET must be 64 hex characters");
  return errors;
}

/**
 * Identify the current (first) encryption key without revealing it:
 * "sha256:" + the first 16 hex characters of SHA-256 over the key bytes.
 * Accepts an ENCRYPTION_KEYS list or a bare legacy 64-hex ENCRYPTION_KEY.
 */
export function encryptionKeyFingerprint(keys: string): { id: string; fingerprint: string } {
  const first = keys.split(",")[0].trim();
  const match = KEYS_ENTRY_RE.exec(first.toLowerCase());
  let id: string;
  let hex: string;
  if (match) {
    [, id, hex] = match;
  } else if (/^[0-9a-f]{64}$/i.test(first)) {
    id = "k1";
    hex = first.toLowerCase();
  } else {
    throw new Error("Encryption key is not in <id>:<64 hex> or 64 hex form");
  }
  const digest = crypto.createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");
  return { id, fingerprint: `sha256:${digest.slice(0, 16)}` };
}

// ── Local pending-secrets file ───────────────────────────
//
// Secrets live here (mode 600, outside the repo) only between generation and
// the env-vars step writing them to Railway. After that the file is deleted:
// Railway and the password manager hold them.

export function writeSecretsFile(path: string, secrets: TenantSecrets): void {
  if (existsSync(path)) throw new Error(`Refusing to overwrite existing secrets file ${path}`);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  chmodSync(path, 0o600);
}

export function readSecretsFile(path: string): TenantSecrets | undefined {
  if (!existsSync(path)) return undefined;
  const data = JSON.parse(readFileSync(path, "utf8")) as Partial<TenantSecrets>;
  const errors = validateSecrets(data);
  if (errors.length > 0) throw new Error(`Secrets file ${path} is invalid: ${errors.join("; ")}`);
  return data as TenantSecrets;
}

export function deleteSecretsFile(path: string): void {
  rmSync(path, { force: true });
}

/** Placeholders used by a dry run in place of secrets that do not exist yet. */
export function placeholderSecrets(): TenantSecrets {
  return Object.fromEntries(GENERATED_SECRET_NAMES.map((n) => [n, `<generated:${n}>`])) as TenantSecrets;
}

const URL_CREDENTIALS_RE = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]*:[^\s/@]+@/gi;

/**
 * Replace every known secret value in some text with <secret:NAME>, and
 * strip credentials from connection URLs (postgres://user:pass@host).
 */
export function redact(text: string, secrets: Record<string, string | undefined>): string {
  let out = text.replace(URL_CREDENTIALS_RE, "$1<redacted>@");
  const entries = Object.entries(secrets)
    .filter((e): e is [string, string] => typeof e[1] === "string" && e[1].length >= 8)
    .sort((a, b) => b[1].length - a[1].length);
  for (const [name, value] of entries) {
    out = out.split(value).join(`<secret:${name}>`);
  }
  return out;
}
