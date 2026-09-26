import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import { conversationMessages, tickets } from "@revualy/db";
import { TICKET_TTL_MS, parseContext, type TicketContext } from "./context.js";

/**
 * The chat side's only access to context. A handle is bound to one ticket
 * when it is opened; none of its methods takes a person id (or any id), so
 * the chat side cannot ask for anyone else's data through it. The turns are
 * this conversation's own messages, reached through the ticket.
 *
 * Checked by src/__tests__/ticket-air-gap.test.ts (static: no person-id
 * parameters here, in turn-planner.ts or in reference-path.ts).
 */

type Tx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];

export interface TicketTurn {
  role: string;
  content: string;
  seq: number;
}

export interface TicketHandle {
  readonly ticketId: string;
  /** What the job side put in the ticket (after the policy gate). */
  readonly context: TicketContext;
  /** This conversation's messages, oldest first. */
  turns(): Promise<TicketTurn[]>;
  /** Store the bot's next message (the outbox sends it). Only while the ticket is open. */
  appendTurn(tx: Tx, content: string): Promise<void>;
  /** The chat side is finished: the conversation closed. */
  markDone(tx: Tx): Promise<void>;
}

class TicketClosed extends Error {}

function handle(db: TenantDb, row: { id: string; context: string; conversationId: string | null }): TicketHandle {
  const context = parseContext(row.context);
  const conversationId = row.conversationId;
  return {
    ticketId: row.id,
    context,
    async turns() {
      if (!conversationId) return [];
      return db
        .select({ role: conversationMessages.role, content: conversationMessages.content, seq: conversationMessages.seq })
        .from(conversationMessages)
        .where(eq(conversationMessages.conversationId, conversationId))
        .orderBy(asc(conversationMessages.seq));
    },
    async appendTurn(tx, content) {
      const [open] = await tx
        .update(tickets)
        .set({ turnCount: sql`${tickets.turnCount} + 1`, updatedAt: new Date() })
        .where(and(eq(tickets.id, row.id), eq(tickets.status, "open")))
        .returning({ conversationId: tickets.conversationId });
      if (!open?.conversationId) throw new TicketClosed(`Ticket ${row.id} is not open`);
      await tx.insert(conversationMessages).values({ conversationId: open.conversationId, role: "assistant", content });
    },
    async markDone(tx) {
      const now = new Date();
      await tx
        .update(tickets)
        .set({ status: "done", outcome: "closed", doneAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + TICKET_TTL_MS) })
        .where(and(eq(tickets.id, row.id), inArray(tickets.status, ["open"])));
    },
  };
}

/** Open a ticket by its id (initiation, right after the job side prepared it). */
export async function openTicket(db: TenantDb, ticketId: string): Promise<TicketHandle | null> {
  const [row] = await db
    .select({ id: tickets.id, context: tickets.context, conversationId: tickets.conversationId })
    .from(tickets)
    .where(and(eq(tickets.id, ticketId), inArray(tickets.status, ["prepared", "open"])));
  return row && row.context ? handle(db, row) : null;
}

/** The open ticket of a conversation, if it has one. */
export async function openTicketForConversation(db: TenantDb, conversationId: string): Promise<TicketHandle | null> {
  const [row] = await db
    .select({ id: tickets.id, context: tickets.context, conversationId: tickets.conversationId })
    .from(tickets)
    .where(and(eq(tickets.conversationId, conversationId), eq(tickets.status, "open")));
  return row && row.context ? handle(db, row) : null;
}
