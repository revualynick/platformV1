import type { FastifyPluginAsync } from "fastify";
import { eq, or, and } from "drizzle-orm";
import { users, teams, userRelationships } from "@revualy/db";
import {
  parseBody,
  idParamSchema,
  createRelationshipSchema,
  updateRelationshipSchema,
  updateManagerSchema,
} from "../../lib/validation.js";
import { requireAuth } from "../../lib/rbac.js";

export const relationshipsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);
  // ── GET /users/:id/relationships ─────────────────────
  // Returns the full relationship graph centered on a user:
  // - All people connected via threads or reporting lines
  // - Edges include both "reports_to" (from users.managerId) and "thread" relationships
  app.get("/users/:id/relationships", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;

    // Fetch the user and their connections
    const allUsers = await db.select().from(users).where(eq(users.isActive, true));
    const allTeams = await db.select().from(teams);
    const allRelationships = await db
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
      );

    // Build connected user IDs (the user + anyone linked via thread or reporting)
    const connectedIds = new Set<string>([id]);
    allRelationships.forEach((r) => {
      connectedIds.add(r.fromUserId);
      connectedIds.add(r.toUserId);
    });
    // Also include direct reports and manager
    allUsers.forEach((u) => {
      if (u.managerId === id) connectedIds.add(u.id);
      if (u.id === id && u.managerId) connectedIds.add(u.managerId);
    });

    const teamMap = new Map(allTeams.map((t) => [t.id, t.name]));

    const nodes = allUsers
      .filter((u) => connectedIds.has(u.id))
      .map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        team: u.teamId ? teamMap.get(u.teamId) ?? null : null,
        managerId: u.managerId,
      }));

    // Reporting edges: parent→child for each user with managerId
    const reportingEdges = allUsers
      .filter((u) => connectedIds.has(u.id) && u.managerId && connectedIds.has(u.managerId))
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

  // ── GET /relationships ───────────────────────────────
  // All relationships in the org (admin view for the org chart)
  app.get("/relationships", async (request, reply) => {
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
  // Create a new thread (user relationship)
  app.post("/relationships", async (request, reply) => {
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
  // Update a thread's properties (label, tags, strength, etc.)
  app.patch("/relationships/:id", async (request, reply) => {
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
  // Soft-delete a thread (set isActive = false)
  app.delete("/relationships/:id", async (request, reply) => {
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
  // Update reporting line (change who a person reports to)
  app.patch("/users/:id/manager", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const body = parseBody(updateManagerSchema, request.body);

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
