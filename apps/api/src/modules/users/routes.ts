import type { FastifyPluginAsync } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { users, engagementScores } from "@revualy/db";
import { parseBody, idParamSchema, updateUserSchema, listUsersQuerySchema } from "../../lib/validation.js";
import { requireAuth } from "../../lib/rbac.js";
import { syncAuthUser } from "../../lib/auth-sync.js";

export const usersRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  // GET /users — List active users, optionally filtered by teamId or managerId
  app.get("/", async (request, reply) => {
    const { db } = request.tenant;
    const query = parseBody(listUsersQuerySchema, request.query);

    const conditions = [eq(users.isActive, true)];
    if (query.teamId) conditions.push(eq(users.teamId, query.teamId));
    if (query.managerId) conditions.push(eq(users.managerId, query.managerId));

    const limit = Math.min(parseInt(query.limit ?? "200", 10) || 200, 500);
    const result = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        teamId: users.teamId,
        managerId: users.managerId,
        timezone: users.timezone,
        isActive: users.isActive,
      })
      .from(users)
      .where(and(...conditions))
      .limit(limit);
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
  // - Users can edit their own profile (name, timezone, preferences)
  // - Only admins can change role, teamId, or edit other users
  app.patch("/:id", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db, userId } = request.tenant;
    const body = parseBody(updateUserSchema, request.body);

    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    // Look up the caller's role from the DB (not headers) to prevent escalation
    const [caller] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId));

    if (!caller) {
      return reply.code(401).send({ error: "User not found" });
    }

    const isAdmin = caller.role === "admin";
    const isSelf = id === userId;

    // Non-admins can only edit their own profile
    if (!isAdmin && !isSelf) {
      return reply.code(403).send({ error: "You can only edit your own profile" });
    }

    // Only admins can change role or teamId
    if (!isAdmin && (body.role !== undefined || body.teamId !== undefined)) {
      return reply.code(403).send({ error: "Only admins can change role or team" });
    }

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

    // Sync changed auth-relevant fields to control plane session store
    if (body.role !== undefined || body.teamId !== undefined) {
      const syncUpdates: { role?: string; teamId?: string | null } = {};
      if (body.role !== undefined) syncUpdates.role = body.role;
      if (body.teamId !== undefined) syncUpdates.teamId = body.teamId;
      await syncAuthUser(id, syncUpdates).catch((err) =>
        request.log.error({ err }, "Failed to sync auth user to control plane"),
      );
    }

    return reply.send(updated);
  });

  // PATCH /users/me/onboarding — Mark onboarding as complete
  app.patch("/me/onboarding", async (request, reply) => {
    const { db, userId } = request.tenant;

    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    const [updated] = await db
      .update(users)
      .set({ onboardingCompleted: true, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();

    if (!updated) return reply.code(404).send({ error: "User not found" });

    // Sync onboarding status to control plane session store
    await syncAuthUser(userId, { onboardingCompleted: true }).catch((err) =>
      request.log.error({ err }, "Failed to sync onboarding status to control plane"),
    );

    return reply.send({ success: true });
  });

  // GET /users/:id/engagement — Engagement scores for user
  app.get("/:id/engagement", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db, userId } = request.tenant;

    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    // RBAC: employees see own engagement only, managers see their direct reports', admins see all
    if (id !== userId) {
      const [caller] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId));

      if (!caller || caller.role === "employee") {
        return reply.code(403).send({ error: "You can only view your own engagement scores" });
      }

      if (caller.role === "manager") {
        const [subject] = await db
          .select({ managerId: users.managerId })
          .from(users)
          .where(eq(users.id, id));

        if (!subject || subject.managerId !== userId) {
          return reply.code(403).send({ error: "You can only view engagement scores for your direct reports" });
        }
      }
      // Admins pass through
    }

    const scores = await db
      .select()
      .from(engagementScores)
      .where(eq(engagementScores.userId, id))
      .orderBy(engagementScores.weekStarting)
      .limit(52); // Max 1 year of weekly scores

    return reply.send({ data: scores, userId: id });
  });
};
