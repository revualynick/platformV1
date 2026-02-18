import type { FastifyPluginAsync } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { escalations, escalationNotes, users } from "@revualy/db";
import { requireAuth, requireRole, getAuthenticatedUserId } from "../../lib/rbac.js";
import {
  parseBody,
  idParamSchema,
  createEscalationSchema,
  updateEscalationSchema,
  escalationQuerySchema,
  createEscalationNoteSchema,
} from "../../lib/validation.js";

export const escalationRoutes: FastifyPluginAsync = async (app) => {
  // POST / — File an escalation (any authenticated user)
  app.post("/", { preHandler: requireAuth }, async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const body = parseBody(createEscalationSchema, request.body);

    const created = await db.transaction(async (tx) => {
      const [esc] = await tx
        .insert(escalations)
        .values({
          reporterId: userId,
          subjectId: body.subjectId ?? null,
          feedbackEntryId: body.feedbackEntryId ?? null,
          type: body.type,
          severity: body.severity,
          reason: body.reason,
          description: body.description,
          flaggedContent: body.flaggedContent,
        })
        .returning();

      // Auto-create audit note
      await tx.insert(escalationNotes).values({
        escalationId: esc.id,
        action: "Escalation filed",
        performedBy: userId,
        content: `Escalation filed with severity: ${body.severity}`,
      });

      return esc;
    });

    return reply.code(201).send(created);
  });

  // GET / — List all escalations (admin only), with optional filters
  app.get("/", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { db } = request.tenant;
    const query = parseBody(escalationQuerySchema, request.query);

    const conditions = [];
    if (query.status) conditions.push(eq(escalations.status, query.status));
    if (query.severity)
      conditions.push(eq(escalations.severity, query.severity));

    const rows = await db
      .select({
        escalation: escalations,
        reporterName: users.name,
      })
      .from(escalations)
      .leftJoin(users, eq(escalations.reporterId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(escalations.createdAt))
      .limit(100);

    const data = rows.map((r) => ({
      ...r.escalation,
      reporterName: r.reporterName,
    }));

    return reply.send({ data });
  });

  // GET /:id — Escalation detail + audit notes (reporter or admin)
  app.get("/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);

    const [row] = await db
      .select()
      .from(escalations)
      .where(eq(escalations.id, id));

    if (!row) return reply.code(404).send({ error: "Escalation not found" });

    // Only reporter or admin can view
    if (row.reporterId !== userId) {
      // Check if admin
      const [user] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId));
      if (!user || user.role !== "admin") {
        return reply.code(403).send({ error: "Insufficient permissions" });
      }
    }

    const notes = await db
      .select()
      .from(escalationNotes)
      .where(eq(escalationNotes.escalationId, id))
      .orderBy(escalationNotes.createdAt);

    return reply.send({ ...row, notes });
  });

  // PATCH /:id — Update escalation status/resolution (admin only)
  app.patch(
    "/:id",
    { preHandler: requireRole("admin") },
    async (request, reply) => {
      const { id } = parseBody(idParamSchema, request.params);
      const { db } = request.tenant;
      const userId = getAuthenticatedUserId(request);
      const body = parseBody(updateEscalationSchema, request.body);

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (body.status !== undefined) updates.status = body.status;
      if (body.resolution !== undefined) updates.resolution = body.resolution;
      if (body.severity !== undefined) updates.severity = body.severity;

      // If resolving or dismissing, set resolved fields
      if (body.status === "resolved" || body.status === "dismissed") {
        updates.resolvedAt = new Date();
        updates.resolvedById = userId;
      }

      const result = await db.transaction(async (tx) => {
        const [upd] = await tx
          .update(escalations)
          .set(updates)
          .where(eq(escalations.id, id))
          .returning();

        if (!upd) return null;

        // Audit trail
        await tx.insert(escalationNotes).values({
          escalationId: id,
          action: `Status changed to ${body.status ?? "updated"}`,
          performedBy: userId,
          content: body.resolution ?? "",
        });

        return upd;
      });

      if (!result)
        return reply.code(404).send({ error: "Escalation not found" });

      return reply.send(result);
    },
  );

  // POST /:id/notes — Add audit trail note (reporter or admin)
  app.post(
    "/:id/notes",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = parseBody(idParamSchema, request.params);
      const { db } = request.tenant;
      const userId = getAuthenticatedUserId(request);
      const body = parseBody(createEscalationNoteSchema, request.body);

      // Verify escalation exists and user has access
      const [esc] = await db
        .select({ reporterId: escalations.reporterId })
        .from(escalations)
        .where(eq(escalations.id, id));

      if (!esc)
        return reply.code(404).send({ error: "Escalation not found" });

      if (esc.reporterId !== userId) {
        const [user] = await db
          .select({ role: users.role })
          .from(users)
          .where(eq(users.id, userId));
        if (!user || user.role !== "admin") {
          return reply.code(403).send({ error: "Insufficient permissions" });
        }
      }

      const [note] = await db
        .insert(escalationNotes)
        .values({
          escalationId: id,
          action: body.action,
          performedBy: userId,
          content: body.content,
        })
        .returning();

      return reply.code(201).send(note);
    },
  );
};
