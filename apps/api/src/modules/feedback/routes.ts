import type { FastifyPluginAsync } from "fastify";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  feedbackEntries,
  feedbackValueScores,
  escalations,
  users,
} from "@revualy/db";
import { parseBody, idParamSchema } from "../../lib/validation.js";
import { requireAuth, requireRole } from "../../lib/rbac.js";

export const feedbackRoutes: FastifyPluginAsync = async (app) => {
  // All feedback routes require authentication
  app.addHook("preHandler", requireAuth);

  // GET /users/:id/feedback — RBAC-filtered feedback for a user
  app.get("/users/:id/feedback", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db, userId } = request.tenant;

    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    // RBAC: employees can only view their own feedback
    if (id !== userId) {
      // Check if caller is a manager of this user or an admin
      const [caller] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId));

      if (!caller || caller.role === "employee") {
        // Employees can also see feedback for users they manage
        const [subject] = await db
          .select({ managerId: users.managerId })
          .from(users)
          .where(eq(users.id, id));

        if (!subject || subject.managerId !== userId) {
          return reply.code(403).send({ error: "You can only view your own feedback" });
        }
      }
    }

    const { limit = "50" } = request.query as { limit?: string };
    const entries = await db
      .select()
      .from(feedbackEntries)
      .where(eq(feedbackEntries.subjectId, id))
      .orderBy(desc(feedbackEntries.createdAt))
      .limit(Math.min(parseInt(limit, 10) || 50, 200));

    // Fetch value scores for the entries on this page
    const entryIds = entries.map((e) => e.id);
    const allScores =
      entryIds.length > 0
        ? await db.select().from(feedbackValueScores).where(inArray(feedbackValueScores.feedbackEntryId, entryIds))
        : [];

    const scoresByEntry = new Map<string, typeof allScores>();
    allScores.forEach((s) => {
      const list = scoresByEntry.get(s.feedbackEntryId) ?? [];
      list.push(s);
      scoresByEntry.set(s.feedbackEntryId, list);
    });

    const result = entries.map((e) => ({
      ...e,
      valueScores: scoresByEntry.get(e.id) ?? [],
    }));

    return reply.send({ data: result, userId: id });
  });

  // GET /feedback/flagged — Flagged items (manager/HR only)
  app.get(
    "/feedback/flagged",
    { preHandler: requireRole("manager") },
    async (request, reply) => {
      const { db } = request.tenant;

      const flagged = await db
        .select({
          escalation: escalations,
          feedback: feedbackEntries,
        })
        .from(escalations)
        .innerJoin(feedbackEntries, eq(escalations.feedbackEntryId, feedbackEntries.id))
        .orderBy(desc(escalations.createdAt));

      return reply.send({ data: flagged });
    },
  );

  // GET /users/:id/export — Data export (self, manager, or admin only)
  app.get("/users/:id/export", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db, userId } = request.tenant;

    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    if (id !== userId) {
      const [caller] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId));

      if (!caller || caller.role === "employee") {
        return reply.code(403).send({ error: "You can only export your own feedback" });
      }
    }

    const entries = await db
      .select()
      .from(feedbackEntries)
      .where(eq(feedbackEntries.subjectId, id))
      .orderBy(desc(feedbackEntries.createdAt));

    // CSV-like export structure
    return reply.send({
      format: "json",
      userId: id,
      entries,
      exportedAt: new Date().toISOString(),
    });
  });
};
