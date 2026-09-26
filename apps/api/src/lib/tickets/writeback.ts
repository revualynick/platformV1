import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { TenantDb, TicketType } from "@revualy/db";
import { conversationMessages, tickets } from "@revualy/db";

/**
 * Write-back (job side): when a ticket is done, code builds its result from
 * the ticket's own turns, validates it against the ticket type's schema,
 * and writes only the fields that type may write. Peer reviews go in under
 * the reviewer's pseudonym, self data under the plain id.
 *
 * Today the analysis pipeline (analysis-pipeline.ts) still writes
 * feedback_entries and self_reflections itself. writePeerFeedback() is the
 * single place peer feedback write-back will go once the pseudonymous
 * storage lands; until a sink is wired, write-back validates, records what
 * it would write and marks the ticket written back.
 */

const answersSchema = z.array(z.string().min(1).max(8000)).max(50);

export const RESULT_SCHEMAS = {
  peer_checkin: z.object({ outcome: z.enum(["closed", "incomplete"]), answers: answersSchema.min(1), wordCount: z.number().int().min(0) }).strict(),
  personal_checkin: z.object({ outcome: z.enum(["closed", "incomplete"]), answers: answersSchema.min(1), wordCount: z.number().int().min(0) }).strict(),
  one_on_one_followup: z.object({ outcome: z.enum(["closed", "incomplete"]), answers: answersSchema, wordCount: z.number().int().min(0) }).strict(),
} satisfies Record<TicketType, z.ZodTypeAny>;

export type TicketResult = z.infer<(typeof RESULT_SCHEMAS)["peer_checkin"]>;

/** The fields each ticket type may write, and where. Anything else in a result is never written. */
export const WRITABLE: Record<TicketType, { target: string; fields: readonly string[] }> = {
  peer_checkin: { target: "peer_feedback", fields: ["rawContent", "isPartial", "wordCount"] },
  personal_checkin: { target: "self_reflection", fields: ["rawContent", "isPartial"] },
  one_on_one_followup: { target: "none", fields: [] },
};

/** Pure: keep only the fields this type may write. */
export function writableFields(type: TicketType, record: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set(WRITABLE[type].fields);
  return Object.fromEntries(Object.entries(record).filter(([k]) => allowed.has(k)));
}

/** The reviewer's pseudonym. Provided by pseudonym.ts reviewerRef() once it lands. */
export type ReviewerRefFn = (orgId: string, reviewerUserId: string) => string;

export interface PeerFeedbackRecord {
  conversationId: string;
  subjectId: string;
  /** Pseudonym, never the plain id. */
  reviewerRef: string;
  rawContent: string;
  isPartial: boolean;
  wordCount: number;
}

export interface WriteBackDeps {
  orgId: string;
  reviewerRef?: ReviewerRefFn;
  /** Where peer feedback is stored under the pseudonym. Absent: nothing written (the analysis pipeline still owns it). */
  peerFeedbackSink?: (record: PeerFeedbackRecord) => Promise<void>;
  now?: Date;
  logger?: Pick<Console, "warn">;
}

/**
 * Peer feedback write-back: the one function. Takes a validated result and
 * writes only the peer fields, keyed by the reviewer's pseudonym.
 */
export async function writePeerFeedback(
  ticket: { conversationId: string; subjectId: string; reviewerId: string },
  result: TicketResult,
  deps: WriteBackDeps,
): Promise<boolean> {
  if (!deps.peerFeedbackSink || !deps.reviewerRef) return false;
  const fields = writableFields("peer_checkin", {
    rawContent: result.answers.join("\n\n"),
    isPartial: result.outcome === "incomplete",
    wordCount: result.wordCount,
  }) as Pick<PeerFeedbackRecord, "rawContent" | "isPartial" | "wordCount">;
  await deps.peerFeedbackSink({
    conversationId: ticket.conversationId,
    subjectId: ticket.subjectId,
    reviewerRef: deps.reviewerRef(deps.orgId, ticket.reviewerId),
    ...fields,
  });
  return true;
}

export type WriteBackStatus = "written" | "recorded" | "invalid" | "not_done";

/** Run write-back for a conversation's ticket, once it is done. Idempotent: a written-back ticket is left alone. */
export async function writeBackForConversation(db: TenantDb, conversationId: string, deps: WriteBackDeps): Promise<WriteBackStatus> {
  const logger = deps.logger ?? console;
  const [ticket] = await db
    .select({ id: tickets.id, type: tickets.ticketType, status: tickets.status, outcome: tickets.outcome, reviewerId: tickets.reviewerId, subjectId: tickets.subjectId })
    .from(tickets)
    .where(eq(tickets.conversationId, conversationId));
  if (!ticket || ticket.status !== "done") return "not_done";

  const answers = (
    await db
      .select({ content: conversationMessages.content })
      .from(conversationMessages)
      .where(and(eq(conversationMessages.conversationId, conversationId), eq(conversationMessages.role, "user")))
      .orderBy(asc(conversationMessages.seq))
  )
    .map((m) => m.content.trim())
    .filter(Boolean);
  const parsed = RESULT_SCHEMAS[ticket.type].safeParse({
    outcome: ticket.outcome ?? "incomplete",
    answers,
    wordCount: answers.join(" ").split(/\s+/).filter(Boolean).length,
  });
  if (!parsed.success) {
    // Left done: the sweeper expires it. Never write an invalid result.
    logger.warn(`[TicketWriteBack] ticket ${ticket.id} result invalid: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.code).join(", ")}`);
    return "invalid";
  }

  let wrote = false;
  if (ticket.type === "peer_checkin" && ticket.subjectId) {
    wrote = await writePeerFeedback({ conversationId, subjectId: ticket.subjectId, reviewerId: ticket.reviewerId }, parsed.data, deps);
  }
  const now = deps.now ?? new Date();
  await db
    .update(tickets)
    .set({ status: "written_back", writtenBackAt: now, updatedAt: now })
    .where(and(eq(tickets.id, ticket.id), eq(tickets.status, "done")));
  return wrote ? "written" : "recorded";
}
