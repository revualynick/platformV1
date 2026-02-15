import type { FastifyPluginAsync } from "fastify";

export const integrationsRoutes: FastifyPluginAsync = async (app) => {
  // OAuth callbacks for calendar integrations
  app.get("/google/callback", async (request, reply) => {
    // TODO Phase 3: Handle Google Calendar OAuth callback
    return reply.code(501).send({ error: "Not implemented" });
  });

  app.get("/outlook/callback", async (request, reply) => {
    // TODO Phase 3: Handle Outlook Calendar OAuth callback
    return reply.code(501).send({ error: "Not implemented" });
  });
};
