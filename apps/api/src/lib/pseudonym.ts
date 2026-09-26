import { createHmac } from "node:crypto";

/**
 * Tier A pseudonyms (docs/design/privacy-and-agent-access.md).
 *
 * Reviews of others are stored against `reviewer_ref`, an HMAC-SHA256 of
 * `orgId:userId` under a per-tenant secret held outside the database
 * (`REVIEWER_PSEUDONYM_SECRET`). The same person always gets the same
 * reference, so duplicate prevention and distinct-reviewer counts still
 * work, but the database alone cannot reverse it.
 *
 * Limit: the secret is in this process's environment, because write-back
 * needs it. Anyone holding it and the user list can recompute every
 * reference; that is what the super-admin re-identification route does,
 * and why every use of that route is audited.
 *
 * Migration 0043 computes the same value in SQL (pgcrypto `hmac`), so the
 * two must stay identical: lowercase uuid, `orgId:userId`, hex digest.
 */

export const PSEUDONYM_SECRET_ENV = "REVIEWER_PSEUDONYM_SECRET";
const MIN_SECRET_LENGTH = 32;
// Test-only fallback so unit tests run without configuration. Never used
// outside a test runner.
const TEST_SECRET = "test-only-reviewer-pseudonym-secret-not-real";

function inTestRunner(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

/** The tenant's pseudonym secret. Throws (fails closed) when it is missing or short outside tests. */
export function pseudonymSecret(): string {
  const secret = process.env[PSEUDONYM_SECRET_ENV];
  if (secret && secret.length >= MIN_SECRET_LENGTH) return secret;
  if (inTestRunner()) return secret || TEST_SECRET;
  throw new Error(
    `${PSEUDONYM_SECRET_ENV} is ${secret ? `shorter than ${MIN_SECRET_LENGTH} characters` : "not set"}: refusing to store peer feedback without a pseudonym secret`,
  );
}

/** Throws at startup if the secret is unusable (same pattern as assertEncryptionReady). */
export function assertPseudonymReady(): void {
  pseudonymSecret();
  tenantOrgId();
}

/** The deployment's org id (one tenant per deployment). */
export function tenantOrgId(): string {
  const orgId = process.env.ORG_ID;
  if (orgId) return orgId;
  if (inTestRunner()) return "test-org";
  throw new Error("ORG_ID is not set: cannot derive reviewer pseudonyms");
}

/** HMAC-SHA256(secret, `orgId:userId`), hex. */
export function reviewerRef(orgId: string, userId: string): string {
  return createHmac("sha256", pseudonymSecret())
    .update(`${orgId}:${userId.toLowerCase()}`)
    .digest("hex");
}

/** reviewerRef for this deployment's tenant. */
export function tenantReviewerRef(userId: string): string {
  return reviewerRef(tenantOrgId(), userId);
}

/** The label shown wherever a reviewer column is needed (exports, calibration). Never a name. */
export function reviewerLabel(ref: string): string {
  return `Reviewer ${ref.slice(0, 8)}`;
}
