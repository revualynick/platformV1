import crypto from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { eq, and } from "drizzle-orm";
import { calendarTokens } from "@revualy/db";
import { encrypt } from "@revualy/shared";
import { requireAuth, getAuthenticatedUserId } from "../../lib/rbac.js";
import {
  getAuthUrl,
  exchangeCode,
  GOOGLE_DRIVE_SCOPE,
} from "../../lib/google-calendar.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3001";
const STATE_SECRET = process.env.INTERNAL_API_SECRET ?? crypto.randomUUID();

// State format: nonce.returnToB64.sig — returnTo rides along signed so
// the callback can send the user back to whichever page started the flow.
function signState(nonce: string, returnTo: string): string {
  const returnToB64 = Buffer.from(returnTo).toString("base64url");
  const sig = crypto
    .createHmac("sha256", STATE_SECRET)
    .update(`${nonce}.${returnToB64}`)
    .digest("hex");
  return `${nonce}.${returnToB64}.${sig}`;
}

function verifyState(state: string): { valid: boolean; returnTo: string } {
  const parts = state.split(".");
  if (parts.length !== 3) return { valid: false, returnTo: "" };
  const [nonce, returnToB64, sig] = parts;
  const expected = crypto
    .createHmac("sha256", STATE_SECRET)
    .update(`${nonce}.${returnToB64}`)
    .digest("hex");
  const valid =
    sig.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!valid) return { valid: false, returnTo: "" };
  const returnTo = Buffer.from(returnToB64, "base64url").toString();
  // Only same-app relative paths — never an open redirect
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "";
  return { valid: true, returnTo: safeReturnTo };
}

const DEFAULT_RETURN_TO = "/settings/integrations";

export const integrationsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  // GET /integrations/google/authorize — Redirect to Google OAuth
  app.get("/google/authorize", async (request, reply) => {
    getAuthenticatedUserId(request);
    const { returnTo } = request.query as { returnTo?: string };
    const nonce = crypto.randomUUID();
    const state = signState(nonce, returnTo ?? DEFAULT_RETURN_TO);
    const url = getAuthUrl(state);
    return reply.redirect(url);
  });

  // GET /integrations/google/callback — Handle OAuth callback
  app.get("/google/callback", async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };

    if (!code || !state) {
      return reply.redirect(`${APP_URL}${DEFAULT_RETURN_TO}?error=missing_params`);
    }

    const stateResult = verifyState(state);
    if (!stateResult.valid) {
      return reply.redirect(`${APP_URL}${DEFAULT_RETURN_TO}?error=invalid_state`);
    }
    const returnTo = stateResult.returnTo || DEFAULT_RETURN_TO;

    // Use authenticated userId from session — never trust OAuth state as identity
    const userId = getAuthenticatedUserId(request);
    const { db } = request.tenant;

    try {
      const tokens = await exchangeCode(code);

      // Encrypt tokens (ENCRYPTION_KEY must be set — encrypt() throws if missing)
      const storeAccessToken = encrypt(tokens.accessToken);
      const storeRefreshToken = encrypt(tokens.refreshToken);

      // Upsert token (unique on userId + provider)
      const [existing] = await db
        .select()
        .from(calendarTokens)
        .where(
          and(
            eq(calendarTokens.userId, userId),
            eq(calendarTokens.provider, "google"),
          ),
        );

      if (existing) {
        await db
          .update(calendarTokens)
          .set({
            accessToken: storeAccessToken,
            refreshToken: storeRefreshToken,
            expiresAt: tokens.expiresAt,
            scopes: tokens.scopes,
            updatedAt: new Date(),
          })
          .where(eq(calendarTokens.id, existing.id));
      } else {
        await db.insert(calendarTokens).values({
          userId,
          provider: "google",
          accessToken: storeAccessToken,
          refreshToken: storeRefreshToken,
          expiresAt: tokens.expiresAt,
          scopes: tokens.scopes,
        });
      }

      return reply.redirect(`${APP_URL}${returnTo}?connected=google`);
    } catch (err) {
      request.log.error(err, "Google Calendar OAuth callback failed");
      return reply.redirect(`${APP_URL}${returnTo}?error=oauth_failed`);
    }
  });

  // GET /integrations/google/status — Check if connected
  app.get("/google/status", async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const { db } = request.tenant;

    const [token] = await db
      .select({
        id: calendarTokens.id,
        expiresAt: calendarTokens.expiresAt,
        scopes: calendarTokens.scopes,
      })
      .from(calendarTokens)
      .where(
        and(
          eq(calendarTokens.userId, userId),
          eq(calendarTokens.provider, "google"),
        ),
      );

    return reply.send({
      connected: !!token,
      expiresAt: token?.expiresAt ?? null,
      // Tokens issued before scope tracking have scopes = "" and report
      // false — the UI prompts those users to reconnect.
      hasDriveScope: !!token && token.scopes.includes(GOOGLE_DRIVE_SCOPE),
    });
  });

  // Outlook — deferred to Phase 5
  app.get("/outlook/callback", async (request, reply) => {
    return reply.code(501).send({ error: "Outlook integration coming in Phase 5" });
  });
};
