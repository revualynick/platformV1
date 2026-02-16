import type { FastifyPluginAsync } from "fastify";
import { eq, and } from "drizzle-orm";
import { notificationPreferences } from "@revualy/db";
import { requireAuth } from "../../lib/rbac.js";
import { parseBody, updateNotificationPrefSchema } from "../../lib/validation.js";

const NOTIFICATION_TYPES = [
  "weekly_digest",
  "flag_alert",
  "nudge",
  "leaderboard_update",
] as const;

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  // GET /notifications/preferences — List all preferences for current user
  app.get("/preferences", async (request, reply) => {
    const { db } = request.tenant;
    const userId = request.tenant.userId!;

    const prefs = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));

    // Return all types, with defaults for any that don't have a row yet
    const prefMap = new Map(prefs.map((p) => [p.type, p]));
    const result = NOTIFICATION_TYPES.map((type) => {
      const existing = prefMap.get(type);
      return existing ?? {
        id: null,
        userId,
        type,
        enabled: true,
        channel: "email",
        createdAt: null,
        updatedAt: null,
      };
    });

    return reply.send({ data: result });
  });

  // PATCH /notifications/preferences — Upsert a single preference
  app.patch("/preferences", async (request, reply) => {
    const { db } = request.tenant;
    const userId = request.tenant.userId!;
    const body = parseBody(updateNotificationPrefSchema, request.body);

    // Check if preference exists
    const [existing] = await db
      .select()
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, userId),
          eq(notificationPreferences.type, body.type),
        ),
      );

    if (existing) {
      const [updated] = await db
        .update(notificationPreferences)
        .set({
          enabled: body.enabled,
          channel: body.channel ?? existing.channel,
          updatedAt: new Date(),
        })
        .where(eq(notificationPreferences.id, existing.id))
        .returning();
      return reply.send(updated);
    }

    const [created] = await db
      .insert(notificationPreferences)
      .values({
        userId,
        type: body.type,
        enabled: body.enabled,
        channel: body.channel ?? "email",
      })
      .returning();

    return reply.code(201).send(created);
  });
};
