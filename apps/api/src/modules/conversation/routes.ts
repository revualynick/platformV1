import type { FastifyPluginAsync } from "fastify";

export const conversationRoutes: FastifyPluginAsync = async (app) => {
  // Conversation state machine is primarily driven by BullMQ jobs,
  // not direct API calls. These endpoints are for admin/debug purposes.

  app.get("/:id", async (request, reply) => {
    // TODO: Get conversation by ID (admin only)
    return reply.code(501).send({ error: "Not implemented" });
  });

  app.post("/:id/close", async (request, reply) => {
    // TODO: Force-close a conversation (admin only)
    return reply.code(501).send({ error: "Not implemented" });
  });
};
