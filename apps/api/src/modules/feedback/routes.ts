import type { FastifyPluginAsync } from "fastify";
import { eq, and, desc } from "drizzle-orm";
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

    // TODO: proper RBAC check
    // - Employee: own feedback only (id === userId)
    // - Manager: team members' feedback
    // - Admin/HR: all feedback

    const entries = await db
      .select()
      .from(feedbackEntries)
      .where(eq(feedbackEntries.subjectId, id))
      .orderBy(desc(feedbackEntries.createdAt));

    // Fetch value scores for each entry
    const entryIds = entries.map((e) => e.id);
    const allScores =
      entryIds.length > 0
        ? await db.select().from(feedbackValueScores)
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

  // GET /users/:id/export — Data export
  app.get("/users/:id/export", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;

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
