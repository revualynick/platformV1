// Server-only entrypoint for @revualy/shared. Exposes helpers that depend on
// `node:crypto` so they never enter a browser bundle. Import from
// "@revualy/shared/server" in server-only code (API, workers, server components,
// NextAuth config); never from a client component.
export {
  encrypt,
  decrypt,
  encryptField,
  decryptField,
  isEncryptedValue,
  decryptLegacySecret,
  legacyReadsAllowed,
  currentKeyId,
  configuredKeyIds,
  storedKeyId,
  assertEncryptionReady,
  resetKeyringForTests,
  isEncryptionConfigured,
  generateId,
} from "./utils/crypto.js";
export { createUnsubscribeToken, verifyUnsubscribeToken } from "./utils/unsubscribe.js";
