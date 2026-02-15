import type { FastifyPluginAsync } from "fastify";

export const usersRoutes: FastifyPluginAsync = async (app) => {
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    // TODO: Get user profile
    return reply.send({ id });
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    // TODO: Update user profile/preferences
    return reply.send({ id, updated: true });
  });

  app.get("/:id/relationships", async (request, reply) => {
    const { id } = request.params as { id: string };
    // TODO: Get relationship web for user (from Neo4j)
    return reply.send({ data: [], userId: id });
  });

  app.get("/:id/engagement", async (request, reply) => {
    const { id } = request.params as { id: string };
    // TODO: Get engagement scores for user
    return reply.send({ data: [], userId: id });
  });
};
