import { eq, desc } from "drizzle-orm";
import { selfReflections } from "../schema/tenant.js";
import type { TenantDb } from "../tenant.js";

export async function getReflections(
  db: TenantDb,
  userId: string,
  limit = 12,
) {
  return db
    .select()
    .from(selfReflections)
    .where(eq(selfReflections.userId, userId))
    .orderBy(desc(selfReflections.weekStarting))
    .limit(limit);
}

export async function getReflectionStats(db: TenantDb, userId: string) {
  const rows = await db
    .select()
    .from(selfReflections)
    .where(eq(selfReflections.userId, userId))
    .orderBy(desc(selfReflections.weekStarting))
    .limit(200);

  const totalCompleted = rows.filter((r) => r.status === "completed").length;

  const scoresWithValues = rows
    .map((r) => r.engagementScore)
    .filter((s): s is number => s !== null);

  const avgEngagementScore =
    scoresWithValues.length > 0
      ? Math.round(
          scoresWithValues.reduce((a, b) => a + b, 0) /
            scoresWithValues.length,
        )
      : null;

  // Streak: consecutive completed weeks from most recent
  // Skip pending rows (current week not yet due) so they don't break the streak
  let currentStreak = 0;
  for (const r of rows) {
    if (r.status === "completed") {
      currentStreak++;
    } else if (r.status === "pending") {
      continue;
    } else {
      break;
    }
  }

  // Top mood
  const moodCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.mood) {
      moodCounts.set(r.mood, (moodCounts.get(r.mood) ?? 0) + 1);
    }
  }
  let topMood: string | null = null;
  let topCount = 0;
  for (const [mood, count] of moodCounts) {
    if (count > topCount) {
      topMood = mood;
      topCount = count;
    }
  }

  return { totalCompleted, avgEngagementScore, currentStreak, topMood };
}
