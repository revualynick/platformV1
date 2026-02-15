import type { FastifyPluginAsync } from "fastify";

export const engagementRoutes: FastifyPluginAsync = async (app) => {
  // GET /leaderboard — Weekly leaderboard
  app.get("/leaderboard", async (request, reply) => {
    // TODO: Fetch from Redis sorted set or compute from engagement_scores
    return reply.send({ data: [], week: new Date().toISOString() });
  });
};
