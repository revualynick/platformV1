import { and, eq, gte, lt, sql, exists } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import { feedbackEntries, selfReflections, engagementScores, users, userPlatformIdentities } from "@revualy/db";

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
  const interactionsTarget = await weeklyTargetFor(db, userId);
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
      interactionsTarget,
      averageQualityScore,
      responseRate: responseRateFor(interactionsCompleted, interactionsTarget),
    })
    .onConflictDoUpdate({
      target: [engagementScores.userId, engagementScores.weekStarting],
      set: {
        interactionsCompleted,
        interactionsTarget,
        averageQualityScore,
        responseRate: responseRateFor(interactionsCompleted, interactionsTarget),
      },
    });
}

/** Default weekly interactions; must match the scheduler's default. */
export const DEFAULT_WEEKLY_TARGET = 2;

/** The user's own weekly target (preferences), the scheduler's source of truth. */
export function weeklyTarget(preferences: unknown): number {
  const t = (preferences as { weeklyInteractionTarget?: unknown } | null)?.weeklyInteractionTarget;
  return typeof t === "number" && Number.isInteger(t) && t > 0 ? t : DEFAULT_WEEKLY_TARGET;
}

async function weeklyTargetFor(db: TenantDb, userId: string): Promise<number> {
  const [u] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId));
  return weeklyTarget(u?.preferences);
}

/** Bounded 0..100 progress toward the weekly target. */
function responseRateFor(completed: number, target: number): number {
  return Math.min(100, Math.floor((completed * 100) / Math.max(target, 1)));
}

export interface NudgeTarget {
  userId: string;
  pending: number;
  target: number;
}

/**
 * Who to nudge this week: active, onboarded people behind their own weekly
 * target, including those with no activity at all (no engagement row yet,
 * previously missed). Excludes people who paused check-ins and people the
 * bot cannot reach on the tenant's chat platform, since the nudge asks them
 * to answer check-ins they would never receive.
 */
export async function selectNudgeTargets(
  db: TenantDb,
  week: string,
  platform: string,
): Promise<NudgeTarget[]> {
  const rows = await db
    .select({
      userId: users.id,
      preferences: users.preferences,
      completed: engagementScores.interactionsCompleted,
    })
    .from(users)
    .leftJoin(
      engagementScores,
      and(eq(engagementScores.userId, users.id), eq(engagementScores.weekStarting, week)),
    )
    .where(
      and(
        eq(users.isActive, true),
        eq(users.onboardingCompleted, true),
        exists(
          db
            .select({ one: sql`1` })
            .from(userPlatformIdentities)
            .where(
              and(
                eq(userPlatformIdentities.userId, users.id),
                eq(userPlatformIdentities.platform, platform),
                eq(userPlatformIdentities.status, "reachable"),
              ),
            ),
        ),
      ),
    );

  return rows
    .filter((r) => !(r.preferences as { chatPaused?: boolean } | null)?.chatPaused)
    .map((r) => {
      const target = weeklyTarget(r.preferences);
      return { userId: r.userId, target, pending: target - (r.completed ?? 0) };
    })
    .filter((r) => r.pending > 0);
}
