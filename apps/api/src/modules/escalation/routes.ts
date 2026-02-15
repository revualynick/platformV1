import type { FastifyPluginAsync } from "fastify";
import { requireRole } from "../../lib/rbac.js";

export const escalationRoutes: FastifyPluginAsync = async (app) => {
  // Escalations are admin/HR only
  app.addHook("preHandler", requireRole("admin"));
  // GET /escalations — HR feed (HR/admin only)
  app.get("/", async (request, reply) => {
    // TODO: List escalations with audit trail
    // RBAC: HR/admin only — NOT visible to managers
    return reply.send({ data: [] });
  });

  // PATCH /escalations/:id — Resolve/update escalation
  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    // TODO: Update escalation (resolve, add notes)
    return reply.send({ id, updated: true });
  });
};
