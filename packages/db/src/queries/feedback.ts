import { eq, desc, inArray } from "drizzle-orm";
import {
  feedbackEntries,
  feedbackValueScores,
  escalations,
  users,
} from "../schema/tenant.js";
import type { TenantDb } from "../tenant.js";
import { computeReleases, stripMeetingReferences } from "@revualy/shared";

/**
 * Which of these subjects' peer feedback entries are released, as of `now`
 * (entry id -> release date). Tier A: batches of at least
 * MIN_DISTINCT_REVIEWERS distinct reviewers, on the fortnightly boundary.
 */
export async function getReleasedFeedbackIds(
  db: TenantDb,
  subjectIds: string[],
  now: Date = new Date(),
): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (subjectIds.length === 0) return out;
  const rows = await db
    .select({
      id: feedbackEntries.id,
      subjectId: feedbackEntries.subjectId,
      reviewerRef: feedbackEntries.reviewerRef,
      createdAt: feedbackEntries.createdAt,
    })
    .from(feedbackEntries)
    .where(inArray(feedbackEntries.subjectId, subjectIds));
  const bySubject = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = bySubject.get(r.subjectId) ?? [];
    list.push(r);
    bySubject.set(r.subjectId, list);
  }
  for (const list of bySubject.values()) {
    for (const [id, at] of computeReleases(list, now)) out.set(id, at);
  }
  return out;
}

/**
 * Subject- and manager-facing peer feedback: released entries only, as
 * paraphrased summaries with meeting references stripped, dated by release
 * (never by when they were written), no raw text, no value-score evidence
 * (it quotes), no reviewer reference. Ordered by release, then arbitrarily
 * within a batch so the order does not give the writing order away.
 */
export async function getFeedbackForSubject(
  db: TenantDb,
  subjectId: string,
  limit = 50,
  now: Date = new Date(),
) {
  const releases = await getReleasedFeedbackIds(db, [subjectId], now);
  const ids = [...releases.keys()];
  if (ids.length === 0) return [];

  const entries = await db
    .select({
      id: feedbackEntries.id,
      subjectId: feedbackEntries.subjectId,
      interactionType: feedbackEntries.interactionType,
      aiSummary: feedbackEntries.aiSummary,
      sentiment: feedbackEntries.sentiment,
      engagementScore: feedbackEntries.engagementScore,
      hasSpecificExamples: feedbackEntries.hasSpecificExamples,
      isPartial: feedbackEntries.isPartial,
    })
    .from(feedbackEntries)
    .where(inArray(feedbackEntries.id, ids));

  const released = entries
    .map((e) => ({ ...e, releasedAt: releases.get(e.id)! }))
    .sort((a, b) => b.releasedAt.getTime() - a.releasedAt.getTime() || a.id.localeCompare(b.id))
    .slice(0, limit);

  const entryIds = released.map((e) => e.id);
  const allScores =
    entryIds.length > 0
      ? await db
          .select({
            feedbackEntryId: feedbackValueScores.feedbackEntryId,
            coreValueId: feedbackValueScores.coreValueId,
            score: feedbackValueScores.score,
          })
          .from(feedbackValueScores)
          .where(inArray(feedbackValueScores.feedbackEntryId, entryIds))
      : [];

  const scoresByEntry = new Map<string, typeof allScores>();
  allScores.forEach((s) => {
    const list = scoresByEntry.get(s.feedbackEntryId) ?? [];
    list.push(s);
    scoresByEntry.set(s.feedbackEntryId, list);
  });

  return released.map((e) => ({
    ...e,
    aiSummary: stripMeetingReferences(e.aiSummary),
    valueScores: scoresByEntry.get(e.id) ?? [],
  }));
}

export async function getFlaggedItemsForReports(
  db: TenantDb,
  reportIds: string[],
) {
  if (reportIds.length === 0) return [];

  return db
    .select({
      escalation: escalations,
      feedback: feedbackEntries,
      subjectName: users.name,
    })
    .from(escalations)
    .leftJoin(
      feedbackEntries,
      eq(escalations.feedbackEntryId, feedbackEntries.id),
    )
    .leftJoin(users, eq(escalations.subjectId, users.id))
    .where(inArray(escalations.subjectId, reportIds))
    .orderBy(desc(escalations.createdAt))
    .limit(200);
}

export async function getAllFlaggedItems(db: TenantDb) {
  return db
    .select({
      escalation: escalations,
      feedback: feedbackEntries,
    })
    .from(escalations)
    .leftJoin(
      feedbackEntries,
      eq(escalations.feedbackEntryId, feedbackEntries.id),
    )
    .orderBy(desc(escalations.createdAt))
    .limit(500);
}
