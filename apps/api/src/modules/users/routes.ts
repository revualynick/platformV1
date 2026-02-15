import type { FastifyPluginAsync } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { users, engagementScores } from "@revualy/db";
import { parseBody, idParamSchema, updateUserSchema } from "../../lib/validation.js";
import { requireAuth } from "../../lib/rbac.js";

export const usersRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  // GET /users — List active users, optionally filtered by teamId or managerId
  app.get("/", async (request, reply) => {
    const { db } = request.tenant;
    const { teamId, managerId } = request.query as { teamId?: string; managerId?: string };

    const conditions = [eq(users.isActive, true)];
    if (teamId) conditions.push(eq(users.teamId, teamId));
    if (managerId) conditions.push(eq(users.managerId, managerId));

    const result = await db.select().from(users).where(and(...conditions));
    return reply.send({ data: result });
  });

  // GET /users/:id — User profile
  app.get("/:id", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;

    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) return reply.code(404).send({ error: "User not found" });

    return reply.send(user);
  });

  // PATCH /users/:id — Update user profile/preferences
  app.patch("/:id", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const body = parseBody(updateUserSchema, request.body);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.role !== undefined) updates.role = body.role;
    if (body.teamId !== undefined) updates.teamId = body.teamId;
    if (body.timezone !== undefined) updates.timezone = body.timezone;
    if (body.preferences !== undefined) updates.preferences = body.preferences;

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();

    if (!updated) return reply.code(404).send({ error: "User not found" });
    return reply.send(updated);
  });

  // GET /users/:id/engagement — Engagement scores for user
  app.get("/:id/engagement", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;

    const scores = await db
      .select()
      .from(engagementScores)
      .where(eq(engagementScores.userId, id))
      .orderBy(engagementScores.weekStarting);

    return reply.send({ data: scores, userId: id });
  });
};
