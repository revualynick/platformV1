import crypto from "node:crypto";

/**
 * Signed OAuth `state` for the Google integration flow.
 *
 * The state is bound to the user who started the flow and expires, so a
 * callback link carrying someone else's authorisation code cannot connect
 * the victim's Revualy account to the attacker's Google account (login
 * CSRF on account linking). returnTo rides along signed so the callback can
 * send the user back to the page that started the flow.
 *
 * Format: base64url(JSON payload) + "." + hex HMAC-SHA256.
 */

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

interface StatePayload {
  /** Random nonce so two states for the same user never collide. */
  n: string;
  /** Revualy user id the flow belongs to. */
  u: string;
  /** Relative return path. */
  r: string;
  /** Expiry, epoch ms. */
  e: number;
}

function hmac(secret: string, data: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

export function signOAuthState(
  secret: string,
  userId: string,
  returnTo: string,
  now = Date.now(),
): string {
  const payload: StatePayload = {
    n: crypto.randomUUID(),
    u: userId,
    r: returnTo,
    e: now + OAUTH_STATE_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${hmac(secret, encoded)}`;
}

export type OAuthStateResult =
  | { valid: true; returnTo: string }
  | { valid: false; reason: "malformed" | "signature" | "expired" | "wrong_user" };

export function verifyOAuthState(
  secret: string,
  state: string,
  userId: string,
  now = Date.now(),
): OAuthStateResult {
  const parts = state.split(".");
  if (parts.length !== 2) return { valid: false, reason: "malformed" };
  const [encoded, sig] = parts;

  const expected = hmac(secret, encoded);
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return { valid: false, reason: "signature" };
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as StatePayload;
  } catch {
    return { valid: false, reason: "malformed" };
  }

  if (typeof payload.e !== "number" || payload.e < now) {
    return { valid: false, reason: "expired" };
  }
  if (payload.u !== userId) return { valid: false, reason: "wrong_user" };

  // Only same-app relative paths, never an open redirect.
  const r = typeof payload.r === "string" ? payload.r : "";
  const returnTo = r.startsWith("/") && !r.startsWith("//") ? r : "";
  return { valid: true, returnTo };
}
