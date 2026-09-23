import { eq, and, desc, inArray, sql } from "drizzle-orm";
import {
  threeSixtyReviews,
  threeSixtyResponses,
  pulseCheckTriggers,
  users,
} from "../schema/tenant.js";
import type { TenantDb } from "../tenant.js";

// ── 360 Reviews ────────────────────────────────────

/**
 * Returns completed 360 reviews where the given user is the subject,
 * ordered most-recent first. Includes the per-reviewer response rows.
 */
export async function getCompletedThreeSixtyReviews(
  db: TenantDb,
  subjectId: string,
  limit = 20,
) {
  const reviews = await db
    .select()
    .from(threeSixtyReviews)
    // Completed only: in-progress reviews have no aggregate yet and were
    // being shown (first, since NULL completed_at sorts first) as "Completed".
    .where(and(eq(threeSixtyReviews.subjectId, subjectId), eq(threeSixtyReviews.status, "completed")))
    .orderBy(sql`${threeSixtyReviews.completedAt} desc nulls last`)
    .limit(limit);

  if (reviews.length === 0) return [];

  const reviewIds = reviews.map((r) => r.id);
  const responses = await db
    .select()
    .from(threeSixtyResponses)
    .where(inArray(threeSixtyResponses.reviewId, reviewIds));

  const responsesByReview = new Map<string, typeof responses>();
  for (const resp of responses) {
    const list = responsesByReview.get(resp.reviewId) ?? [];
    list.push(resp);
    responsesByReview.set(resp.reviewId, list);
  }

  return reviews.map((r) => ({
    ...r,
    responses: responsesByReview.get(r.id) ?? [],
  }));
}

// ── Pulse Check Triggers ───────────────────────────

/**
 * Returns recent pulse check triggers for a set of report user IDs.
 *
 * The pipeline writes `sourceRef = userId` when `sourceType = "sentiment_decline"`,
 * so we filter on that contract to resolve triggers back to specific users.
 */
export async function getPulseTriggersForReports(
  db: TenantDb,
  reportIds: string[],
  limit = 50,
) {
  if (reportIds.length === 0) return [];

  const triggers = await db
    .select()
    .from(pulseCheckTriggers)
    .where(inArray(pulseCheckTriggers.sourceRef, reportIds))
    .orderBy(desc(pulseCheckTriggers.createdAt))
    .limit(limit);

  if (triggers.length === 0) return [];

  // Resolve user names for the sourceRef IDs
  const subjectIds = [
    ...new Set(triggers.map((t) => t.sourceRef).filter(Boolean)),
  ] as string[];

  const nameMap = new Map<string, string>();
  if (subjectIds.length > 0) {
    const userRows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, subjectIds));
    for (const u of userRows) {
      nameMap.set(u.id, u.name);
    }
  }

  return triggers.map((t) => ({
    ...t,
    subjectName: nameMap.get(t.sourceRef) ?? "Team Member",
  }));
}
