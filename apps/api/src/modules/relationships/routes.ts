import type { FastifyPluginAsync } from "fastify";

export const relationshipsRoutes: FastifyPluginAsync = async (app) => {
  // GET /users/:id/relationships — Relationship web data (for D3.js viz)
  app.get("/users/:id/relationships", async (request, reply) => {
    const { id } = request.params as { id: string };
    // TODO: Query Neo4j for relationship graph around user
    // Returns nodes (users) and edges (relationships with weights)
    return reply.send({
      nodes: [],
      edges: [],
      userId: id,
    });
  });
};
