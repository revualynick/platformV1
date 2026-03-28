import { eq, desc, inArray } from "drizzle-orm";
import {
  feedbackEntries,
  feedbackValueScores,
  escalations,
  users,
} from "../schema/tenant.js";
import type { TenantDb } from "../tenant.js";

export async function getFeedbackForSubject(
  db: TenantDb,
  subjectId: string,
  limit = 50,
) {
  const entries = await db
    .select()
    .from(feedbackEntries)
    .where(eq(feedbackEntries.subjectId, subjectId))
    .orderBy(desc(feedbackEntries.createdAt))
    .limit(limit);

  const entryIds = entries.map((e) => e.id);
  const allScores =
    entryIds.length > 0
      ? await db
          .select()
          .from(feedbackValueScores)
          .where(inArray(feedbackValueScores.feedbackEntryId, entryIds))
      : [];

  const scoresByEntry = new Map<string, typeof allScores>();
  allScores.forEach((s) => {
    const list = scoresByEntry.get(s.feedbackEntryId) ?? [];
    list.push(s);
    scoresByEntry.set(s.feedbackEntryId, list);
  });

  return entries.map((e) => ({
    ...e,
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
