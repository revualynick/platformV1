import type { FastifyPluginAsync } from "fastify";

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/login", async (request, reply) => {
    // TODO: Implement SSO login (Google/Microsoft via NextAuth.js)
    return reply.code(501).send({ error: "Not implemented" });
  });

  app.post("/refresh", async (request, reply) => {
    // TODO: Token refresh
    return reply.code(501).send({ error: "Not implemented" });
  });

  app.post("/logout", async (request, reply) => {
    // TODO: Invalidate session
    return reply.code(501).send({ error: "Not implemented" });
  });

  app.get("/me", async (request, reply) => {
    // TODO: Return current user from session
    return reply.code(501).send({ error: "Not implemented" });
  });
};
