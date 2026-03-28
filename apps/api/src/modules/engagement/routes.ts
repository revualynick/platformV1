import type { FastifyPluginAsync } from "fastify";
import { eq, desc, sql, and, gte, lte, inArray } from "drizzle-orm";
import { engagementScores, users } from "@revualy/db";
import { requireAuth, requireRole } from "../../lib/rbac.js";
import { z } from "zod";

const leaderboardQuerySchema = z.object({ week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const bulkEngagementQuerySchema = z.object({
  userIds: z.string().transform((s) => s.split(",").filter(Boolean)),
});

export const engagementRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  // GET /leaderboard — Weekly leaderboard
  app.get("/leaderboard", async (request, reply) => {
    const { db } = request.tenant;
    const querySchema = leaderboardQuerySchema;
    const { week } = querySchema.parse(request.query);

    let weekStart: string;
    if (week) {
      weekStart = week;
    } else {
      // Current ISO week: Monday of the current week
      const now = new Date();
      const day = now.getUTCDay();
      const diff = day === 0 ? 6 : day - 1; // Monday = 0
      const monday = new Date(now);
      monday.setUTCDate(now.getUTCDate() - diff);
      weekStart = monday.toISOString().slice(0, 10);
    }

    const rows = await db
      .select({
        userId: engagementScores.userId,
        name: users.name,
        score: sql<number>`COALESCE(
          ${engagementScores.averageQualityScore} * 0.4 +
          ${engagementScores.responseRate} * 100 * 0.3 +
          LEAST(${engagementScores.interactionsCompleted}::float / GREATEST(${engagementScores.interactionsTarget}, 1) * 100, 100) * 0.2 +
          LEAST(${engagementScores.streak} * 5, 100) * 0.1
        , 0)`.as("score"),
        interactionsCompleted: engagementScores.interactionsCompleted,
        streak: engagementScores.streak,
      })
      .from(engagementScores)
      .innerJoin(users, eq(engagementScores.userId, users.id))
      .where(
        and(
          eq(engagementScores.weekStarting, weekStart),
          eq(users.isActive, true),
        ),
      )
      .orderBy(sql`score DESC`)
      .limit(20);

    const data = rows.map((row, i) => ({
      rank: i + 1,
      userId: row.userId,
      name: row.name,
      score: Math.round(row.score),
      streak: row.streak,
      interactionsCompleted: row.interactionsCompleted,
    }));

    return reply.send({ data, week: weekStart });
  });

  // GET /engagement/bulk?userIds=id1,id2,id3 — Latest scores for multiple users (manager/admin)
  app.get(
    "/engagement/bulk",
    { preHandler: requireRole("manager") },
    async (request, reply) => {
      const { db } = request.tenant;
      const { userIds } = bulkEngagementQuerySchema.parse(request.query);

      if (userIds.length === 0 || userIds.length > 100) {
        return reply.code(400).send({ error: "Provide 1-100 userIds" });
      }

      // Latest score per user via DISTINCT ON
      const rows = await db
        .selectDistinctOn([engagementScores.userId], {
          userId: engagementScores.userId,
          weekStarting: engagementScores.weekStarting,
          interactionsCompleted: engagementScores.interactionsCompleted,
          interactionsTarget: engagementScores.interactionsTarget,
          averageQualityScore: engagementScores.averageQualityScore,
          responseRate: engagementScores.responseRate,
          streak: engagementScores.streak,
        })
        .from(engagementScores)
        .where(inArray(engagementScores.userId, userIds))
        .orderBy(engagementScores.userId, desc(engagementScores.weekStarting));

      // Group by userId for easy client consumption
      const byUser: Record<string, typeof rows> = {};
      for (const row of rows) {
        (byUser[row.userId] ??= []).push(row);
      }

      return reply.send({ data: byUser });
    },
  );
};
