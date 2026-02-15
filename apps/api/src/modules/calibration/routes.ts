import type { FastifyPluginAsync } from "fastify";

export const calibrationRoutes: FastifyPluginAsync = async (app) => {
  // GET /calibration/report — Weekly calibration report (admin/HR)
  app.get("/calibration/report", async (request, reply) => {
    // TODO Phase 5: Run calibration engine
    // - Reviewer leniency/severity detection
    // - Cross-team comparison
    // - Outlier detection
    return reply.send({ data: null });
  });
};
