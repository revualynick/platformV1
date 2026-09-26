import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import { conversations, conversationMessages, conversationThemeOutcomes } from "@revualy/db";

/**
 * Don't badger people (Nick, 2026-09-26). Checked by the scheduler before
 * it books a check-in, on top of the weekly quota:
 *
 *  - at least MIN_GAP_DAYS between any two check-ins, whatever the quota
 *  - someone who gave a lot in a check-in this week is not asked again
 *    until next week ("a lot": RICH_ANSWERED_THEMES themes answered, or
 *    RICH_WORDS words of their own)
 */

export const MIN_GAP_DAYS = 3;
export const RICH_ANSWERED_THEMES = 2;
export const RICH_WORDS = 80;
const DAY_MS = 24 * 60 * 60 * 1000;

export type HoldReason = "too_soon" | "gave_a_lot_this_week";

/** Whether a finished check-in was rich, from its theme outcomes and the person's own words. */
export function isRich(answeredThemes: number, words: number): boolean {
  return answeredThemes >= RICH_ANSWERED_THEMES || words >= RICH_WORDS;
}

/**
 * A reason to hold off contacting this person at `sendAt`, or null.
 * `weekStart` is the start of the scheduling week.
 */
export async function contactHold(
  db: TenantDb,
  userId: string,
  sendAt: Date,
  weekStart: Date,
): Promise<HoldReason | null> {
  const recent = await db
    .select({ id: conversations.id, initiatedAt: conversations.initiatedAt, createdAt: conversations.createdAt })
    .from(conversations)
    .where(and(eq(conversations.reviewerId, userId), gte(conversations.createdAt, new Date(Math.min(weekStart.getTime(), sendAt.getTime() - MIN_GAP_DAYS * DAY_MS)))))
    .orderBy(desc(conversations.createdAt));
  // Every conversation counts, including ones the person started on the
  // web: a rich reflection they wrote themselves is contact too.
  if (!recent.length) return null;

  const last = recent[0].initiatedAt ?? recent[0].createdAt;
  if (sendAt.getTime() - last.getTime() < MIN_GAP_DAYS * DAY_MS) return "too_soon";

  const thisWeek = recent.filter((c) => (c.initiatedAt ?? c.createdAt) >= weekStart).map((c) => c.id);
  if (!thisWeek.length) return null;

  const [answered, userMessages] = await Promise.all([
    db
      .select({ conversationId: conversationThemeOutcomes.conversationId })
      .from(conversationThemeOutcomes)
      .where(and(inArray(conversationThemeOutcomes.conversationId, thisWeek), eq(conversationThemeOutcomes.outcome, "answered"))),
    db
      .select({ conversationId: conversationMessages.conversationId, content: conversationMessages.content })
      .from(conversationMessages)
      .where(and(inArray(conversationMessages.conversationId, thisWeek), eq(conversationMessages.role, "user"))),
  ]);
  for (const id of thisWeek) {
    const themes = answered.filter((a) => a.conversationId === id).length;
    const words = userMessages
      .filter((m) => m.conversationId === id)
      .reduce((n, m) => n + m.content.split(/\s+/).filter(Boolean).length, 0);
    if (isRich(themes, words)) return "gave_a_lot_this_week";
  }
  return null;
}
