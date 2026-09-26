import { z } from "zod";
import type { InteractionType } from "@revualy/shared";
import type { TicketType } from "@revualy/db";

/**
 * What a ticket holds: everything the chat side may know about its
 * conversation, and nothing else. Written only by the job side (prepare.ts)
 * after the policy gate; read by the chat side (reader.ts). No person ids:
 * people appear as first names only.
 */

const themeSchema = z.object({
  id: z.string(),
  intent: z.string(),
  dataGoal: z.string(),
  examplePhrasings: z.array(z.string()),
});

export const ticketContextSchema = z.object({
  v: z.literal(1),
  type: z.enum(["peer_checkin", "personal_checkin", "one_on_one_followup"]),
  interactionType: z.enum(["peer_review", "self_reflection", "three_sixty", "pulse_check"]),
  /** The person the conversation is with. */
  reviewerFirstName: z.string(),
  /** Peer: the colleague discussed; personal: the person themselves; 1:1: the counterpart. */
  subjectFirstName: z.string(),
  verbatim: z.boolean(),
  /** The conversation's themes by position; null for one that no longer existed when prepared. */
  themes: z.array(themeSchema.nullable()),
  /** "the \"Q3 planning\" call on Wednesday": only when the gate accepted "meeting". */
  meeting: z.string().nullable(),
  /** The calendar model's angle on that meeting: background, never quoted. */
  meetingFocus: z.string().nullable(),
  /** The job agent's one-line angle, after the gate. */
  angle: z.string().nullable(),
  /** Other accepted items fetched by code (own goals, focus areas, the pair's tasks and goals). */
  items: z.array(z.object({ category: z.string(), text: z.string() })),
});

export type TicketContext = z.infer<typeof ticketContextSchema> & {
  type: TicketType;
  interactionType: InteractionType;
};

export function serialiseContext(ctx: TicketContext): string {
  return JSON.stringify(ticketContextSchema.parse(ctx));
}

export function parseContext(raw: string): TicketContext {
  return ticketContextSchema.parse(JSON.parse(raw)) as TicketContext;
}

/** Tickets live this long after they are prepared or finished; expiry wipes the context. */
export const TICKET_TTL_MS = 7 * 24 * 60 * 60 * 1000;
