import type { FastifyPluginAsync } from "fastify";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
import { engagementScores, users } from "@revualy/db";
import { requireAuth } from "../../lib/rbac.js";

export const engagementRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  // GET /leaderboard — Weekly leaderboard
  app.get("/leaderboard", async (request, reply) => {
    const { db } = request.tenant;
    const { week } = request.query as { week?: string };

    // Determine ISO week boundaries
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
        score: sql<number>`(
          ${engagementScores.averageQualityScore} * 0.4 +
          ${engagementScores.responseRate} * 100 * 0.3 +
          LEAST(${engagementScores.interactionsCompleted}::float / NULLIF(${engagementScores.interactionsTarget}, 0) * 100, 100) * 0.2 +
          LEAST(${engagementScores.streak} * 5, 100) * 0.1
        )`.as("score"),
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
};
