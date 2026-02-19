import type { FastifyPluginAsync } from "fastify";
import { eq, or, and, inArray } from "drizzle-orm";
import { users, teams, userRelationships } from "@revualy/db";
import {
  parseBody,
  idParamSchema,
  createRelationshipSchema,
  updateRelationshipSchema,
  updateManagerSchema,
} from "../../lib/validation.js";
import { requireAuth, requireRole, getAuthenticatedUserId } from "../../lib/rbac.js";

export const relationshipsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);
  // ── GET /users/:id/relationships ─────────────────────
  // Returns the full relationship graph centered on a user:
  // - All people connected via threads or reporting lines
  // - Edges include both "reports_to" (from users.managerId) and "thread" relationships
  app.get("/users/:id/relationships", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const callerId = getAuthenticatedUserId(request);

    // RBAC: employees can only view their own graph
    if (id !== callerId) {
      const [caller] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, callerId));

      if (!caller || caller.role === "employee") {
        return reply.code(403).send({ error: "You can only view your own relationships" });
      }

      // Managers can view their direct reports' graphs
      if (caller.role === "manager") {
        const [subject] = await db
          .select({ managerId: users.managerId })
          .from(users)
          .where(eq(users.id, id));
        if (!subject || subject.managerId !== callerId) {
          return reply.code(403).send({ error: "You can only view relationships for your direct reports" });
        }
      }
      // Admins pass through
    }

    // 1. Fetch relationships + direct reports + manager in parallel (not all users)
    const [relationships, directReports, [centerUser]] = await Promise.all([
      db
        .select()
        .from(userRelationships)
        .where(
          and(
            eq(userRelationships.isActive, true),
            or(
              eq(userRelationships.fromUserId, id),
              eq(userRelationships.toUserId, id),
            ),
          ),
        ),
      db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.managerId, id), eq(users.isActive, true))),
      db
        .select({ id: users.id, managerId: users.managerId })
        .from(users)
        .where(eq(users.id, id)),
    ]);

    // 2. Build connected user IDs from relationships + reporting lines
    const connectedIds = new Set<string>([id]);
    relationships.forEach((r) => {
      connectedIds.add(r.fromUserId);
      connectedIds.add(r.toUserId);
    });
    directReports.forEach((u) => connectedIds.add(u.id));
    if (centerUser?.managerId) connectedIds.add(centerUser.managerId);

    // 3. Batch fetch only connected users
    const connectedIdArray = [...connectedIds];
    const connectedUsers = connectedIdArray.length > 0
      ? await db
          .select({ id: users.id, name: users.name, role: users.role, teamId: users.teamId, managerId: users.managerId })
          .from(users)
          .where(inArray(users.id, connectedIdArray))
      : [];

    // 4. Batch fetch only referenced teams
    const teamIds = [...new Set(connectedUsers.map((u) => u.teamId).filter((t): t is string => t !== null))];
    const referencedTeams = teamIds.length > 0
      ? await db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, teamIds))
      : [];
    const teamMap = new Map(referencedTeams.map((t) => [t.id, t.name]));

    const nodes = connectedUsers.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      team: u.teamId ? teamMap.get(u.teamId) ?? null : null,
      managerId: u.managerId,
    }));

    // Reporting edges: parent->child for each user with managerId within the subgraph
    const reportingEdges = connectedUsers
      .filter((u) => u.managerId && connectedIds.has(u.managerId))
      .map((u) => ({
        id: `report-${u.managerId}-${u.id}`,
        from: u.managerId!,
        to: u.id,
        type: "reports_to" as const,
        label: "Reports to",
        tags: [] as string[],
        strength: 1,
        source: "manual" as const,
      }));

    // Thread edges from user_relationships
    const threadEdges = relationships.map((r) => ({
      id: r.id,
      from: r.fromUserId,
      to: r.toUserId,
      type: "thread" as const,
      label: r.label,
      tags: r.tags,
      strength: r.strength,
      source: r.source as "manual" | "calendar" | "chat",
    }));

    return reply.send({
      nodes,
      edges: [...reportingEdges, ...threadEdges],
    });
  });

  // ── GET /relationships ───────────────────────────────
  // All relationships in the org (admin only)
  app.get("/relationships", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { db } = request.tenant;

    const allUsers = await db.select().from(users).where(eq(users.isActive, true));
    const allTeams = await db.select().from(teams);
    const allRelationships = await db
      .select()
      .from(userRelationships)
      .where(eq(userRelationships.isActive, true));

    const teamMap = new Map(allTeams.map((t) => [t.id, t.name]));

    const nodes = allUsers.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      team: u.teamId ? teamMap.get(u.teamId) ?? null : null,
      managerId: u.managerId,
    }));

    const reportingEdges = allUsers
      .filter((u) => u.managerId)
      .map((u) => ({
        id: `report-${u.managerId}-${u.id}`,
        from: u.managerId!,
        to: u.id,
        type: "reports_to" as const,
        label: "Reports to",
        tags: [] as string[],
        strength: 1,
        source: "manual" as const,
      }));

    const threadEdges = allRelationships.map((r) => ({
      id: r.id,
      from: r.fromUserId,
      to: r.toUserId,
      type: "thread" as const,
      label: r.label,
      tags: r.tags,
      strength: r.strength,
      source: r.source as "manual" | "calendar" | "chat",
    }));

    return reply.send({
      nodes,
      edges: [...reportingEdges, ...threadEdges],
    });
  });

  // ── POST /relationships ──────────────────────────────
  // Create a new thread (user relationship) — admin only
  app.post("/relationships", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { db } = request.tenant;
    const body = parseBody(createRelationshipSchema, request.body);

    const [created] = await db
      .insert(userRelationships)
      .values({
        fromUserId: body.fromUserId,
        toUserId: body.toUserId,
        label: body.label ?? "",
        tags: body.tags ?? [],
        strength: body.strength ?? 0.5,
        source: body.source ?? "manual",
        notes: body.notes ?? null,
      })
      .returning();

    return reply.code(201).send(created);
  });

  // ── PATCH /relationships/:id ─────────────────────────
  // Update a thread's properties (label, tags, strength, etc.) — admin only
  app.patch("/relationships/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const body = parseBody(updateRelationshipSchema, request.body);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.label !== undefined) updates.label = body.label;
    if (body.tags !== undefined) updates.tags = body.tags;
    if (body.strength !== undefined) updates.strength = body.strength;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    const [updated] = await db
      .update(userRelationships)
      .set(updates)
      .where(eq(userRelationships.id, id))
      .returning();

    if (!updated) {
      return reply.code(404).send({ error: "Relationship not found" });
    }

    return reply.send(updated);
  });

  // ── DELETE /relationships/:id ────────────────────────
  // Soft-delete a thread (set isActive = false) — admin only
  app.delete("/relationships/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;

    const [updated] = await db
      .update(userRelationships)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(userRelationships.id, id))
      .returning();

    if (!updated) {
      return reply.code(404).send({ error: "Relationship not found" });
    }

    return reply.send({ id, deleted: true });
  });

  // ── PATCH /users/:id/manager ─────────────────────────
  // Update reporting line (change who a person reports to) — admin only
  app.patch("/users/:id/manager", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const body = parseBody(updateManagerSchema, request.body);

    // Prevent circular reporting chains: walk up from the new manager to check
    // if we'd reach the user being updated (which would create a cycle).
    if (body.managerId) {
      if (body.managerId === id) {
        return reply.code(400).send({ error: "A user cannot be their own manager" });
      }
      const allUsers = await db
        .select({ id: users.id, managerId: users.managerId })
        .from(users)
        .where(eq(users.isActive, true));
      const parentOf = new Map(allUsers.map((u) => [u.id, u.managerId]));
      // Walk up from the proposed manager; if we hit `id`, it's a cycle
      let current: string | null = body.managerId;
      const visited = new Set<string>();
      while (current) {
        if (current === id) {
          return reply.code(400).send({ error: "This assignment would create a circular reporting chain" });
        }
        if (visited.has(current)) break; // existing cycle in data — stop walking
        visited.add(current);
        current = parentOf.get(current) ?? null;
      }
    }

    const [updated] = await db
      .update(users)
      .set({ managerId: body.managerId, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    if (!updated) {
      return reply.code(404).send({ error: "User not found" });
    }

    return reply.send({ id, managerId: updated.managerId });
  });
};
