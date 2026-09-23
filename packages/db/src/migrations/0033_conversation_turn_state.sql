-- C3 step 3 (part 2): conversation state lives in Postgres, not Redis.
-- Adds the pointers the Redis blob used to hold, an optimistic-concurrency
-- turn counter, idempotent scheduled initiation and an outbox for sends.

-- 1. Turn state on the conversation row. Everything else the old Redis
-- state held is already on this row or in conversation_messages.
ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "selected_theme_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "current_theme_index" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "phase" varchar(20) NOT NULL DEFAULT 'opening',
  ADD COLUMN IF NOT EXISTS "follow_up_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "thread_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "last_activity_at" timestamptz NOT NULL DEFAULT now(),
  -- Incremented on every committed turn; a writer only commits if the turn
  -- it read is still current (UPDATE ... WHERE turn = $read).
  ADD COLUMN IF NOT EXISTS "turn" integer NOT NULL DEFAULT 0,
  -- Set when started by the scheduler, so a retried job cannot create a
  -- second conversation for the same schedule entry.
  ADD COLUMN IF NOT EXISTS "schedule_entry_id" uuid REFERENCES "interaction_schedule"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "conversations"
  ADD CONSTRAINT "chk_conversations_phase" CHECK ("phase" IN ('opening', 'exploring', 'follow_up', 'closing')),
  ADD CONSTRAINT "chk_conversations_counters" CHECK ("turn" >= 0 AND "current_theme_index" >= 0 AND "follow_up_count" >= 0);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_conversations_schedule_entry"
  ON "conversations" ("schedule_entry_id") WHERE "schedule_entry_id" IS NOT NULL;
--> statement-breakpoint
-- Existing rows: last activity = latest message, else creation time.
UPDATE "conversations" c
  SET "last_activity_at" = COALESCE(
    (SELECT max(m."created_at") FROM "conversation_messages" m WHERE m."conversation_id" = c."id"),
    c."created_at"
  );
--> statement-breakpoint
-- The reviewer's open conversation (routing) and stale-conversation sweeps.
CREATE INDEX IF NOT EXISTS "idx_conversations_open_by_reviewer"
  ON "conversations" ("reviewer_id", "created_at" DESC)
  WHERE "status" IN ('initiated', 'in_progress');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_open_activity"
  ON "conversations" ("last_activity_at")
  WHERE "status" IN ('initiated', 'in_progress');
--> statement-breakpoint

-- 2. Outbox: bot messages are stored before sending; delivered_at is set
-- once the platform accepts them, and undelivered ones are re-sent without
-- another LLM call.
ALTER TABLE "conversation_messages"
  ADD COLUMN IF NOT EXISTS "delivered_at" timestamptz;
--> statement-breakpoint
-- Everything already stored was sent under the old flow.
UPDATE "conversation_messages" SET "delivered_at" = "created_at"
  WHERE "role" = 'assistant' AND "delivered_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversation_messages_undelivered"
  ON "conversation_messages" ("created_at")
  WHERE "role" = 'assistant' AND "delivered_at" IS NULL;
