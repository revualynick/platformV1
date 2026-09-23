-- C3 step 3 (part 1): chat identity, link audit, inbound ledger, one chat
-- platform per tenant. Hand-written: drizzle-kit generate is unusable in
-- this repo (only the 0000 snapshot exists).

-- 1. Identity: which chat account is which person, and how to reach them.
ALTER TABLE "user_platform_identities"
  ADD COLUMN IF NOT EXISTS "dm_address" varchar(255),
  ADD COLUMN IF NOT EXISTS "status" varchar(20) NOT NULL DEFAULT 'linked',
  ADD COLUMN IF NOT EXISTS "link_source" varchar(20) NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS "linked_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "confirmed_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
-- Google Chat auto-links may not know a workspace id or display name.
ALTER TABLE "user_platform_identities"
  ALTER COLUMN "platform_workspace_id" SET DEFAULT '',
  ALTER COLUMN "display_name" SET DEFAULT '';
--> statement-breakpoint
ALTER TABLE "user_platform_identities"
  ADD CONSTRAINT "chk_upi_status" CHECK ("status" IN ('linked', 'reachable')),
  ADD CONSTRAINT "chk_upi_link_source" CHECK ("link_source" IN ('auto', 'admin', 'manager', 'self')),
  -- "reachable" means we can DM them, which needs an address.
  ADD CONSTRAINT "chk_upi_reachable_has_address" CHECK ("status" <> 'reachable' OR "dm_address" IS NOT NULL);
--> statement-breakpoint

-- 2. Audit trail for every link change (who linked which account, when).
-- actor_user_id NULL = done by the system (e.g. Google Chat auto-link).
CREATE TABLE IF NOT EXISTS "identity_link_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "platform" varchar(50) NOT NULL,
  "platform_user_id" varchar(255) NOT NULL,
  "action" varchar(20) NOT NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "chk_ile_action" CHECK ("action" IN ('link', 'unlink', 'confirm', 'reject', 'reachable', 'unreachable'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_identity_link_events_user"
  ON "identity_link_events" ("user_id", "created_at" DESC);
--> statement-breakpoint

-- 3. Inbound ledger. The webhook stores every inbound chat message here
-- first (content encrypted by the app), deduplicated on the platform's
-- message id, and queues only the row id, so no message text sits in Redis
-- and nothing is lost if the queue or worker fails. The worker resolves it
-- and records the outcome; "unrouted" messages are the outcomes that
-- matched no conversation.
CREATE TABLE IF NOT EXISTS "inbound_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "platform" varchar(50) NOT NULL,
  "platform_message_id" varchar(255) NOT NULL,
  "platform_user_id" varchar(255) NOT NULL,
  "platform_channel_id" varchar(255) NOT NULL,
  "thread_id" varchar(255),
  "content" text NOT NULL DEFAULT '',
  "truncated" boolean NOT NULL DEFAULT false,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "outcome" varchar(30),
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "conversation_id" uuid REFERENCES "conversations"("id") ON DELETE SET NULL,
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "processed_at" timestamptz,
  CONSTRAINT "uq_inbound_platform_message" UNIQUE ("platform", "platform_message_id"),
  CONSTRAINT "chk_inbound_status" CHECK ("status" IN ('pending', 'processed')),
  CONSTRAINT "chk_inbound_outcome" CHECK (
    "outcome" IS NULL OR "outcome" IN (
      'conversation_reply', 'late_addition', 'identity_confirmation', 'keyword',
      'paused', 'unknown_sender', 'no_open_conversation'
    )
  ),
  CONSTRAINT "chk_inbound_processed_has_outcome" CHECK ("status" = 'pending' OR "outcome" IS NOT NULL)
);
--> statement-breakpoint
-- Sweeper: re-queue messages stuck in pending.
CREATE INDEX IF NOT EXISTS "idx_inbound_pending"
  ON "inbound_messages" ("received_at") WHERE "status" = 'pending';
--> statement-breakpoint
-- Retention purge and monitoring counts by outcome.
CREATE INDEX IF NOT EXISTS "idx_inbound_received" ON "inbound_messages" ("received_at");
--> statement-breakpoint
-- Unknown-sender queue for linking (Slack/Teams).
CREATE INDEX IF NOT EXISTS "idx_inbound_unknown_sender"
  ON "inbound_messages" ("platform", "platform_user_id") WHERE "outcome" = 'unknown_sender';
--> statement-breakpoint

-- 4. One chat platform per tenant: at most one connected chat integration.
-- (google_calendar also lives in this table and is not a chat platform.)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_integrations_one_chat_platform"
  ON "integrations" ((true))
  WHERE "status" = 'connected' AND "platform" IN ('slack', 'google_chat', 'teams');
