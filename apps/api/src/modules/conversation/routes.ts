import type { FastifyPluginAsync } from "fastify";
import { eq, desc } from "drizzle-orm";
import { conversations, conversationMessages } from "@revualy/db";
import { requireAuth, requireRole } from "../../lib/rbac.js";

export const conversationRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);
  // Conversation state machine is primarily driven by BullMQ jobs,
  // not direct API calls. These endpoints are for admin/debug purposes.

  // GET /conversations/:id — Get conversation with messages (admin only)
  app.get("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { db } = request.tenant;

    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));

    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });

    const messages = await db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, id))
      .orderBy(conversationMessages.createdAt);

    return reply.send({ ...conversation, messages });
  });

  // POST /conversations/:id/close — Force-close a conversation (admin only)
  app.post("/:id/close", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { db } = request.tenant;

    const [updated] = await db
      .update(conversations)
      .set({ status: "closed", closedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();

    if (!updated) return reply.code(404).send({ error: "Conversation not found" });
    return reply.send({ id, status: "closed" });
  });

  // GET /conversations — List recent conversations (admin only)
  app.get("/", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { db } = request.tenant;
    const { limit = "20", status } = request.query as { limit?: string; status?: string };

    let query = db.select().from(conversations);

    if (status) {
      query = query.where(eq(conversations.status, status)) as typeof query;
    }

    const results = await query
      .orderBy(desc(conversations.createdAt))
      .limit(parseInt(limit));

    return reply.send({ data: results });
  });
};
