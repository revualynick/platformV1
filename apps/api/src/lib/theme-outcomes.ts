import { sql } from "drizzle-orm";
import type { TenantDb, ThemeOutcome } from "@revualy/db";
import { conversationThemeOutcomes } from "@revualy/db";

/**
 * Per-theme outcomes (C3 plan, phase 5). Written inside the same
 * transaction as the turn that caused them, so an abandoned or lost turn
 * leaves no trace. All writes are idempotent.
 */

type Tx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];
type Writer = TenantDb | Tx;

export interface OutcomeConversation {
  id: string;
  reviewerId: string;
  subjectId: string;
  interactionType: string;
  selectedThemeIds: string[];
}

function base(conv: OutcomeConversation, themeId: string) {
  return {
    conversationId: conv.id,
    themeId,
    reviewerId: conv.reviewerId,
    subjectId: conv.interactionType === "self_reflection" ? null : conv.subjectId,
    interactionType: conv.interactionType,
  };
}

/** A theme was asked for the first time. */
export async function recordThemeAsked(db: Writer, conv: OutcomeConversation, themeId: string, questionText: string) {
  await db
    .insert(conversationThemeOutcomes)
    .values({ ...base(conv, themeId), questionText })
    .onConflictDoNothing();
}

/** The reply to a theme's question was judged. */
export async function recordThemeJudged(
  db: Writer,
  conv: OutcomeConversation,
  themeId: string,
  judgement: { outcome: Exclude<ThemeOutcome, "unanswered">; followUpCount: number; judgedBy: "llm" | "fallback" },
) {
  const set = {
    outcome: judgement.outcome,
    followUpCount: judgement.followUpCount,
    judgedBy: judgement.judgedBy,
    updatedAt: sql`clock_timestamp()`,
  };
  await db
    .insert(conversationThemeOutcomes)
    .values({ ...base(conv, themeId), ...set })
    .onConflictDoUpdate({
      target: [conversationThemeOutcomes.conversationId, conversationThemeOutcomes.themeId],
      set,
    });
}

/** The conversation ended: every selected theme without a row is unanswered. */
export async function recordUnreachedThemes(db: Writer, conv: OutcomeConversation) {
  if (conv.selectedThemeIds.length === 0) return;
  await db
    .insert(conversationThemeOutcomes)
    .values(conv.selectedThemeIds.map((themeId) => base(conv, themeId)))
    .onConflictDoNothing();
}
