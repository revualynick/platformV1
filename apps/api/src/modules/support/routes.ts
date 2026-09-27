import type { FastifyPluginAsync } from "fastify";
import { desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { orgSettings, supportSignposts } from "@revualy/db";
import { requireAuth, requireRole, getAuthenticatedUserId } from "../../lib/rbac.js";
import { parseBody } from "../../lib/validation.js";
import { appendAudit } from "../../lib/audit-log.js";
import { loadSupportSettings } from "../../lib/support.js";

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
    return reply.send({
      data: {
        supportContact: settings.contact,
        supportDetails: settings.details,
        supportOutside: settings.outside,
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
};
