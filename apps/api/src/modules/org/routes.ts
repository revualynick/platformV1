import type { FastifyPluginAsync } from "fastify";

export const orgRoutes: FastifyPluginAsync = async (app) => {
  // GET /admin/org — Org configuration
  app.get("/org", async (request, reply) => {
    // TODO: Return org config, core values, teams
    return reply.send({ data: null });
  });

  // PATCH /admin/org — Update org config
  app.patch("/org", async (request, reply) => {
    // TODO: Update org settings
    return reply.send({ updated: true });
  });

  // CRUD /admin/questions — Question bank
  app.get("/questions", async (request, reply) => {
    // TODO: List questions
    return reply.send({ data: [] });
  });

  app.post("/questions", async (request, reply) => {
    // TODO: Create question
    return reply.code(201).send({ id: "new" });
  });

  app.patch("/questions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    // TODO: Update question
    return reply.send({ id, updated: true });
  });

  app.delete("/questions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    // TODO: Delete question
    return reply.send({ id, deleted: true });
  });

  // /admin/relationships — Graph overrides
  app.get("/relationships", async (request, reply) => {
    // TODO: Get relationship graph config
    return reply.send({ data: [] });
  });

  app.post("/relationships", async (request, reply) => {
    // TODO: Create/override relationship
    return reply.code(201).send({ created: true });
  });

  // /admin/integrations — Platform connections
  app.get("/integrations", async (request, reply) => {
    // TODO: List integrations
    return reply.send({ data: [] });
  });

  app.post("/integrations", async (request, reply) => {
    // TODO: Configure integration
    return reply.code(201).send({ created: true });
  });
};
