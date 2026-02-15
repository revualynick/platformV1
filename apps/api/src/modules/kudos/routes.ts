import type { FastifyPluginAsync } from "fastify";

export const kudosRoutes: FastifyPluginAsync = async (app) => {
  // POST /kudos — Create a kudos
  app.post("/", async (request, reply) => {
    // TODO: Create kudos entry
    return reply.code(201).send({ id: "new" });
  });

  // GET /kudos — List kudos (digest)
  app.get("/", async (request, reply) => {
    // TODO: List recent kudos, filterable by user/team
    return reply.send({ data: [] });
  });
};
