import type { FastifyPluginAsync } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { users, engagementScores } from "@revualy/db";
import { parseBody, idParamSchema, updateUserSchema, listUsersQuerySchema, createUserSchema, bulkCreateUsersSchema } from "../../lib/validation.js";
import { requireAuth, requireRole } from "../../lib/rbac.js";
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

  // POST /users — Create a single user (admin only)
  app.post("/", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { db, userId } = request.tenant;
    const body = parseBody(createUserSchema, request.body);

    // Only super_admin can create admin or super_admin users
    if (body.role === "admin" || body.role === "super_admin") {
      const [caller] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId!));
      if (!caller || caller.role !== "super_admin") {
        return reply.code(403).send({ error: "Only super_admin can create admin or super_admin users" });
      }
    }

    const [created] = await db
      .insert(users)
      .values({
        email: body.email,
        name: body.name,
        role: body.role ?? "employee",
        teamId: body.teamId ?? null,
        managerId: body.managerId ?? null,
        timezone: body.timezone ?? "UTC",
      })
      .returning();

    return reply.code(201).send(created);
  });

  // POST /users/bulk — Bulk user import (admin only)
  app.post("/bulk", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { db, userId } = request.tenant;
    const body = parseBody(bulkCreateUsersSchema, request.body);

    // Only super_admin can create admin or super_admin users in bulk
    const hasElevatedRole = body.users.some((u) => u.role === "admin" || u.role === "super_admin");
    if (hasElevatedRole) {
      const [caller] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId!));
      if (!caller || caller.role !== "super_admin") {
        return reply.code(403).send({ error: "Only super_admin can create admin or super_admin users" });
      }
    }

    const rows = body.users.map((u) => ({
      email: u.email,
      name: u.name,
      role: u.role ?? "employee",
      teamId: u.teamId ?? null,
      managerId: u.managerId ?? null,
      timezone: u.timezone ?? "UTC",
    }));

    const created = await db
      .insert(users)
      .values(rows)
      .onConflictDoNothing({ target: users.email })
      .returning();

    return reply.code(201).send({
      created: created.length,
      skipped: body.users.length - created.length,
      users: created,
    });
  });

  // GET /users/:id — User profile (scoped by caller role)
  app.get("/:id", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db, userId } = request.tenant;

    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) return reply.code(404).send({ error: "User not found" });

    const isSelf = id === userId;

    // Self always gets full profile
    if (isSelf) return reply.send(user);

    // Look up caller role for access control
    const [caller] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId));

    if (!caller) return reply.code(401).send({ error: "User not found" });

    // Admins and super_admins see full profile
    if (caller.role === "admin" || caller.role === "super_admin") {
      return reply.send(user);
    }

    // Managers see full profile for their direct reports
    if (caller.role === "manager" && user.managerId === userId) {
      return reply.send(user);
    }

    // Everyone else gets a scoped view (no preferences, no managerId details)
    return reply.send({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      teamId: user.teamId,
      timezone: user.timezone,
      isActive: user.isActive,
    });
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

    const isSuperAdmin = caller.role === "super_admin";
    const isAdmin = caller.role === "admin" || isSuperAdmin;
    const isSelf = id === userId;

    // Non-admins can only edit their own profile
    if (!isAdmin && !isSelf) {
      return reply.code(403).send({ error: "You can only edit your own profile" });
    }

    // Only admins can change role or teamId
    if (!isAdmin && (body.role !== undefined || body.teamId !== undefined)) {
      return reply.code(403).send({ error: "Only admins can change role or team" });
    }

    // Only super_admin can assign or remove admin/super_admin roles
    if (body.role !== undefined && (body.role === "admin" || body.role === "super_admin") && !isSuperAdmin) {
      return reply.code(403).send({ error: "Only super_admin can assign admin or super_admin roles" });
    }

    // Only super_admin can demote an admin or super_admin
    if (body.role !== undefined && isAdmin && !isSuperAdmin) {
      const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, id));
      if (target && (target.role === "admin" || target.role === "super_admin")) {
        return reply.code(403).send({ error: "Only super_admin can change the role of an admin or super_admin" });
      }
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

    // Sync changed auth-relevant fields to authUsers table
    if (body.role !== undefined || body.teamId !== undefined) {
      const syncUpdates: { role?: string; teamId?: string | null } = {};
      if (body.role !== undefined) syncUpdates.role = body.role;
      if (body.teamId !== undefined) syncUpdates.teamId = body.teamId;
      await syncAuthUser(db, id, syncUpdates).catch((err) =>
        request.log.error({ err }, "Failed to sync auth user"),
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

    // Sync onboarding status to auth session store
    await syncAuthUser(db, userId, { onboardingCompleted: true }).catch((err) =>
      request.log.error({ err }, "Failed to sync onboarding status"),
    );

    return reply.send({ success: true });
  });

  // POST /users/:id/deactivate — Deactivate a user (admin only)
  app.post("/:id/deactivate", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db, userId } = request.tenant;

    // Only super_admin can deactivate admin/super_admin users
    const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, id));
    if (!target) return reply.code(404).send({ error: "User not found" });

    if (target.role === "admin" || target.role === "super_admin") {
      const [caller] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId!));
      if (!caller || caller.role !== "super_admin") {
        return reply.code(403).send({ error: "Only super_admin can deactivate admin or super_admin users" });
      }
    }

    const [updated] = await db
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    return reply.send(updated);
  });

  // POST /users/:id/reactivate — Reactivate a user (admin only)
  app.post("/:id/reactivate", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db, userId } = request.tenant;

    // Only super_admin can reactivate admin/super_admin users
    const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, id));
    if (!target) return reply.code(404).send({ error: "User not found" });

    if (target.role === "admin" || target.role === "super_admin") {
      const [caller] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId!));
      if (!caller || caller.role !== "super_admin") {
        return reply.code(403).send({ error: "Only super_admin can reactivate admin or super_admin users" });
      }
    }

    const [updated] = await db
      .update(users)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    return reply.send(updated);
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
