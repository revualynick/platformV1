import crypto from "node:crypto";

const WS_SECRET = process.env.WS_TOKEN_SECRET ?? (() => {
  if (process.env.INTERNAL_API_SECRET) {
    if (process.env.NODE_ENV === "production") {
      console.warn("WS_TOKEN_SECRET not set — falling back to INTERNAL_API_SECRET. Set a dedicated WS_TOKEN_SECRET for production.");
    }
    return process.env.INTERNAL_API_SECRET;
  }
  return undefined;
})();
const TOKEN_TTL_MS = 60_000; // 60 seconds — token is only for initial WS handshake

interface WsTokenPayload {
  userId: string;
  orgId: string;
  sessionId: string;
  exp: number;
}

/**
 * Generate a signed, short-lived token for WebSocket authentication.
 * Called by the REST API when a client needs to open a WS connection.
 */
export function generateWsToken(
  userId: string,
  orgId: string,
  sessionId: string,
): string {
  if (!WS_SECRET) {
    throw new Error("INTERNAL_API_SECRET is required for WS token generation");
  }

  const payload: WsTokenPayload = {
    userId,
    orgId,
    sessionId,
    exp: Date.now() + TOKEN_TTL_MS,
  };

  const data = JSON.stringify(payload);
  const encoded = Buffer.from(data).toString("base64url");
  const sig = crypto
    .createHmac("sha256", WS_SECRET)
    .update(encoded)
    .digest("base64url");

  return `${encoded}.${sig}`;
}

/**
 * Verify and decode a WS auth token.
 * Returns the payload if valid, null otherwise.
 */
export function verifyWsToken(token: string): WsTokenPayload | null {
  if (!WS_SECRET) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encoded, sig] = parts;

  const expectedSig = crypto
    .createHmac("sha256", WS_SECRET)
    .update(encoded)
    .digest("base64url");

  // Timing-safe comparison
  if (sig.length !== expectedSig.length) return null;
  if (
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString(),
    ) as WsTokenPayload;

    // Check expiration
    if (payload.exp < Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}
