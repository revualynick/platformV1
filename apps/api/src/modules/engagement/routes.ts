import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../../lib/rbac.js";

export const engagementRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);
  // GET /leaderboard — Weekly leaderboard
  app.get("/leaderboard", async (request, reply) => {
    // TODO: Fetch from Redis sorted set or compute from engagement_scores
    return reply.send({ data: [], week: new Date().toISOString() });
  });
};
