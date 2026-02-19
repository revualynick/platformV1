import type { FastifyPluginAsync } from "fastify";
import { eq, desc } from "drizzle-orm";
import { calibrationReports } from "@revualy/db";
import { requireRole } from "../../lib/rbac.js";
import { generateCalibrationReport } from "../../lib/calibration-engine.js";
import type { CalibrationReport } from "../../lib/calibration-engine.js";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const calibrationRoutes: FastifyPluginAsync = async (app) => {
  // All calibration endpoints require admin role
  app.addHook("preHandler", requireRole("admin"));

  // GET /calibration/report?week=2026-02-16 — Get or generate calibration report
  app.get("/calibration/report", async (request, reply) => {
    const { week } = request.query as { week?: string };

    if (!week || !ISO_DATE_RE.test(week)) {
      return reply.code(400).send({
        error: "Query parameter 'week' is required in YYYY-MM-DD format",
      });
    }

    const { db, orgId } = request.tenant;

    // Check for existing stored report
    const [existing] = await db
      .select()
      .from(calibrationReports)
      .where(eq(calibrationReports.weekStarting, week));

    if (existing) {
      return reply.send({ data: existing.data as CalibrationReport });
    }

    // Generate fresh report
    const report = await generateCalibrationReport(db, week);

    // Store for future lookups — use onConflictDoNothing to handle concurrent generation
    await db.insert(calibrationReports).values({
      orgId,
      weekStarting: week,
      data: report,
    }).onConflictDoNothing({ target: [calibrationReports.weekStarting] });

    return reply.send({ data: report });
  });

  // GET /calibration/history — List past calibration reports
  app.get("/calibration/history", async (request, reply) => {
    const { db } = request.tenant;

    const rows = await db
      .select({
        id: calibrationReports.id,
        weekStarting: calibrationReports.weekStarting,
        createdAt: calibrationReports.createdAt,
      })
      .from(calibrationReports)
      .orderBy(desc(calibrationReports.weekStarting))
      .limit(52);

    return reply.send({ data: rows });
  });
};
