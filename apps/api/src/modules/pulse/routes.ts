import type { FastifyPluginAsync } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import {
  pulseCheckTriggers,
  pulseCheckConfig,
  users,
} from "@revualy/db";
import { requireAuth, requireRole, getAuthenticatedUserId } from "../../lib/rbac.js";
import {
  parseBody,
  updatePulseCheckConfigSchema,
  userIdParamSchema,
} from "../../lib/validation.js";

export const pulseRoutes: FastifyPluginAsync = async (app) => {
  // GET /triggers — List all pulse check triggers (admin only)
  app.get(
    "/triggers",
    { preHandler: requireRole("admin") },
    async (request, reply) => {
      const { db } = request.tenant;

      const rows = await db
        .select({
          trigger: pulseCheckTriggers,
          userName: users.name,
          userEmail: users.email,
        })
        .from(pulseCheckTriggers)
        .leftJoin(users, eq(pulseCheckTriggers.sourceRef, users.id))
        .orderBy(desc(pulseCheckTriggers.createdAt))
        .limit(200);

      const data = rows.map((r) => ({
        ...r.trigger,
        userName: r.userName,
        userEmail: r.userEmail,
      }));

      return reply.send({ data });
    },
  );

  // GET /triggers/:userId — Get triggers for a specific user (admin or manager of user)
  app.get(
    "/triggers/:userId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { userId } = parseBody(userIdParamSchema, request.params);
      const { db } = request.tenant;
      const callerId = getAuthenticatedUserId(request);

      // Authorization: admin or manager of target user
      if (callerId !== userId) {
        const [caller] = await db
          .select({ role: users.role })
          .from(users)
          .where(eq(users.id, callerId));

        if (!caller) {
          return reply.code(401).send({ error: "User not found" });
        }

        if (caller.role !== "admin") {
          // Check if caller is the manager of the target user
          const [target] = await db
            .select({ managerId: users.managerId })
            .from(users)
            .where(eq(users.id, userId));

          if (!target || target.managerId !== callerId) {
            return reply.code(403).send({ error: "Insufficient permissions" });
          }
        }
      }

      const rows = await db
        .select()
        .from(pulseCheckTriggers)
        .where(
          and(
            eq(pulseCheckTriggers.sourceRef, userId),
            eq(pulseCheckTriggers.sourceType, "sentiment_decline"),
          ),
        )
        .orderBy(desc(pulseCheckTriggers.createdAt))
        .limit(50);

      return reply.send({ data: rows });
    },
  );

  // GET /config — Get current pulse check config (admin only)
  app.get(
    "/config",
    { preHandler: requireRole("admin") },
    async (request, reply) => {
      const { db } = request.tenant;

      const [config] = await db.select().from(pulseCheckConfig).limit(1);

      if (!config) {
        return reply.send({
          negativeSentimentThreshold: 2,
          windowDays: 7,
          cooldownDays: 14,
          isEnabled: true,
          updatedAt: null,
        });
      }

      return reply.send(config);
    },
  );

  // PATCH /config — Update pulse check config (admin only)
  app.patch(
    "/config",
    { preHandler: requireRole("admin") },
    async (request, reply) => {
      const { db } = request.tenant;
      const body = parseBody(updatePulseCheckConfigSchema, request.body);

      // Check if config row exists
      const [existing] = await db.select().from(pulseCheckConfig).limit(1);

      if (!existing) {
        // Create the config row with provided values + defaults
        const [created] = await db
          .insert(pulseCheckConfig)
          .values({
            negativeSentimentThreshold: body.negativeSentimentThreshold ?? 2,
            windowDays: body.windowDays ?? 7,
            cooldownDays: body.cooldownDays ?? 14,
            isEnabled: body.isEnabled ?? true,
          })
          .returning();

        return reply.send(created);
      }

      // Update existing config
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (body.negativeSentimentThreshold !== undefined)
        updates.negativeSentimentThreshold = body.negativeSentimentThreshold;
      if (body.windowDays !== undefined) updates.windowDays = body.windowDays;
      if (body.cooldownDays !== undefined)
        updates.cooldownDays = body.cooldownDays;
      if (body.isEnabled !== undefined) updates.isEnabled = body.isEnabled;

      const [updated] = await db
        .update(pulseCheckConfig)
        .set(updates)
        .where(eq(pulseCheckConfig.id, existing.id))
        .returning();

      return reply.send(updated);
    },
  );
};
