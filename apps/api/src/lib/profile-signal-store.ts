import { eq } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import { behavioralSignals, feedbackEntries } from "@revualy/db";
import { extractProfileSignals } from "./profile-signal-extractor.js";

/**
 * Store the behavioural signals for one feedback entry, replacing any from
 * an earlier analysis of it: a re-analysed entry (a late addition) must not
 * count the same conversation twice. Returns how many were stored, or null
 * if the entry no longer exists.
 */
export async function replaceProfileSignals(db: TenantDb, feedbackEntryId: string): Promise<number | null> {
  const [entry] = await db.select().from(feedbackEntries).where(eq(feedbackEntries.id, feedbackEntryId));
  if (!entry) return null;

  const signals = extractProfileSignals({
    text: entry.rawContent,
    sentiment: entry.sentiment,
    wordCount: entry.wordCount,
    hasSpecificExamples: entry.hasSpecificExamples,
    interactionType: entry.interactionType,
  });

  await db.transaction(async (tx) => {
    await tx.delete(behavioralSignals).where(eq(behavioralSignals.sourceId, entry.id));
    if (signals.length === 0) return;
    await tx.insert(behavioralSignals).values(
      signals.map((s) => ({
        userId: entry.reviewerId,
        framework: s.framework,
        dimension: s.dimension,
        value: s.value,
        confidence: s.confidence,
        sourceType: entry.interactionType,
        sourceId: entry.id,
      })),
    );
  });
  return signals.length;
}
