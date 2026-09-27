import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { accessGrants, users } from "@revualy/db";
import { requireAuth, getAuthenticatedUserId, isAdminRole } from "../../lib/rbac.js";
import { parseBody, idParamSchema, userIdParamSchema } from "../../lib/validation.js";
import { appendAudit } from "../../lib/audit-log.js";
import {
  GRANT_DEFAULT_DAYS,
  GRANT_MAX_DAYS,
  GRANT_MAX_PERIOD_DAYS,
  findActiveGrant,
  grantStatus,
  subjectNotified,
  type GrantRow,
} from "../../lib/access-grants.js";

/**
 * Break-glass access (docs/design/privacy-and-agent-access.md, "Triggered
 * access"). An admin who needs a person's content for a formal process (a
 * grievance, a formal performance process, a conduct report) records a
 * reason and a period, and gets read-only access to what the direct manager
 * sees, for up to 30 days. No second approver for this level (Nick,
 * 2026-09-27); raw content, when it becomes viewable, will need one.
 *
 * Every grant, view, read, hold lift and revocation is written to the audit
 * log, and so is a refused attempt. The subject is told unless the grantee
 * sets a hold with its own reason; a hold ends when lifted or when the grant
 * ends, so the subject is always told eventually.
 */

const DAY = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = z
  .string()
  .regex(DATE_RE, "Use a YYYY-MM-DD date")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Not a valid date");

const createGrantSchema = z
  .object({
    subjectId: z.string().uuid(),
    reason: z.string().trim().min(20, "Give a reason of at least 20 characters").max(2000),
    periodStart: isoDate,
    periodEnd: isoDate,
    days: z.number().int().min(1).max(GRANT_MAX_DAYS).default(GRANT_DEFAULT_DAYS),
    holdReason: z.string().trim().min(20, "Give a hold reason of at least 20 characters").max(2000).optional(),
  })
  .refine((b) => b.periodEnd >= b.periodStart, { message: "The period must end on or after its start", path: ["periodEnd"] })
  .refine((b) => b.periodEnd <= new Date().toISOString().slice(0, 10), {
    message: "The period can't end in the future",
    path: ["periodEnd"],
  })
  .refine((b) => (Date.parse(b.periodEnd) - Date.parse(b.periodStart)) / DAY <= GRANT_MAX_PERIOD_DAYS, {
    message: `A grant covers at most ${GRANT_MAX_PERIOD_DAYS} days`,
    path: ["periodStart"],
  });

/** Audits and refuses anyone who is not an active admin or super admin. */
async function requireAdminAudited(request: FastifyRequest, reply: FastifyReply) {
  const actorId = getAuthenticatedUserId(request);
  const { db } = request.tenant;
  const [caller] = await db.select({ role: users.role, isActive: users.isActive }).from(users).where(eq(users.id, actorId));
  if (caller?.isActive && isAdminRole(caller.role)) return;

  const body = (request.body ?? {}) as { subjectId?: unknown };
  const params = (request.params ?? {}) as { userId?: unknown; id?: unknown };
  const target = [body.subjectId, params.userId, params.id].find((v) => typeof v === "string") as string | undefined;
  await appendAudit(db, {
    actorId,
    action: "breakglass.denied",
    target: target?.slice(0, 255) ?? null,
    outcome: "denied",
    details: { role: caller?.role ?? null, route: request.routeOptions.url ?? null },
  });
  return reply.code(403).send({ error: "Insufficient permissions" });
}

/** The grantee or a super admin may revoke a grant or lift its hold. */
async function loadManageableGrant(request: FastifyRequest, id: string): Promise<GrantRow> {
  const { db } = request.tenant;
  const actorId = getAuthenticatedUserId(request);
  const [grant] = await db.select().from(accessGrants).where(eq(accessGrants.id, id));
  if (!grant) throw Object.assign(new Error("Grant not found"), { statusCode: 404 });
  if (grant.granteeId !== actorId) {
    const [caller] = await db.select({ role: users.role }).from(users).where(eq(users.id, actorId));
    if (caller?.role !== "super_admin") {
      throw Object.assign(new Error("Only the grant's holder or a super admin can change it"), { statusCode: 403 });
    }
  }
  return grant;
}

const grantee = alias(users, "grantee");
const subject = alias(users, "subject");

export const accessGrantRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  // POST / : break glass. Opens at once; the reason goes to the audit log.
  app.post("/", { preHandler: requireAdminAudited }, async (request, reply) => {
    const actorId = getAuthenticatedUserId(request);
    const { db } = request.tenant;
    const body = parseBody(createGrantSchema, request.body);

    if (body.subjectId === actorId) {
      return reply.code(400).send({ error: "You can already see your own record" });
    }
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, body.subjectId));
    if (!target) return reply.code(404).send({ error: "User not found" });
    if (await findActiveGrant(db, actorId, body.subjectId)) {
      return reply.code(409).send({ error: "You already have an active grant for this person" });
    }

    const now = new Date();
    const [grant] = await db
      .insert(accessGrants)
      .values({
        granteeId: actorId,
        subjectId: body.subjectId,
        reason: body.reason,
        periodStart: body.periodStart,
        periodEnd: body.periodEnd,
        createdAt: now,
        expiresAt: new Date(now.getTime() + body.days * DAY),
        holdReason: body.holdReason ?? null,
      })
      .returning();

    // No audit entry, no grant.
    try {
      await appendAudit(db, {
        actorId,
        action: "breakglass.grant",
        target: body.subjectId,
        reason: body.reason,
        outcome: "granted",
        details: {
          grantId: grant.id,
          periodStart: body.periodStart,
          periodEnd: body.periodEnd,
          expiresAt: grant.expiresAt.toISOString(),
          hold: Boolean(body.holdReason),
          ...(body.holdReason ? { holdReason: body.holdReason } : {}),
        },
      });
    } catch (err) {
      await db.delete(accessGrants).where(eq(accessGrants.id, grant.id));
      throw err;
    }

    return reply.code(201).send({ data: { ...grant, status: grantStatus(grant) } });
  });

  // GET / : grants for the admin screen. Admins see their own; super admins see all.
  app.get("/", { preHandler: requireAdminAudited }, async (request, reply) => {
    const actorId = getAuthenticatedUserId(request);
    const { db } = request.tenant;
    const [caller] = await db.select({ role: users.role }).from(users).where(eq(users.id, actorId));

    const rows = await db
      .select({ grant: accessGrants, granteeName: grantee.name, subjectName: subject.name })
      .from(accessGrants)
      .innerJoin(grantee, eq(grantee.id, accessGrants.granteeId))
      .innerJoin(subject, eq(subject.id, accessGrants.subjectId))
      .where(caller?.role === "super_admin" ? undefined : eq(accessGrants.granteeId, actorId))
      .orderBy(desc(accessGrants.createdAt))
      .limit(200);

    return reply.send({
      data: rows.map((r) => ({
        ...r.grant,
        granteeName: r.granteeName,
        subjectName: r.subjectName,
        status: grantStatus(r.grant),
        onHold: !subjectNotified(r.grant),
      })),
    });
  });

  // GET /about-me : grants on the caller's own record that they may see.
  // The reason stays in the audit log; the subject sees who, when and the period.
  app.get("/about-me", async (request, reply) => {
    const actorId = getAuthenticatedUserId(request);
    const { db } = request.tenant;
    const rows = await db
      .select({ grant: accessGrants, granteeName: grantee.name })
      .from(accessGrants)
      .innerJoin(grantee, eq(grantee.id, accessGrants.granteeId))
      .where(eq(accessGrants.subjectId, actorId))
      .orderBy(desc(accessGrants.createdAt));

    return reply.send({
      data: rows
        .filter((r) => subjectNotified(r.grant))
        .map((r) => ({
          id: r.grant.id,
          granteeName: r.granteeName,
          createdAt: r.grant.createdAt,
          periodStart: r.grant.periodStart,
          periodEnd: r.grant.periodEnd,
          expiresAt: r.grant.expiresAt,
          revokedAt: r.grant.revokedAt,
          status: grantStatus(r.grant),
        })),
    });
  });

  // POST /open/:userId : the web member page asks before showing content.
  // Logged as a view; 404 when the caller holds no active grant.
  app.post("/open/:userId", { preHandler: requireAdminAudited }, async (request, reply) => {
    const actorId = getAuthenticatedUserId(request);
    const { userId } = parseBody(userIdParamSchema, request.params);
    const { db } = request.tenant;
    const grant = await findActiveGrant(db, actorId, userId);
    if (!grant) return reply.code(404).send({ error: "No active grant for this person" });

    await appendAudit(db, {
      actorId,
      action: "breakglass.view",
      target: userId,
      outcome: "ok",
      details: { grantId: grant.id },
    });
    return reply.send({
      data: {
        id: grant.id,
        reason: grant.reason,
        periodStart: grant.periodStart,
        periodEnd: grant.periodEnd,
        expiresAt: grant.expiresAt,
        onHold: !subjectNotified(grant),
      },
    });
  });

  // POST /:id/revoke : end a grant early.
  app.post("/:id/revoke", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const actorId = getAuthenticatedUserId(request);
    const { db } = request.tenant;
    const grant = await loadManageableGrant(request, id);
    if (grantStatus(grant) !== "active") return reply.code(409).send({ error: "This grant has already ended" });

    const [updated] = await db
      .update(accessGrants)
      .set({ revokedAt: new Date(), revokedBy: actorId })
      .where(and(eq(accessGrants.id, id), isNull(accessGrants.revokedAt)))
      .returning();
    await appendAudit(db, {
      actorId,
      action: "breakglass.revoke",
      target: grant.subjectId,
      outcome: "revoked",
      details: { grantId: id },
    });
    return reply.send({ data: { ...updated, status: grantStatus(updated) } });
  });

  // POST /:id/lift-hold : tell the subject now instead of when the grant ends.
  app.post("/:id/lift-hold", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const actorId = getAuthenticatedUserId(request);
    const { db } = request.tenant;
    const grant = await loadManageableGrant(request, id);
    if (!grant.holdReason || grant.holdLiftedAt) return reply.code(409).send({ error: "This grant has no hold to lift" });

    const [updated] = await db
      .update(accessGrants)
      .set({ holdLiftedAt: new Date() })
      .where(eq(accessGrants.id, id))
      .returning();
    await appendAudit(db, {
      actorId,
      action: "breakglass.hold_lifted",
      target: grant.subjectId,
      outcome: "ok",
      details: { grantId: id },
    });
    return reply.send({ data: { ...updated, status: grantStatus(updated) } });
  });
};

