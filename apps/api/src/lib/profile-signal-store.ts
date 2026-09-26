import { eq } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import { behavioralSignals, conversations, feedbackEntries } from "@revualy/db";
import { extractProfileSignals } from "./profile-signal-extractor.js";

/**
 * Store the behavioural signals for one feedback entry, replacing any from
 * an earlier analysis of it: a re-analysed entry (a late addition) must not
 * count the same conversation twice. Returns how many were stored, or null
 * if the entry no longer exists.
 */
export async function replaceProfileSignals(db: TenantDb, feedbackEntryId: string): Promise<number | null> {
  const [entry] = await db.select().from(feedbackEntries).where(eq(feedbackEntries.id, feedbackEntryId));
  if (!entry?.conversationId) return null;
  // The signals are about the reviewer's own writing, so they need the
  // reviewer's id, which only the (short-lived, tier D) conversation
  // holds. They point at the conversation, never the feedback entry: a
  // signal row naming the reviewer and the entry would undo the pseudonym.
  // Once the conversation is deleted after its retention window, nothing
  // links them.
  const [conversation] = await db
    .select({ reviewerId: conversations.reviewerId })
    .from(conversations)
    .where(eq(conversations.id, entry.conversationId));
  if (!conversation) return null;
  const sourceId = entry.conversationId;

  const signals = extractProfileSignals({
    text: entry.rawContent,
    sentiment: entry.sentiment,
    wordCount: entry.wordCount,
    hasSpecificExamples: entry.hasSpecificExamples,
    interactionType: entry.interactionType,
  });

  await db.transaction(async (tx) => {
    await tx.delete(behavioralSignals).where(eq(behavioralSignals.sourceId, sourceId));
    if (signals.length === 0) return;
    await tx.insert(behavioralSignals).values(
      signals.map((s) => ({
        userId: conversation.reviewerId,
        framework: s.framework,
        dimension: s.dimension,
        value: s.value,
        confidence: s.confidence,
        sourceType: entry.interactionType,
        sourceId,
      })),
    );
  });
  return signals.length;
}
