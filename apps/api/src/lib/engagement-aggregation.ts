import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import { feedbackEntries, selfReflections, engagementScores } from "@revualy/db";

/** UTC Monday 00:00 of the week containing `d`. */
export function weekMondayUTC(d: Date = new Date()): string {
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const dow = date.getUTCDay(); // 0=Sun..6=Sat
  const diff = (dow + 6) % 7; // days since Monday
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString().slice(0, 10);
}

/**
 * Recompute and upsert a user's engagement_scores row for the given week from
 * their actual activity: feedback they authored as a reviewer (peer_review /
 * three_sixty) plus their completed self-reflections that week. This is the
 * missing writer that makes the engagement ring / trend / leaderboard / digest
 * reflect real conversations instead of only seed data.
 */
export async function recomputeWeeklyEngagement(
  db: TenantDb,
  userId: string,
  week = weekMondayUTC(),
): Promise<void> {
  const weekStart = new Date(`${week}T00:00:00.000Z`);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Feedback the user authored this week (their engagement as a reviewer).
  const authored = await db
    .select({ score: feedbackEntries.engagementScore })
    .from(feedbackEntries)
    .where(
      and(
        eq(feedbackEntries.reviewerId, userId),
        gte(feedbackEntries.createdAt, weekStart),
        lt(feedbackEntries.createdAt, weekEnd),
      ),
    );

  // Completed self-reflections this week.
  const reflections = await db
    .select({ score: selfReflections.engagementScore })
    .from(selfReflections)
    .where(
      and(
        eq(selfReflections.userId, userId),
        eq(selfReflections.weekStarting, week),
        eq(selfReflections.status, "completed"),
      ),
    );

  const scores = [
    ...authored.map((r) => r.score ?? 0),
    ...reflections.map((r) => r.score ?? 0),
  ];
  const interactionsCompleted = authored.length + reflections.length;
  const averageQualityScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

  await db
    .insert(engagementScores)
    .values({
      userId,
      weekStarting: week,
      interactionsCompleted,
      averageQualityScore,
    })
    .onConflictDoUpdate({
      target: [engagementScores.userId, engagementScores.weekStarting],
      set: {
        interactionsCompleted,
        averageQualityScore,
        // Bounded 0..100 response rate proxy: progress toward the weekly target.
        responseRate: sql`LEAST(100, ${interactionsCompleted} * 100 / GREATEST(${engagementScores.interactionsTarget}, 1))`,
      },
    });
}
