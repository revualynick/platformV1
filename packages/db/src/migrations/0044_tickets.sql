-- Tickets: the air gap between the job side and the chat side (privacy
-- design, "Agent access: the air gap"). The job side prepares a ticket
-- holding only the context its type may contain (checked by a policy gate
-- in code); the chat side reads its ticket, appends turns through it and
-- marks it done; write-back validates the result; then the ticket expires
-- and its context is wiped. Context is encrypted (free text about named
-- colleagues). The gate log records what was dropped and why, never the
-- content.
CREATE TABLE IF NOT EXISTS "tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_type" varchar(30) NOT NULL,
  -- The person the chat side talks to.
  "reviewer_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- Peer: the colleague discussed; personal: the reviewer; 1:1: the counterpart.
  "subject_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  -- Set when the conversation is created (one ticket per conversation).
  "conversation_id" uuid REFERENCES "conversations"("id") ON DELETE CASCADE,
  "status" varchar(20) NOT NULL DEFAULT 'prepared',
  "context" text NOT NULL DEFAULT '',
  "prepared_by" varchar(20) NOT NULL,
  "gate_log" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "turn_count" integer NOT NULL DEFAULT 0,
  "outcome" varchar(20),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "done_at" timestamptz,
  "written_back_at" timestamptz,
  "expires_at" timestamptz NOT NULL,
  CONSTRAINT "uq_tickets_conversation" UNIQUE ("conversation_id"),
  CONSTRAINT "chk_tickets_type" CHECK ("ticket_type" IN ('peer_checkin', 'personal_checkin', 'one_on_one_followup')),
  CONSTRAINT "chk_tickets_status" CHECK ("status" IN ('prepared', 'open', 'done', 'written_back', 'expired')),
  CONSTRAINT "chk_tickets_prepared_by" CHECK ("prepared_by" IN ('agent', 'default')),
  CONSTRAINT "chk_tickets_outcome" CHECK ("outcome" IS NULL OR "outcome" IN ('closed', 'incomplete'))
);
--> statement-breakpoint
-- The sweeper's lookup: live tickets past their expiry.
CREATE INDEX IF NOT EXISTS "idx_tickets_expiry"
  ON "tickets" ("expires_at")
  WHERE "status" <> 'expired';
