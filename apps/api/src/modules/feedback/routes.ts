import type { FastifyPluginAsync } from "fastify";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  feedbackEntries,
  feedbackValueScores,
  escalations,
  users,
} from "@revualy/db";
import { parseBody, idParamSchema } from "../../lib/validation.js";
import { requireAuth, requireRole, assertContentAccess, withinAccess } from "../../lib/rbac.js";
import { getFeedbackForSubject } from "@revualy/db/queries";
import { z } from "zod";

const feedbackLimitSchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });
const exportQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
});

export const feedbackRoutes: FastifyPluginAsync = async (app) => {
  // All feedback routes require authentication
  app.addHook("preHandler", requireAuth);

  // GET /users/:id/feedback — RBAC-filtered feedback for a user
  app.get("/users/:id/feedback", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;

    // Content: the person themselves or their direct manager only
    // (skip-levels and admins see signals, not themes).
    const access = await assertContentAccess(request, id);

    const { limit } = feedbackLimitSchema.parse(request.query);
    // Tier A: only released batches (3+ reviewers, fortnightly), as
    // paraphrased summaries dated by release. No raw text, no reviewer.
    // Under a break-glass grant, only batches released within its period.
    const all = await getFeedbackForSubject(db, id, access.period ? 500 : limit);
    const result = access.period ? all.filter((e) => withinAccess(access, e.releasedAt)).slice(0, limit) : all;

    return reply.send({ data: result, userId: id });
  });

  // GET /feedback/flagged — Flagged items (manager sees own reports, admin sees all)
  app.get(
    "/feedback/flagged",
    { preHandler: requireRole("manager") },
    async (request, reply) => {
      const { db, userId } = request.tenant;

      if (!userId) {
        return reply.code(401).send({ error: "Authentication required" });
      }

      // Look up role first to determine DB-level filter
      const [caller] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId));

      if (!caller) {
        return reply.code(401).send({ error: "User not found" });
      }

      if (caller.role === "manager") {
        // Fetch direct report IDs, then filter at the DB level
        const reports = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.managerId, userId));
        const reportIds = reports.map((r) => r.id);

        if (reportIds.length === 0) {
          return reply.send({ data: [] });
        }

        const flagged = await db
          .select({
            escalation: escalations,
            feedback: feedbackEntries,
          })
          .from(escalations)
          .innerJoin(feedbackEntries, eq(escalations.feedbackEntryId, feedbackEntries.id))
          .where(inArray(feedbackEntries.subjectId, reportIds))
          .orderBy(desc(escalations.createdAt))
          .limit(200);

        return reply.send({ data: flagged });
      }

      // Admins see all
      const flagged = await db
        .select({
          escalation: escalations,
          feedback: feedbackEntries,
        })
        .from(escalations)
        .innerJoin(feedbackEntries, eq(escalations.feedbackEntryId, feedbackEntries.id))
        .orderBy(desc(escalations.createdAt))
        .limit(500);

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

      // Managers must manage the subject to export their data
      if (caller.role === "manager") {
        const [subject] = await db
          .select({ managerId: users.managerId })
          .from(users)
          .where(eq(users.id, id));

        if (!subject || subject.managerId !== userId) {
          return reply.code(403).send({ error: "You can only export feedback for your direct reports" });
        }
      }
      // Admins pass through
    }

    // Exports page at 1000 entries — fetch one extra to signal more,
    // callers pass ?offset= to continue.
    const EXPORT_PAGE_SIZE = 1000;
    const { offset } = exportQuerySchema.parse(request.query);

    // The subject's (or their manager's) export is the released view too:
    // raw peer text and arrival times would identify reviewers.
    const released = await getFeedbackForSubject(db, id, Number.MAX_SAFE_INTEGER);
    const entries = released.slice(offset, offset + EXPORT_PAGE_SIZE + 1);

    const hasMore = entries.length > EXPORT_PAGE_SIZE;

    return reply.send({
      format: "json",
      userId: id,
      entries: hasMore ? entries.slice(0, EXPORT_PAGE_SIZE) : entries,
      hasMore,
      offset,
      nextOffset: hasMore ? offset + EXPORT_PAGE_SIZE : null,
      exportedAt: new Date().toISOString(),
    });
  });
};
