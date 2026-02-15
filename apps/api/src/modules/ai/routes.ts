import type { FastifyPluginAsync } from "fastify";

export const aiRoutes: FastifyPluginAsync = async (app) => {
  // AI module is primarily internal (called by conversation orchestrator).
  // No public-facing routes — all AI work happens via BullMQ jobs.
};
