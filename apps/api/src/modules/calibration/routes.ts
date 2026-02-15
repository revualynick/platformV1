import type { FastifyPluginAsync } from "fastify";
import { requireRole } from "../../lib/rbac.js";

export const calibrationRoutes: FastifyPluginAsync = async (app) => {
  // Calibration reports are admin/HR only
  app.addHook("preHandler", requireRole("admin"));
  // GET /calibration/report — Weekly calibration report (admin/HR)
  app.get("/calibration/report", async (request, reply) => {
    // TODO Phase 5: Run calibration engine
    // - Reviewer leniency/severity detection
    // - Cross-team comparison
    // - Outlier detection
    return reply.send({ data: null });
  });
};
