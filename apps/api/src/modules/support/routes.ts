import type { FastifyPluginAsync } from "fastify";
import { desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { orgSettings, supportSignposts } from "@revualy/db";
import { requireAuth, requireRole, getAuthenticatedUserId } from "../../lib/rbac.js";
import { parseBody } from "../../lib/validation.js";
import { appendAudit } from "../../lib/audit-log.js";
import { loadSupportResources, loadSupportSettings, wordingHash } from "../../lib/support.js";
import { DEFAULT_WORDING, WORDING_PLACEHOLDERS, unknownPlaceholders, wordingPreviews } from "../../lib/bot-references.js";

/**
 * Support signposting settings (docs/bot/concerns-playbook.md, Nick
 * 2026-09-27). Admins set who people are pointed to and the organisation's
 * own support details, and see how often each signpost was shown, by month.
 * Counts only; small counts hidden.
 */

/** Counts below this are shown as "fewer than 3". */
export const MIN_SHOWN_COUNT = 3;

const settingsSchema = z.object({
  supportContact: z.string().trim().max(300),
  supportDetails: z.string().trim().max(1000),
  supportOutside: z.string().trim().max(500),
});

const LEVELS = ["wellbeing", "safety", "conduct"] as const;

const template = z
  .string()
  .trim()
  .max(1200)
  .refine((t) => unknownPlaceholders(t).length === 0, {
    message: `Use only these placeholders: ${WORDING_PLACEHOLDERS.join(", ")}`,
  });
/** An empty string puts the default back. */
const wordingSchema = z.object({ support: template, conduct: template });
const signoffSchema = z.object({
  name: z.string().trim().min(2).max(200),
  role: z.string().trim().min(2).max(200),
});

export const supportRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.get("/settings", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { db } = request.tenant;
    const settings = await loadSupportSettings(db);
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - 11, 1);
    const rows = await db
      .select()
      .from(supportSignposts)
      .where(gte(supportSignposts.month, since.toISOString().slice(0, 10)))
      .orderBy(desc(supportSignposts.month));
    const byMonth = new Map<string, Record<(typeof LEVELS)[number], number>>();
    for (const r of rows) {
      const m = byMonth.get(r.month) ?? { wellbeing: 0, safety: 0, conduct: 0 };
      m[r.level] += r.shown;
      byMonth.set(r.month, m);
    }
    const shown = (n: number) => (n >= MIN_SHOWN_COUNT ? n : null);
    const resources = await loadSupportResources(db);
    return reply.send({
      data: {
        supportContact: settings.contact,
        supportDetails: settings.details,
        supportOutside: settings.outside,
        wording: { support: settings.wording.support ?? "", conduct: settings.wording.conduct ?? "" },
        defaults: DEFAULT_WORDING,
        placeholders: WORDING_PLACEHOLDERS,
        previews: wordingPreviews(resources),
        signoff: settings.signoff
          ? { name: settings.signoff.name, role: settings.signoff.role, at: settings.signoff.at, current: settings.signoff.hash === wordingHash(resources) }
          : null,
        months: [...byMonth.entries()].map(([month, c]) => ({
          month,
          wellbeing: shown(c.wellbeing),
          safety: shown(c.safety),
          conduct: shown(c.conduct),
        })),
        minShownCount: MIN_SHOWN_COUNT,
      },
    });
  });

  app.put("/settings", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { db } = request.tenant;
    const actorId = getAuthenticatedUserId(request);
    const body = parseBody(settingsSchema, request.body);
    const [existing] = await db.select({ id: orgSettings.id }).from(orgSettings).limit(1);
    const values = { ...body, updatedAt: new Date() };
    if (existing) await db.update(orgSettings).set(values).where(eq(orgSettings.id, existing.id));
    else await db.insert(orgSettings).values(values);
    await appendAudit(db, { actorId, action: "support.settings", outcome: "saved" });
    return reply.send({ ok: true });
  });

  // The client's own wording. Changing it (or the contact and details)
  // makes an earlier sign-off stale; the admin page says so.
  app.put("/wording", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { db } = request.tenant;
    const actorId = getAuthenticatedUserId(request);
    const body = parseBody(wordingSchema, request.body);
    const wording = Object.fromEntries(Object.entries(body).filter(([, v]) => v)) as { support?: string; conduct?: string };
    const [existing] = await db.select({ id: orgSettings.id }).from(orgSettings).limit(1);
    if (existing) await db.update(orgSettings).set({ supportWording: wording, updatedAt: new Date() }).where(eq(orgSettings.id, existing.id));
    else await db.insert(orgSettings).values({ supportWording: wording });
    await appendAudit(db, { actorId, action: "support.wording", outcome: "saved", details: { custom: Object.keys(wording) } });
    return reply.send({ ok: true });
  });

  // Record that the client's HR team signed off the wording as it stands now.
  app.post("/wording/sign-off", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { db } = request.tenant;
    const actorId = getAuthenticatedUserId(request);
    const body = parseBody(signoffSchema, request.body);
    const hash = wordingHash(await loadSupportResources(db));
    const signoff = { name: body.name, role: body.role, at: new Date().toISOString(), recordedBy: actorId, hash };
    const [existing] = await db.select({ id: orgSettings.id }).from(orgSettings).limit(1);
    if (existing) await db.update(orgSettings).set({ supportWordingSignoff: signoff, updatedAt: new Date() }).where(eq(orgSettings.id, existing.id));
    else await db.insert(orgSettings).values({ supportWordingSignoff: signoff });
    await appendAudit(db, {
      actorId,
      action: "support.wording_signoff",
      reason: `${body.name}, ${body.role}`,
      outcome: "recorded",
      details: { hash },
    });
    return reply.send({ ok: true });
  });
};
