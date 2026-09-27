import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getTenantDb, users, engagementScores, feedbackEntries, selfReflections } from "@revualy/db";
import { recomputeWeeklyEngagement, weekMondayUTC } from "../lib/engagement-aggregation.js";
import { tenantReviewerRef } from "../lib/pseudonym.js";

/** engagement_scores.streak: consecutive weeks meeting the weekly target. */

const db = getTenantDb(process.env.ORG_ID!, process.env.DATABASE_URL!);
async function dbReachable(): Promise<boolean> {
  const timeout = new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 3000));
  try {
    await Promise.race([db.execute(sql`select 1`), timeout]);
    return true;
  } catch {
    return false;
  }
}
const dbUp = await dbReachable();

describe.skipIf(!dbUp)("engagement streak (integration)", () => {
  const tag = crypto.randomUUID().slice(0, 8);
  const ids = { keeper: crypto.randomUUID(), misser: crypto.randomUUID(), subject: crypto.randomUUID() };
  const week = weekMondayUTC();
  const prevWeek = new Date(new Date(`${week}T00:00:00Z`).getTime() - 7 * 86400000).toISOString().slice(0, 10);

  beforeAll(async () => {
    await db.insert(users).values([
      { id: ids.keeper, email: `keeper-${tag}@test.local`, name: "Keeper", role: "employee", preferences: { weeklyInteractionTarget: 2 } },
      { id: ids.misser, email: `misser-${tag}@test.local`, name: "Misser", role: "employee", preferences: { weeklyInteractionTarget: 2 } },
      { id: ids.subject, email: `subject-${tag}@test.local`, name: "Subject", role: "employee" },
    ]);
    // Both had a 3-week streak last week.
    await db.insert(engagementScores).values(
      [ids.keeper, ids.misser].map((userId) => ({
        userId, weekStarting: prevWeek, interactionsCompleted: 2, interactionsTarget: 2, averageQualityScore: 70, responseRate: 1, streak: 3,
      })),
    );
    // Keeper meets this week's target of 2: one peer review and one reflection.
    await db.insert(feedbackEntries).values({
      reviewerRef: tenantReviewerRef(ids.keeper), subjectId: ids.subject, interactionType: "peer_review",
      rawContent: "fine", engagementScore: 80,
    });
    await db.insert(selfReflections).values({ userId: ids.keeper, weekStarting: week, status: "completed", engagementScore: 75, completedAt: new Date() });
    // Misser does one of two.
    await db.insert(selfReflections).values({ userId: ids.misser, weekStarting: week, status: "completed", engagementScore: 60, completedAt: new Date() });
  });

  afterAll(async () => {
    const all = Object.values(ids);
    await db.delete(feedbackEntries).where(eq(feedbackEntries.subjectId, ids.subject));
    await db.delete(selfReflections).where(inArray(selfReflections.userId, all));
    await db.delete(engagementScores).where(inArray(engagementScores.userId, all));
    await db.delete(users).where(inArray(users.id, all));
  });

  const streakOf = async (userId: string) =>
    (await db.select({ s: engagementScores.streak }).from(engagementScores)
      .where(and(eq(engagementScores.userId, userId), eq(engagementScores.weekStarting, week))))[0]?.s;

  it("continues the streak when this week's target is met", async () => {
    await recomputeWeeklyEngagement(db, ids.keeper, week);
    expect(await streakOf(ids.keeper)).toBe(4);
  });

  it("carries the streak while this week is still open and its target not yet met", async () => {
    // Review finding 2026-09-28: it used to show 0 until the target was met.
    await recomputeWeeklyEngagement(db, ids.misser, week);
    expect(await streakOf(ids.misser)).toBe(3);
  });

  it("resets the streak for a finished week that missed its target", async () => {
    // Last week, recomputed from what's actually there for the misser (nothing): below target, and over.
    await recomputeWeeklyEngagement(db, ids.misser, prevWeek);
    const [row] = await db.select({ s: engagementScores.streak }).from(engagementScores)
      .where(and(eq(engagementScores.userId, ids.misser), eq(engagementScores.weekStarting, prevWeek)));
    expect(row.s).toBe(0);
    // And this week no longer carries a streak from it.
    await recomputeWeeklyEngagement(db, ids.misser, week);
    expect(await streakOf(ids.misser)).toBe(0);
  });

  it("recomputing the same week doesn't double-count", async () => {
    await recomputeWeeklyEngagement(db, ids.keeper, week);
    expect(await streakOf(ids.keeper)).toBe(4);
  });
});
