-- The calendar model: a nightly job reads each person's recent meetings and
-- proposes check-ins with context (who, which meeting, what to focus on).
-- The scheduler takes the best unexpired proposal first, then falls back
-- to the rules layer (meeting-anchor.ts) and relationship strength.
CREATE TABLE IF NOT EXISTS "checkin_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "reviewer_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- Null for self-reflection jobs, and for rejected proposals naming nobody real.
  "subject_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "anchor_event_id" uuid REFERENCES "calendar_events"("id") ON DELETE SET NULL,
  "interaction_type" varchar(50) NOT NULL,
  -- Encrypted (free text about named colleagues).
  "reason" text NOT NULL DEFAULT '',
  "focus" text NOT NULL DEFAULT '',
  "sensitivity" varchar(10) NOT NULL,
  "title_safe" boolean NOT NULL DEFAULT false,
  "priority" integer NOT NULL DEFAULT 3,
  "status" varchar(20) NOT NULL DEFAULT 'proposed',
  "source" varchar(20) NOT NULL,
  "model" varchar(100),
  -- Which rule rejected a proposal (kept for evaluating the model).
  "rejection_reason" varchar(50),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL,
  CONSTRAINT "uq_checkin_jobs_pair" UNIQUE ("reviewer_id", "subject_id", "anchor_event_id"),
  CONSTRAINT "chk_checkin_jobs_sensitivity" CHECK ("sensitivity" IN ('low', 'medium', 'high')),
  CONSTRAINT "chk_checkin_jobs_status" CHECK ("status" IN ('proposed', 'scheduled', 'used', 'rejected', 'expired')),
  CONSTRAINT "chk_checkin_jobs_source" CHECK ("source" IN ('calendar_model', 'rules')),
  CONSTRAINT "chk_checkin_jobs_priority" CHECK ("priority" BETWEEN 1 AND 5)
);
--> statement-breakpoint
-- The scheduler's lookup: this reviewer's proposals, best first.
CREATE INDEX IF NOT EXISTS "idx_checkin_jobs_lookup"
  ON "checkin_jobs" ("reviewer_id", "status", "priority" DESC);
--> statement-breakpoint
-- What the calendar model suggested asking about, carried onto the
-- conversation as background for the bot (encrypted).
ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "anchor_focus" text;
