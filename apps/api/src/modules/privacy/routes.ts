import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "@revualy/db";
import { requireAuth, getAuthenticatedUserId } from "../../lib/rbac.js";
import { parseBody } from "../../lib/validation.js";
import { tenantReviewerRef, pseudonymSecret } from "../../lib/pseudonym.js";
import { appendAudit, verifyAuditChain } from "../../lib/audit-log.js";

/**
 * Tier A re-identification (docs/design/privacy-and-agent-access.md).
 *
 * Super admins only, for formal processes (a conduct investigation, a legal
 * request). Needs the pseudonym secret and a written reason, and every
 * attempt, including a refused one, is appended to the audit log before
 * anything is returned. If the audit write fails, nothing is returned.
 * Never reads or logs feedback content.
 */

const REF_RE = /^[0-9a-f]{64}$/;

const reidentifySchema = z.object({
  reviewerRef: z.string().regex(REF_RE, "reviewerRef must be a 64-character hex pseudonym"),
  reason: z.string().trim().min(20, "Give a reason of at least 20 characters").max(2000),
});

const ACTION = "reviewer.reidentify";

/** Audits and refuses anyone who is not an active super admin. */
async function requireSuperAdminAudited(request: FastifyRequest, reply: FastifyReply) {
  const actorId = getAuthenticatedUserId(request);
  const { db } = request.tenant;
  const [caller] = await db
    .select({ role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, actorId));
  if (caller?.role === "super_admin" && caller.isActive) return;

  const body = (request.body ?? {}) as { reviewerRef?: unknown; reason?: unknown };
  await appendAudit(db, {
    actorId,
    action: request.routeOptions.url?.endsWith("/verify") ? "audit.verify" : ACTION,
    target: typeof body.reviewerRef === "string" && REF_RE.test(body.reviewerRef) ? body.reviewerRef : null,
    reason: typeof body.reason === "string" ? body.reason.slice(0, 2000) : null,
    outcome: "denied",
    details: { role: caller?.role ?? null },
  });
  return reply.code(403).send({ error: "Insufficient permissions" });
}

export const privacyRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  // POST /reidentify: which user a reviewer pseudonym belongs to.
  app.post("/reidentify", { preHandler: requireSuperAdminAudited }, async (request, reply) => {
    const actorId = getAuthenticatedUserId(request);
    const { db } = request.tenant;
    const body = parseBody(reidentifySchema, request.body);

    try {
      pseudonymSecret();
    } catch {
      await appendAudit(db, { actorId, action: ACTION, target: body.reviewerRef, reason: body.reason, outcome: "unavailable" });
      return reply.code(503).send({ error: "Re-identification is not configured on this deployment" });
    }

    // The pseudonym is one-way: recompute it for every user (active or not)
    // and compare. Only possible with the secret.
    const people = await db.select({ id: users.id, name: users.name, email: users.email }).from(users);
    const match = people.find((p) => tenantReviewerRef(p.id) === body.reviewerRef) ?? null;

    await appendAudit(db, {
      actorId,
      action: ACTION,
      target: body.reviewerRef,
      reason: body.reason,
      outcome: match ? "found" : "not_found",
      details: match ? { userId: match.id } : {},
    });

    if (!match) return reply.code(404).send({ error: "No user has this pseudonym" });
    return reply.send({ userId: match.id, name: match.name, email: match.email });
  });

  // GET /audit/verify: recompute the audit chain.
  app.get("/audit/verify", { preHandler: requireSuperAdminAudited }, async (request, reply) => {
    const result = await verifyAuditChain(request.tenant.db);
    return reply.code(result.ok ? 200 : 409).send(result);
  });
};
