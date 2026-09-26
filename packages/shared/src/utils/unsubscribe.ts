import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed one-click unsubscribe tokens (RFC 8058). The API signs a token
 * per recipient and notification type when it sends an email; the web app
 * verifies it on a public route, so unsubscribing needs no login. The
 * token only ever turns one notification type off for one user.
 *
 * Format: `${userId}.${type}.${base64url HMAC-SHA256}`. The HMAC key is
 * derived from INTERNAL_API_SECRET with a purpose label, so the raw secret
 * is never used directly and a token can't be replayed for another purpose.
 */

const PURPOSE = "revualy:unsubscribe:v1";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPE_RE = /^[a-z_]{1,50}$/;

function sign(secret: string, userId: string, type: string): string {
  const key = createHmac("sha256", secret).update(PURPOSE).digest();
  return createHmac("sha256", key).update(`${userId}:${type}`).digest("base64url");
}

export function createUnsubscribeToken(secret: string, userId: string, type: string): string {
  if (!secret) throw new Error("Unsubscribe tokens need INTERNAL_API_SECRET");
  if (!UUID_RE.test(userId) || !TYPE_RE.test(type)) throw new Error("Invalid unsubscribe token input");
  return `${userId}.${type}.${sign(secret, userId, type)}`;
}

export function verifyUnsubscribeToken(
  secret: string,
  token: string,
): { userId: string; type: string } | null {
  if (!secret || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, type, mac] = parts;
  if (!UUID_RE.test(userId) || !TYPE_RE.test(type)) return null;
  const expected = Buffer.from(sign(secret, userId, type));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { userId, type };
}
