import { eq, desc, sql, and, inArray } from "drizzle-orm";
import { engagementScores, users } from "../schema/tenant.js";
import type { TenantDb } from "../tenant.js";

export async function getEngagementScoresForUser(
  db: TenantDb,
  userId: string,
  limit = 52,
) {
  return db
    .select()
    .from(engagementScores)
    .where(eq(engagementScores.userId, userId))
    .orderBy(desc(engagementScores.weekStarting))
    .limit(limit);
}

export async function getBulkLatestEngagement(
  db: TenantDb,
  userIds: string[],
) {
  if (userIds.length === 0) return {};

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

  const byUser: Record<string, typeof rows> = {};
  for (const row of rows) {
    (byUser[row.userId] ??= []).push(row);
  }
  return byUser;
}

export async function getLeaderboard(db: TenantDb, weekStart: string) {
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

  return rows.map((row, i) => ({
    rank: i + 1,
    userId: row.userId,
    name: row.name,
    score: Math.round(row.score),
    streak: row.streak,
    interactionsCompleted: row.interactionsCompleted,
  }));
}

/**
 * Weekly leaderboard history for a set of team members: the most recent
 * `weeks` completed weeks (excluding `currentWeek`), each ranked by average
 * quality score. Powers the "Previous Weeks" panel with real data.
 */
export async function getTeamLeaderboardHistory(
  db: TenantDb,
  userIds: string[],
  currentWeek: string,
  weeks = 4,
): Promise<Array<{ week: string; data: Array<{ rank: number; name: string; score: number }> }>> {
  if (userIds.length === 0) return [];

  const rows = await db
    .select({
      weekStarting: engagementScores.weekStarting,
      name: users.name,
      score: engagementScores.averageQualityScore,
    })
    .from(engagementScores)
    .innerJoin(users, eq(engagementScores.userId, users.id))
    .where(
      and(
        inArray(engagementScores.userId, userIds),
        sql`${engagementScores.weekStarting} < ${currentWeek}`,
      ),
    )
    .orderBy(desc(engagementScores.weekStarting), desc(engagementScores.averageQualityScore));

  // Group by week (already sorted desc), keep the most recent `weeks`.
  const byWeek = new Map<string, Array<{ rank: number; name: string; score: number }>>();
  for (const r of rows) {
    const list = byWeek.get(r.weekStarting) ?? [];
    if (list.length < 5) {
      list.push({ rank: list.length + 1, name: r.name, score: r.score });
    }
    byWeek.set(r.weekStarting, list);
  }

  return [...byWeek.entries()]
    .slice(0, weeks)
    .map(([week, data]) => ({ week, data }));
}
