import { encrypt, decrypt } from "@revualy/shared/server";

/**
 * Integration config encryption. Delegates to the single implementation in
 * @revualy/shared (v1 format with key ids); decrypt still reads this file's
 * old iv:tag:ciphertext format until existing rows are rewritten.
 */
export { encrypt, decrypt };

export function encryptConfig(config: Record<string, unknown>): string {
  return encrypt(JSON.stringify(config));
}

export function decryptConfig(encrypted: string): Record<string, unknown> {
  // Let errors propagate: silent failures hide tampering or misconfiguration
  return JSON.parse(decrypt(encrypted)) as Record<string, unknown>;
}
