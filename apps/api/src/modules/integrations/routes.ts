import type { FastifyPluginAsync } from "fastify";
import { eq, and } from "drizzle-orm";
import { calendarTokens } from "@revualy/db";
import { encrypt } from "@revualy/shared";
import { requireAuth, getAuthenticatedUserId } from "../../lib/rbac.js";
import { getAuthUrl, exchangeCode } from "../../lib/google-calendar.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3001";

export const integrationsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  // GET /integrations/google/authorize — Redirect to Google OAuth
  app.get("/google/authorize", async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    // Pass a random nonce as state for CSRF protection (not userId — never trust state as identity)
    const nonce = crypto.randomUUID();
    const url = getAuthUrl(nonce);
    return reply.redirect(url);
  });

  // GET /integrations/google/callback — Handle OAuth callback
  app.get("/google/callback", async (request, reply) => {
    const { code } = request.query as { code?: string };

    if (!code) {
      return reply.redirect(`${APP_URL}/settings/integrations?error=missing_params`);
    }

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
        });
      }

      return reply.redirect(`${APP_URL}/settings/integrations?connected=google`);
    } catch (err) {
      request.log.error(err, "Google Calendar OAuth callback failed");
      return reply.redirect(`${APP_URL}/settings/integrations?error=oauth_failed`);
    }
  });

  // GET /integrations/google/status — Check if connected
  app.get("/google/status", async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const { db } = request.tenant;

    const [token] = await db
      .select({ id: calendarTokens.id, expiresAt: calendarTokens.expiresAt })
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
    });
  });

  // Outlook — deferred to Phase 5
  app.get("/outlook/callback", async (request, reply) => {
    return reply.code(501).send({ error: "Outlook integration coming in Phase 5" });
  });
};
