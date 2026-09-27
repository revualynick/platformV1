import type { FastifyPluginAsync } from "fastify";
import type { Queue } from "bullmq";
import { eq, and, ne, desc } from "drizzle-orm";
import { conversations } from "@revualy/db";
import { requireAuth, requireRole } from "../../lib/rbac.js";
import { parseBody, idParamSchema } from "../../lib/validation.js";
import { markIncomplete } from "../../lib/conversation-orchestrator.js";

/**
 * Admin and debug views of conversations. Admins see signals, not content
 * (privacy design, "Who sees what about a person"; review finding
 * 2026-09-28): no transcript, and not who was asked about whom, only each
 * conversation's state and size. Self-reflections are left out entirely.
 */

const PRIVATE_INTERACTION = "self_reflection";

let analysisQueue: Queue | null = null;
export function setConversationAdminQueue(queue: Queue) {
  analysisQueue = queue;
}

/** State and size only: never reviewer, subject, or anything written. */
const summaryColumns = {
  id: conversations.id,
  interactionType: conversations.interactionType,
  platform: conversations.platform,
  status: conversations.status,
  phase: conversations.phase,
  messageCount: conversations.messageCount,
  createdAt: conversations.createdAt,
  closedAt: conversations.closedAt,
  lastActivityAt: conversations.lastActivityAt,
};

export const conversationRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);
  // Conversations are driven by BullMQ jobs, not these endpoints.

  // GET /conversations/:id: one conversation's state (admin only).
  app.get("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const [conversation] = await db
      .select(summaryColumns)
      .from(conversations)
      .where(and(eq(conversations.id, id), ne(conversations.interactionType, PRIVATE_INTERACTION)));
    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
    return reply.send(conversation);
  });

  // POST /conversations/:id/close: end an open conversation now (admin only).
  // Through the engine, like a quiet one: the turn is claimed (an in-flight
  // reply loses), the ticket closes, and it's analysed as partial unless it
  // ended for a support concern. Finished conversations are left alone.
  app.post("/:id/close", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const [exists] = await db.select({ status: conversations.status }).from(conversations).where(eq(conversations.id, id));
    if (!exists) return reply.code(404).send({ error: "Conversation not found" });
    if (!analysisQueue) return reply.code(503).send({ error: "Queues not ready" });
    const closed = await markIncomplete(db, { analysisQueue }, id);
    if (!closed) return reply.code(409).send({ error: "This conversation has already ended" });
    return reply.send({ id, status: "incomplete" });
  });

  // GET /conversations: recent conversations' state (admin only).
  app.get("/", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { db } = request.tenant;
    const { limit: rawLimit = "20", status } = request.query as { limit?: string; status?: string };
    const parsedLimit = parseInt(rawLimit, 10);
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 20;

    const validStatuses = ["initiated", "in_progress", "closed", "incomplete"] as const;
    if (status && !validStatuses.includes(status as (typeof validStatuses)[number])) {
      return reply.code(400).send({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
    }

    const conditions = [ne(conversations.interactionType, PRIVATE_INTERACTION)];
    if (status) conditions.push(eq(conversations.status, status));
    const results = await db
      .select(summaryColumns)
      .from(conversations)
      .where(and(...conditions))
      .orderBy(desc(conversations.createdAt))
      .limit(safeLimit);
    return reply.send({ data: results });
  });
};
