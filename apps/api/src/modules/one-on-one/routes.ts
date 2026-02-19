import type { FastifyPluginAsync } from "fastify";
import { eq, and, or, asc, desc } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import {
  users,
  oneOnOneSessions,
  oneOnOneActionItems,
  oneOnOneAgendaItems,
} from "@revualy/db";
import { requireAuth, requireRole, getAuthenticatedUserId } from "../../lib/rbac.js";
import {
  parseBody,
  idParamSchema,
  createSessionSchema,
  updateSessionSchema,
  sessionQuerySchema,
  createActionItemSchema,
  updateActionItemSchema,
  createAgendaItemSchema,
  updateAgendaItemSchema,
} from "../../lib/validation.js";
import { generateAgenda } from "../../lib/agenda-generator.js";
import { generateWsToken } from "../../lib/ws-auth.js";

/**
 * Verify user is the manager or employee for a session.
 */
async function verifySessionAccess(
  db: TenantDb,
  sessionId: string,
  userId: string,
) {
  const [session] = await db
    .select()
    .from(oneOnOneSessions)
    .where(eq(oneOnOneSessions.id, sessionId));

  if (!session) return null;
  if (session.managerId !== userId && session.employeeId !== userId) return null;
  return session;
}

/**
 * Resolve pair: verify the current user is the manager of employeeId.
 */
async function resolveOneOnOnePair(
  db: TenantDb,
  userId: string,
  employeeId: string,
): Promise<{ managerId: string; employeeId: string } | null> {
  const [employee] = await db
    .select({ id: users.id, managerId: users.managerId })
    .from(users)
    .where(eq(users.id, employeeId));

  if (!employee) return null;

  // Current user is the employee's manager
  if (employee.managerId === userId) {
    return { managerId: userId, employeeId };
  }

  // Current user is the employee, check if userId is the manager
  const [currentUser] = await db
    .select({ id: users.id, managerId: users.managerId })
    .from(users)
    .where(eq(users.id, userId));

  if (currentUser && currentUser.managerId === employeeId) {
    return { managerId: employeeId, employeeId: userId };
  }

  return null;
}

const itemIdParamSchema = idParamSchema;

export const oneOnOneRoutes: FastifyPluginAsync = async (app) => {
  // POST / — Create/schedule a session (manager only)
  app.post("/", { preHandler: requireRole("manager") }, async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const body = parseBody(createSessionSchema, request.body);

    // Verify this manager manages the employee
    const [employee] = await db
      .select({ id: users.id, managerId: users.managerId })
      .from(users)
      .where(eq(users.id, body.employeeId));

    if (!employee || employee.managerId !== userId) {
      return reply.code(403).send({ error: "You can only create sessions with your direct reports" });
    }

    const [created] = await db
      .insert(oneOnOneSessions)
      .values({
        managerId: userId,
        employeeId: body.employeeId,
        scheduledAt: new Date(body.scheduledAt),
      })
      .returning();

    return reply.code(201).send(created);
  });

  // GET / — List sessions for a pair
  app.get("/", { preHandler: requireAuth }, async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const query = parseBody(sessionQuerySchema, request.query);

    const conditions = [];

    if (query.employeeId) {
      // If employeeId specified, verify pair access
      const pair = await resolveOneOnOnePair(db, userId, query.employeeId);
      if (!pair) {
        return reply.code(403).send({ error: "Access denied" });
      }
      conditions.push(eq(oneOnOneSessions.managerId, pair.managerId));
      conditions.push(eq(oneOnOneSessions.employeeId, pair.employeeId));
    } else {
      // Return all sessions where user is manager or employee
      // Build with OR — but drizzle doesn't support OR easily in conditions array
      // So we'll do two queries and merge
      const { or } = await import("drizzle-orm");
      conditions.push(
        or(
          eq(oneOnOneSessions.managerId, userId),
          eq(oneOnOneSessions.employeeId, userId),
        )!,
      );
    }

    if (query.status) {
      conditions.push(eq(oneOnOneSessions.status, query.status));
    }

    const sessions = await db
      .select({
        id: oneOnOneSessions.id,
        managerId: oneOnOneSessions.managerId,
        employeeId: oneOnOneSessions.employeeId,
        status: oneOnOneSessions.status,
        scheduledAt: oneOnOneSessions.scheduledAt,
        startedAt: oneOnOneSessions.startedAt,
        endedAt: oneOnOneSessions.endedAt,
        notes: oneOnOneSessions.notes,
        summary: oneOnOneSessions.summary,
        createdAt: oneOnOneSessions.createdAt,
        updatedAt: oneOnOneSessions.updatedAt,
      })
      .from(oneOnOneSessions)
      .where(and(...conditions))
      .orderBy(desc(oneOnOneSessions.scheduledAt));

    return reply.send({ data: sessions });
  });

  // GET /:id — Session detail with agenda + action items
  app.get("/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);

    const session = await verifySessionAccess(db, id, userId);
    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }

    const [agendaItems, actionItems] = await Promise.all([
      db
        .select()
        .from(oneOnOneAgendaItems)
        .where(eq(oneOnOneAgendaItems.sessionId, id))
        .orderBy(asc(oneOnOneAgendaItems.sortOrder)),
      db
        .select()
        .from(oneOnOneActionItems)
        .where(eq(oneOnOneActionItems.sessionId, id))
        .orderBy(asc(oneOnOneActionItems.sortOrder)),
    ]);

    return reply.send({ ...session, agendaItems, actionItems });
  });

  // PATCH /:id — Update session (manager only for status changes)
  app.patch("/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const body = parseBody(updateSessionSchema, request.body);

    const session = await verifySessionAccess(db, id, userId);
    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }

    // Only manager can change status
    if (body.status && session.managerId !== userId) {
      return reply.code(403).send({ error: "Only the manager can change session status" });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.summary !== undefined) updates.summary = body.summary;
    if (body.scheduledAt !== undefined) updates.scheduledAt = new Date(body.scheduledAt);

    // Valid status transitions: scheduled→active, active→completed, any→cancelled
    if (body.status === "active" && session.status === "scheduled") {
      updates.status = "active";
      updates.startedAt = new Date();

      // Auto-generate agenda on session start
      const agendaItems = await generateAgenda(db, session.managerId, session.employeeId);
      if (agendaItems.length > 0) {
        await db.insert(oneOnOneAgendaItems).values(
          agendaItems.map((item, i) => ({
            sessionId: id,
            text: item.text,
            source: item.source as "ai" | "manual",
            sortOrder: i,
          })),
        );
      }
    } else if (body.status === "completed" && session.status === "active") {
      updates.status = "completed";
      updates.endedAt = new Date();
    } else if (body.status === "cancelled") {
      updates.status = "cancelled";
    } else if (body.status && body.status !== session.status) {
      return reply.code(400).send({
        error: `Invalid status transition: ${session.status} → ${body.status}`,
      });
    }

    // Atomic update with status guard to prevent TOCTOU race
    const statusGuard = body.status
      ? and(eq(oneOnOneSessions.id, id), eq(oneOnOneSessions.status, session.status))
      : eq(oneOnOneSessions.id, id);

    const [updated] = await db
      .update(oneOnOneSessions)
      .set(updates)
      .where(statusGuard)
      .returning();

    if (!updated && body.status) {
      return reply.code(409).send({ error: "Session was modified concurrently, please retry" });
    }

    // Return full session detail
    const [agendaItems, actionItems] = await Promise.all([
      db
        .select()
        .from(oneOnOneAgendaItems)
        .where(eq(oneOnOneAgendaItems.sessionId, id))
        .orderBy(asc(oneOnOneAgendaItems.sortOrder)),
      db
        .select()
        .from(oneOnOneActionItems)
        .where(eq(oneOnOneActionItems.sessionId, id))
        .orderBy(asc(oneOnOneActionItems.sortOrder)),
    ]);

    return reply.send({ ...updated, agendaItems, actionItems });
  });

  // ── Action Items ──────────────────────────────────────

  // POST /:id/action-items
  app.post("/:id/action-items", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const body = parseBody(createActionItemSchema, request.body);

    const session = await verifySessionAccess(db, id, userId);
    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }

    // Validate assigneeId is scoped to the session pair (#30)
    if (body.assigneeId && body.assigneeId !== session.managerId && body.assigneeId !== session.employeeId) {
      return reply.code(400).send({ error: "assigneeId must be the manager or employee of this session" });
    }

    const [created] = await db
      .insert(oneOnOneActionItems)
      .values({
        sessionId: id,
        text: body.text,
        assigneeId: body.assigneeId,
        dueDate: body.dueDate,
        sortOrder: body.sortOrder ?? 0,
      })
      .returning();

    return reply.code(201).send(created);
  });

  // PATCH /:id/action-items/:itemId
  app.patch("/:id/action-items/:itemId", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const itemId = (request.params as Record<string, string>).itemId;
    const body = parseBody(updateActionItemSchema, request.body);

    const session = await verifySessionAccess(db, id, userId);
    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }

    // Validate assigneeId is scoped to the session pair (#30)
    if (body.assigneeId && body.assigneeId !== session.managerId && body.assigneeId !== session.employeeId) {
      return reply.code(400).send({ error: "assigneeId must be the manager or employee of this session" });
    }

    const updates: Record<string, unknown> = {};
    if (body.text !== undefined) updates.text = body.text;
    if (body.assigneeId !== undefined) updates.assigneeId = body.assigneeId;
    if (body.dueDate !== undefined) updates.dueDate = body.dueDate;
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
    if (body.completed !== undefined) {
      updates.completed = body.completed;
      updates.completedAt = body.completed ? new Date() : null;
    }

    const [updated] = await db
      .update(oneOnOneActionItems)
      .set(updates)
      .where(
        and(
          eq(oneOnOneActionItems.id, itemId),
          eq(oneOnOneActionItems.sessionId, id),
        ),
      )
      .returning();

    if (!updated) {
      return reply.code(404).send({ error: "Action item not found" });
    }

    return reply.send(updated);
  });

  // DELETE /:id/action-items/:itemId
  app.delete("/:id/action-items/:itemId", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const itemId = (request.params as Record<string, string>).itemId;

    const session = await verifySessionAccess(db, id, userId);
    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }

    const [deleted] = await db
      .delete(oneOnOneActionItems)
      .where(
        and(
          eq(oneOnOneActionItems.id, itemId),
          eq(oneOnOneActionItems.sessionId, id),
        ),
      )
      .returning();

    if (!deleted) {
      return reply.code(404).send({ error: "Action item not found" });
    }

    return reply.send({ success: true });
  });

  // ── Agenda Items ──────────────────────────────────────

  // POST /:id/agenda
  app.post("/:id/agenda", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const body = parseBody(createAgendaItemSchema, request.body);

    const session = await verifySessionAccess(db, id, userId);
    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }

    const [created] = await db
      .insert(oneOnOneAgendaItems)
      .values({
        sessionId: id,
        text: body.text,
        source: body.source ?? "manual",
        sortOrder: body.sortOrder ?? 0,
      })
      .returning();

    return reply.code(201).send(created);
  });

  // PATCH /:id/agenda/:itemId
  app.patch("/:id/agenda/:itemId", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const itemId = (request.params as Record<string, string>).itemId;
    const body = parseBody(updateAgendaItemSchema, request.body);

    const session = await verifySessionAccess(db, id, userId);
    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }

    const updates: Record<string, unknown> = {};
    if (body.covered !== undefined) updates.covered = body.covered;
    if (body.text !== undefined) updates.text = body.text;

    const [updated] = await db
      .update(oneOnOneAgendaItems)
      .set(updates)
      .where(
        and(
          eq(oneOnOneAgendaItems.id, itemId),
          eq(oneOnOneAgendaItems.sessionId, id),
        ),
      )
      .returning();

    if (!updated) {
      return reply.code(404).send({ error: "Agenda item not found" });
    }

    return reply.send(updated);
  });

  // POST /:id/generate-agenda — Trigger AI agenda generation (manager only)
  app.post("/:id/generate-agenda", { preHandler: requireRole("manager") }, async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);

    const session = await verifySessionAccess(db, id, userId);
    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }

    if (session.managerId !== userId) {
      return reply.code(403).send({ error: "Only the manager can generate agenda" });
    }

    const agendaItems = await generateAgenda(db, session.managerId, session.employeeId);
    if (agendaItems.length > 0) {
      // Get current max sort order
      const existing = await db
        .select({ sortOrder: oneOnOneAgendaItems.sortOrder })
        .from(oneOnOneAgendaItems)
        .where(eq(oneOnOneAgendaItems.sessionId, id))
        .orderBy(desc(oneOnOneAgendaItems.sortOrder))
        .limit(1);

      const baseOrder = existing.length > 0 ? existing[0].sortOrder + 1 : 0;

      await db.insert(oneOnOneAgendaItems).values(
        agendaItems.map((item, i) => ({
          sessionId: id,
          text: item.text,
          source: item.source as "ai" | "manual",
          sortOrder: baseOrder + i,
        })),
      );
    }

    const allItems = await db
      .select()
      .from(oneOnOneAgendaItems)
      .where(eq(oneOnOneAgendaItems.sessionId, id))
      .orderBy(asc(oneOnOneAgendaItems.sortOrder));

    return reply.send({ data: allItems });
  });

  // POST /:id/ws-token — Generate a short-lived token for WebSocket auth
  app.post("/:id/ws-token", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db, orgId } = request.tenant;
    const userId = getAuthenticatedUserId(request);

    const session = await verifySessionAccess(db, id, userId);
    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }

    const token = generateWsToken(userId, orgId, id);
    return reply.send({ token });
  });
};
