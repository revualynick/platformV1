import { and, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Queue } from "bullmq";
import type { TenantDb } from "@revualy/db";
import { checkinJobs, conversations, conversationMessages, inboundMessages, interactionSchedule } from "@revualy/db";
import { ANCHOR_LOOKBACK_DAYS } from "./meeting-anchor.js";
import { buildJobId } from "./job-ids.js";
import { expireTickets } from "./tickets/prepare.js";
import {
  OPEN_STATUSES,
  deliverOutbox,
  markIncomplete,
  queueAnalysis,
  turnJobId,
  type OrchestratorDeps,
} from "./conversation-orchestrator.js";

/**
 * The sweeper (C3 plan, phase 4): the backstop for work that got stuck.
 * Runs every few minutes; each step is idempotent and bounded, and a
 * failure in one item never stops the rest.
 *
 *  1. stale:       open conversations quiet for 24 h -> `incomplete`,
 *                  analysed as partial (silently, no extra message)
 *  2. undelivered: bot messages not sent after a few minutes -> re-sent
 *  3. inbound:     stored messages never processed -> re-queued
 *  4. unanswered:  a user message with no bot reply after a few minutes
 *                  (its turn job gave up) -> turn re-queued
 *  5. analysis:    finished conversations with answers but no analysis
 *                  result -> re-queued
 *  6. check-in jobs: claimed by the scheduler but never used (the initiate
 *                  job failed for good), past their expiry -> expired
 *  7. retention:   peer conversations (tier D, named) analysed more than
 *                  DELIVERY_RETENTION_DAYS ago -> deleted with their
 *                  transcript, inbound copies and schedule rows; used
 *                  check-in jobs past the anchor lookback -> deleted. The
 *                  feedback stays, under the reviewer's pseudonym only.
 *  8. tickets:     any ticket past its expiry (prepared but never used,
 *                  stuck open, done but never written back) -> expired,
 *                  context wiped
 *
 * Re-queued jobs get an hourly job id suffix: at most one retry per item
 * per hour (the original job id may still sit in BullMQ's failed set,
 * which would silently swallow a re-add), and each window is bounded so a
 * permanently failing item is not retried for ever.
 */

export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
export const STUCK_AFTER_MS = 5 * 60 * 1000;
/** How far back re-queueing reaches; older stuck work is left for a person. */
export const RETRY_WINDOW_MS = 48 * 60 * 60 * 1000;
/**
 * How long a named peer transcript is kept after the conversation ends
 * (privacy design, open question 4): long enough for late additions and
 * analysis retries, then only the pseudonymous feedback remains.
 */
export const DELIVERY_RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Bounded per sweep; the rest go next time. */
const PURGE_BATCH = 200;

export interface SweeperDeps extends OrchestratorDeps {
  conversationQueue: Queue;
}

export interface SweepResult {
  markedIncomplete: number;
  resent: number;
  inboundRequeued: number;
  turnsRequeued: number;
  analysisRequeued: number;
  jobsExpired: number;
  conversationsPurged: number;
  jobsPurged: number;
  ticketsExpired: number;
  errors: number;
}

type Logger = Pick<Console, "error" | "warn">;

export async function runSweep(
  db: TenantDb,
  deps: SweeperDeps,
  now: Date = new Date(),
  logger: Logger = console,
): Promise<SweepResult> {
  const result: SweepResult = {
    markedIncomplete: 0,
    resent: 0,
    inboundRequeued: 0,
    turnsRequeued: 0,
    analysisRequeued: 0,
    jobsExpired: 0,
    conversationsPurged: 0,
    jobsPurged: 0,
    ticketsExpired: 0,
    errors: 0,
  };
  const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);
  const stuckBefore = new Date(now.getTime() - STUCK_AFTER_MS);
  const windowStart = new Date(now.getTime() - RETRY_WINDOW_MS);
  const bucket = `sweep-${Math.floor(now.getTime() / 3_600_000)}`;
  const orgId = process.env.ORG_ID ?? "dev-org";

  const each = async <T>(items: T[], step: string, fn: (item: T) => Promise<boolean | void>) => {
    let n = 0;
    for (const item of items) {
      try {
        if ((await fn(item)) !== false) n++;
      } catch (err) {
        result.errors++;
        logger.error(`[Sweeper] ${step} failed:`, err);
      }
    }
    return n;
  };

  // 1. Stale open conversations.
  const stale = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(inArray(conversations.status, [...OPEN_STATUSES]), lt(conversations.lastActivityAt, staleBefore)));
  result.markedIncomplete = await each(stale, "mark incomplete", (c) => markIncomplete(db, deps, c.id));

  // 2. Undelivered bot messages. Web conversations are answered in the HTTP
  // response and have no adapter, so they are not re-sent.
  const undelivered = await db
    .selectDistinct({ conversationId: conversationMessages.conversationId })
    .from(conversationMessages)
    .innerJoin(conversations, eq(conversations.id, conversationMessages.conversationId))
    .where(
      and(
        eq(conversationMessages.role, "assistant"),
        isNull(conversationMessages.deliveredAt),
        lt(conversationMessages.createdAt, stuckBefore),
        sql`${conversations.platform} <> 'web'`,
      ),
    );
  await each(undelivered, "re-send", async (m) => {
    result.resent += await deliverOutbox(db, deps, m.conversationId);
  });

  // 3. Inbound messages never processed.
  const pending = await db
    .select({ id: inboundMessages.id })
    .from(inboundMessages)
    .where(
      and(
        eq(inboundMessages.status, "pending"),
        lt(inboundMessages.receivedAt, stuckBefore),
        gt(inboundMessages.receivedAt, windowStart),
      ),
    );
  result.inboundRequeued = await each(pending, "re-queue inbound", async (m) => {
    await deps.conversationQueue.add(
      "inbound",
      { type: "inbound", orgId, inboundId: m.id },
      { jobId: buildJobId("inbound", m.id, bucket) },
    );
  });

  // 4. Open conversations whose newest message is an unanswered user message.
  const unanswered = (await db.execute(sql`
    SELECT c.id AS conversation_id, m.seq
    FROM conversations c
    JOIN LATERAL (
      SELECT role, seq, created_at FROM conversation_messages
      WHERE conversation_id = c.id ORDER BY seq DESC LIMIT 1
    ) m ON true
    WHERE c.status IN ('initiated', 'in_progress')
      AND c.platform <> 'web'
      AND m.role = 'user'
      AND m.created_at < ${ts(stuckBefore)}
      AND m.created_at > ${ts(windowStart)}
  `)) as unknown as Array<{ conversation_id: string; seq: string | number }>;
  result.turnsRequeued = await each(unanswered, "re-queue turn", async (row) => {
    await deps.conversationQueue.add(
      "turn",
      { type: "turn", orgId, conversationId: row.conversation_id },
      { jobId: buildJobId(turnJobId(row.conversation_id, Number(row.seq)), bucket) },
    );
  });

  // 5. Finished conversations with answers but no analysis result
  // (feedback entry, or a reflection for self-reflections).
  const unanalysed = (await db.execute(sql`
    SELECT c.id FROM conversations c
    WHERE c.status IN ('closed', 'incomplete')
      AND c.closed_at < ${ts(stuckBefore)}
      AND c.closed_at > ${ts(windowStart)}
      AND EXISTS (SELECT 1 FROM conversation_messages m WHERE m.conversation_id = c.id AND m.role = 'user')
      AND NOT EXISTS (SELECT 1 FROM feedback_entries f WHERE f.conversation_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM self_reflections r WHERE r.conversation_id = c.id)
      AND c.phase <> 'support'
      AND NOT (c.off_script_streak >= 3 AND NOT EXISTS (SELECT 1 FROM conversation_theme_outcomes o WHERE o.conversation_id = c.id AND o.outcome <> 'unanswered'))
  `)) as unknown as Array<{ id: string }>;
  result.analysisRequeued = await each(unanalysed, "re-queue analysis", (c) => queueAnalysis(deps, c.id, bucket));

  // 6. Calendar-model jobs stuck as "scheduled". Harmless beyond losing that
  // meeting as a basis, so expiring them at their expiry date is enough.
  const expired = await db
    .update(checkinJobs)
    .set({ status: "expired" })
    .where(and(eq(checkinJobs.status, "scheduled"), lt(checkinJobs.expiresAt, now)))
    .returning({ id: checkinJobs.id });
  result.jobsExpired = expired.length;

  // 7. Retention. A peer conversation is purgeable once it has ended, its
  // end is older than the window, and it was analysed (or had nothing to
  // analyse). Unanalysed conversations with answers are kept: deleting them
  // would lose feedback, and they already show up as stuck work.
  // Self-reflections are tier B and keep their conversations.
  const retentionCutoff = new Date(now.getTime() - DELIVERY_RETENTION_DAYS * DAY_MS);
  // A conversation that ended for a support concern is never analysed, so
  // it is purgeable on age alone, self-reflections included: the disclosure
  // isn't kept. The same for one that ended on off-script replies without a
  // real answer: there is nothing in it to keep.
  const purgeable = (await db.execute(sql`
    SELECT c.id FROM conversations c
    WHERE c.status NOT IN ('scheduled', 'initiated', 'in_progress', 'closing')
      AND COALESCE(c.closed_at, c.last_activity_at, c.created_at) < ${ts(retentionCutoff)}
      AND (
        c.phase = 'support'
        OR (c.off_script_streak >= 3 AND NOT EXISTS (SELECT 1 FROM conversation_theme_outcomes o WHERE o.conversation_id = c.id AND o.outcome <> 'unanswered'))
        OR (
          c.interaction_type <> 'self_reflection'
          AND (
            EXISTS (SELECT 1 FROM feedback_entries f WHERE f.conversation_id = c.id)
            OR NOT EXISTS (SELECT 1 FROM conversation_messages m WHERE m.conversation_id = c.id AND m.role = 'user')
          )
        )
      )
    LIMIT ${PURGE_BATCH}
  `)) as unknown as Array<{ id: string }>;
  result.conversationsPurged = await each(purgeable, "purge conversation", (c) => purgeConversation(db, c.id));

  // Used check-in jobs name who was asked about whom. Once the meeting is
  // outside the anchor lookback it can't be proposed again, so the unique
  // (reviewer, subject, meeting) guard is no longer needed either.
  const jobsBefore = new Date(retentionCutoff.getTime() - ANCHOR_LOOKBACK_DAYS * DAY_MS);
  const purgedJobs = await db
    .delete(checkinJobs)
    .where(and(eq(checkinJobs.status, "used"), lt(checkinJobs.createdAt, jobsBefore)))
    .returning({ id: checkinJobs.id });
  result.jobsPurged = purgedJobs.length;

  // 8. Tickets past their expiry, whatever state they were stuck in.
  result.ticketsExpired = await expireTickets(db, now);

  return result;
}

/**
 * Delete one conversation and every named copy of it: the stored inbound
 * messages, its schedule row, its messages and theme outcomes (cascade).
 * Feedback entries, 360 responses and pulse triggers keep their rows with
 * the conversation link set to null.
 */
export async function purgeConversation(db: TenantDb, conversationId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(inboundMessages).where(eq(inboundMessages.conversationId, conversationId));
    await tx.delete(interactionSchedule).where(eq(interactionSchedule.conversationId, conversationId));
    await tx.delete(conversations).where(eq(conversations.id, conversationId));
  });
}

/** Raw `sql` parameters must be strings: the driver rejects a Date there. */
function ts(d: Date) {
  return sql`${d.toISOString()}::timestamptz`;
}
