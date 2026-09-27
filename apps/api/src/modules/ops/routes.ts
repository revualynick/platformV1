import type { FastifyPluginAsync } from "fastify";
import type { Queue } from "bullmq";
import { eq } from "drizzle-orm";
import { users } from "@revualy/db";
import { computeOpsStatus } from "../../lib/ops-status.js";
import { BOOTED_AT } from "../../workers/index.js";

/**
 * GET /api/v1/ops/status (C3 step 8): the tenant's pipeline checks, counts
 * only. Reached with the internal secret, either server to server (the web
 * app's /api/ops/status, which checks the fleet ops token) or by a super
 * admin. Nothing in the response names anyone or holds content.
 */

let queues: Record<string, Pick<Queue, "getFailed">> | null = null;
export function setOpsQueues(q: Record<string, Pick<Queue, "getFailed">>) {
  queues = q;
}

export const opsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/status", async (request, reply) => {
    const { db, userId } = request.tenant;
    // No user: a server-to-server call that already passed the internal secret.
    if (userId) {
      const [caller] = await db.select({ role: users.role, isActive: users.isActive }).from(users).where(eq(users.id, userId));
      if (caller?.role !== "super_admin" || !caller.isActive) return reply.code(403).send({ error: "Insufficient permissions" });
    }
    const status = await computeOpsStatus(db, { queues: queues ?? undefined, bootedAt: BOOTED_AT });
    return reply.code(status.status === "fail" ? 503 : 200).send(status);
  });
};
