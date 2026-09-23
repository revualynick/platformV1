import {
  jwtVerify,
  importX509,
  createRemoteJWKSet,
  type JWTVerifyGetKey,
  type JWTPayload,
  type KeyLike,
} from "jose";

/**
 * Verification of the bearer token Google Chat sends with every event.
 * See docs/c3-plan.md "Google Chat facts" for sources.
 *
 * The mode follows the Chat API "Authentication audience" setting and is
 * inferred from GOOGLE_CHAT_AUDIENCE:
 *  - a project number (digits): a JWT issued by chat@system.gserviceaccount.com,
 *    verified against that service account's X.509 certificates
 *  - an endpoint URL: a Google OIDC ID token for that URL, whose email claim
 *    must be chat@system.gserviceaccount.com (verified)
 */

export const CHAT_ISSUER = "chat@system.gserviceaccount.com";
const CHAT_CERTS_URL =
  "https://www.googleapis.com/service_accounts/v1/metadata/x509/chat@system.gserviceaccount.com";
const GOOGLE_OIDC_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_OIDC_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const CERT_CACHE_MS = 60 * 60 * 1000;

export type AudienceMode = "project_number" | "endpoint_url";

export function audienceMode(audience: string): AudienceMode {
  if (/^\d+$/.test(audience)) return "project_number";
  if (/^https:\/\//.test(audience)) return "endpoint_url";
  throw new Error(
    "GOOGLE_CHAT_AUDIENCE must be the Google Cloud project number or the https endpoint URL, matching the Chat API 'Authentication audience' setting",
  );
}

export type VerifyFailure =
  | "missing_token"
  | "invalid_token"
  | "wrong_sender";

export interface ChatTokenVerifier {
  verify(bearer: string | undefined): Promise<{ ok: true; payload: JWTPayload } | { ok: false; reason: VerifyFailure }>;
}

/**
 * X.509 certificates for chat@system.gserviceaccount.com, cached for an hour
 * and refetched once when a token names a kid we have not seen (rotation).
 */
function chatCertKeys(fetchImpl: typeof fetch): JWTVerifyGetKey {
  let cache: { at: number; keys: Map<string, KeyLike> } | null = null;

  async function load(): Promise<Map<string, KeyLike>> {
    const res = await fetchImpl(CHAT_CERTS_URL);
    if (!res.ok) throw new Error(`Google Chat certs fetch failed: ${res.status}`);
    const pems = (await res.json()) as Record<string, string>;
    const keys = new Map<string, KeyLike>();
    for (const [kid, pem] of Object.entries(pems)) {
      keys.set(kid, await importX509(pem, "RS256"));
    }
    cache = { at: Date.now(), keys };
    return keys;
  }

  return async (header) => {
    const kid = header.kid ?? "";
    let keys = cache && Date.now() - cache.at < CERT_CACHE_MS ? cache.keys : await load();
    if (!keys.has(kid)) keys = await load();
    const key = keys.get(kid);
    if (!key) throw new Error(`Unknown Google Chat signing key ${kid}`);
    return key;
  };
}

export interface VerifierOptions {
  audience: string;
  /** Tests inject a local key resolver instead of Google's published keys. */
  keyResolver?: JWTVerifyGetKey;
  fetchImpl?: typeof fetch;
}

export function createChatTokenVerifier(opts: VerifierOptions): ChatTokenVerifier {
  const mode = audienceMode(opts.audience);
  const keys =
    opts.keyResolver ??
    (mode === "project_number"
      ? chatCertKeys(opts.fetchImpl ?? fetch)
      : createRemoteJWKSet(new URL(GOOGLE_OIDC_JWKS_URL)));

  return {
    async verify(bearer) {
      if (!bearer) return { ok: false, reason: "missing_token" };
      try {
        const { payload } = await jwtVerify(bearer, keys, {
          audience: opts.audience,
          issuer: mode === "project_number" ? CHAT_ISSUER : GOOGLE_OIDC_ISSUERS,
          algorithms: ["RS256"],
        });
        // Endpoint-URL tokens are generic Google ID tokens: only accept the
        // ones minted for the Chat service itself.
        if (
          mode === "endpoint_url" &&
          (payload.email !== CHAT_ISSUER || payload.email_verified !== true)
        ) {
          return { ok: false, reason: "wrong_sender" };
        }
        return { ok: true, payload };
      } catch {
        return { ok: false, reason: "invalid_token" };
      }
    },
  };
}
