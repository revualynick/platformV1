import crypto from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { eq, and } from "drizzle-orm";
import { calendarTokens } from "@revualy/db";
import { encrypt } from "@revualy/shared/server";
import { requireAuth, getAuthenticatedUserId } from "../../lib/rbac.js";
import {
  getAuthUrl,
  exchangeCode,
  GOOGLE_DRIVE_SCOPE,
} from "../../lib/google-calendar.js";
import { signOAuthState, verifyOAuthState } from "../../lib/oauth-state.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3001";
const STATE_SECRET = process.env.INTERNAL_API_SECRET ?? crypto.randomUUID();

const DEFAULT_RETURN_TO = "/settings/integrations";

export const integrationsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  // GET /integrations/google/authorize — Redirect to Google OAuth
  app.get("/google/authorize", async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const { returnTo } = request.query as { returnTo?: string };
    const state = signOAuthState(STATE_SECRET, userId, returnTo ?? DEFAULT_RETURN_TO);
    const url = getAuthUrl(state);
    return reply.redirect(url);
  });

  // GET /integrations/google/callback — Handle OAuth callback
  app.get("/google/callback", async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };

    if (!code || !state) {
      return reply.redirect(`${APP_URL}${DEFAULT_RETURN_TO}?error=missing_params`);
    }

    // The state must have been issued to this same signed-in user and not
    // be expired; otherwise a forwarded callback link could connect this
    // account to someone else's Google account.
    const userId = getAuthenticatedUserId(request);
    const stateResult = verifyOAuthState(STATE_SECRET, state, userId);
    if (!stateResult.valid) {
      request.log.warn({ reason: stateResult.reason }, "Rejected Google OAuth state");
      return reply.redirect(`${APP_URL}${DEFAULT_RETURN_TO}?error=invalid_state`);
    }
    const returnTo = stateResult.returnTo || DEFAULT_RETURN_TO;
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

  app.get("/outlook/callback", async (request, reply) => {
    return reply.code(501).send({ error: "Not implemented" });
  });
};
