import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { orgSettings, supportRequests, supportSignals, users } from "@revualy/db";
import { requireAuth, requireRole, getAuthenticatedUserId } from "../../lib/rbac.js";
import { parseBody, idParamSchema } from "../../lib/validation.js";
import { appendAudit } from "../../lib/audit-log.js";
import { loadSupportSettings, supportContactIds } from "../../lib/support.js";

/**
 * The support handover (docs/bot/concerns-playbook.md, Nick 2026-09-27).
 *
 * Admins set who the support contacts are and the organisation's own
 * support details, and see monthly counts only (small counts hidden).
 * The support contacts, and no one else, see the queue of people who said
 * yes to being contacted: who, how soon, and where it has got to, never
 * what they wrote. Every queue view and change is audited.
 */

/** Counts below this are shown as "fewer than 3". */
export const MIN_SHOWN_COUNT = 3;

const settingsSchema = z
  .object({
    supportContactId: z.string().uuid().nullable(),
    supportBackupId: z.string().uuid().nullable(),
    supportDetails: z.string().trim().max(1000),
    supportOutside: z.string().trim().max(500),
  })
  .refine((b) => !b.supportBackupId || b.supportBackupId !== b.supportContactId, {
    message: "The backup must be a different person",
    path: ["supportBackupId"],
  })
  .refine((b) => !b.supportBackupId || b.supportContactId, {
    message: "Set a support contact before a backup",
    path: ["supportBackupId"],
  });

const shown = (n: number) => (n >= MIN_SHOWN_COUNT ? n : null);

async function assertSupportContact(request: FastifyRequest): Promise<string> {
  const actorId = getAuthenticatedUserId(request);
  const ids = await supportContactIds(request.tenant.db);
  if (!ids.includes(actorId)) {
    await appendAudit(request.tenant.db, {
      actorId,
      action: "support.denied",
      outcome: "denied",
      details: { route: request.routeOptions.url ?? null },
    });
    throw Object.assign(new Error("Only the support contacts can see support requests"), { statusCode: 403 });
  }
  return actorId;
}

export const supportRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  // ── Admin: settings and counts ───────────────────────

  app.get("/settings", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { db } = request.tenant;
    const settings = await loadSupportSettings(db);
    const [row] = await db.select({ contactId: orgSettings.supportContactId }).from(orgSettings).limit(1);
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - 11, 1);
    const months = await db
      .select()
      .from(supportSignals)
      .where(gte(supportSignals.month, since.toISOString().slice(0, 10)))
      .orderBy(desc(supportSignals.month));
    return reply.send({
      data: {
        // The stored contact, even if inactive, so the admin can see it needs replacing.
        supportContactId: row?.contactId ?? null,
        supportContactActive: Boolean(settings.contactId),
        supportBackupId: settings.backupId,
        supportDetails: settings.details,
        supportOutside: settings.outside,
        months: months.map((m) => ({ month: m.month, offers: shown(m.offers), accepted: shown(m.accepted) })),
        minShownCount: MIN_SHOWN_COUNT,
      },
    });
  });

  app.put("/settings", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { db } = request.tenant;
    const actorId = getAuthenticatedUserId(request);
    const body = parseBody(settingsSchema, request.body);
    const ids = [body.supportContactId, body.supportBackupId].filter((v): v is string => Boolean(v));
    if (ids.length) {
      const found = await db.select({ id: users.id, isActive: users.isActive }).from(users).where(inArray(users.id, ids));
      if (found.length !== ids.length || found.some((f) => !f.isActive)) {
        return reply.code(400).send({ error: "Support contacts must be active people in this organisation" });
      }
    }
    const [existing] = await db.select({ id: orgSettings.id }).from(orgSettings).limit(1);
    const values = {
      supportContactId: body.supportContactId,
      supportBackupId: body.supportBackupId,
      supportDetails: body.supportDetails,
      supportOutside: body.supportOutside,
      updatedAt: new Date(),
    };
    if (existing) await db.update(orgSettings).set(values).where(eq(orgSettings.id, existing.id));
    else await db.insert(orgSettings).values(values);
    await appendAudit(db, {
      actorId,
      action: "support.settings",
      outcome: "saved",
      details: { contactId: body.supportContactId, backupId: body.supportBackupId },
    });
    return reply.send({ ok: true });
  });

  // ── Support contacts: the queue ──────────────────────

  // Whether the caller is a support contact (for the nav link). Not audited.
  app.get("/me", async (request, reply) => {
    const ids = await supportContactIds(request.tenant.db);
    return reply.send({ isContact: ids.includes(getAuthenticatedUserId(request)) });
  });

  app.get("/requests", async (request, reply) => {
    const actorId = await assertSupportContact(request);
    const { db } = request.tenant;
    const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({ req: supportRequests, name: users.name, email: users.email })
      .from(supportRequests)
      .innerJoin(users, eq(users.id, supportRequests.userId))
      .where(or(inArray(supportRequests.status, ["open", "acknowledged"]), gte(supportRequests.closedAt, recent)))
      .orderBy(desc(supportRequests.createdAt))
      .limit(200);
    await appendAudit(db, {
      actorId,
      action: "support.view_queue",
      outcome: "ok",
      details: { count: rows.length },
    });
    return reply.send({
      data: rows.map((r) => ({
        id: r.req.id,
        userId: r.req.userId,
        name: r.name,
        email: r.email,
        urgency: r.req.urgency,
        status: r.req.status,
        createdAt: r.req.createdAt,
        dueAt: r.req.dueAt,
        acknowledgedAt: r.req.acknowledgedAt,
        closedAt: r.req.closedAt,
      })),
    });
  });

  for (const [path, to, from] of [
    ["acknowledge", "acknowledged", ["open"]],
    ["close", "closed", ["open", "acknowledged"]],
  ] as const) {
    app.post(`/requests/:id/${path}`, async (request, reply) => {
      const actorId = await assertSupportContact(request);
      const { id } = parseBody(idParamSchema, request.params);
      const { db } = request.tenant;
      const now = new Date();
      const [updated] = await db
        .update(supportRequests)
        .set(to === "acknowledged" ? { status: to, acknowledgedAt: now, acknowledgedBy: actorId } : { status: to, closedAt: now, closedBy: actorId })
        .where(and(eq(supportRequests.id, id), inArray(supportRequests.status, [...from])))
        .returning({ id: supportRequests.id, userId: supportRequests.userId });
      if (!updated) return reply.code(409).send({ error: "This request has already moved on" });
      await appendAudit(db, {
        actorId,
        action: `support.${path}`,
        target: updated.userId,
        outcome: "ok",
        details: { requestId: id },
      });
      return reply.send({ ok: true });
    });
  }
};
