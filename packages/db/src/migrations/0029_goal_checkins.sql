-- Goal check-in transcript pipeline: tracked check-in meetings,
-- LLM-suggested goal updates, OAuth scope tracking, and the org-level
-- check-in title marker setting.

ALTER TABLE "calendar_tokens" ADD COLUMN IF NOT EXISTS "scopes" text NOT NULL DEFAULT '';

ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "check_in_title_marker" varchar(100) NOT NULL DEFAULT '[Check-in]';

CREATE TABLE IF NOT EXISTS "check_in_meetings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizer_id" uuid NOT NULL REFERENCES "users"("id"),
  "subject_user_id" uuid REFERENCES "users"("id"),
  "external_event_id" varchar(255) NOT NULL,
  "title" varchar(500) NOT NULL,
  "event_start" timestamptz NOT NULL,
  "transcript_doc_id" varchar(255),
  "status" varchar(30) NOT NULL DEFAULT 'pending_transcript',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "last_attempt_at" timestamptz,
  "processed_at" timestamptz,
  "error_message" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_check_in_meetings_org_event" UNIQUE ("organizer_id", "external_event_id")
);

ALTER TABLE "check_in_meetings" ADD CONSTRAINT "chk_check_in_meetings_status"
  CHECK ("status" IN ('pending_transcript', 'processing', 'processed', 'transcript_missing', 'no_subject_match', 'no_goals', 'failed'));

CREATE INDEX IF NOT EXISTS "idx_check_in_meetings_status"
  ON "check_in_meetings" ("status");
CREATE INDEX IF NOT EXISTS "idx_check_in_meetings_subject"
  ON "check_in_meetings" ("subject_user_id");

CREATE TABLE IF NOT EXISTS "goal_update_suggestions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "goal_id" uuid NOT NULL REFERENCES "goals"("id"),
  "meeting_id" uuid NOT NULL REFERENCES "check_in_meetings"("id"),
  "suggested_progress_percent" integer,
  "suggested_status" varchar(20),
  "suggested_metric_current_value" double precision,
  "suggested_note" text NOT NULL DEFAULT '',
  "evidence_quote" text NOT NULL DEFAULT '',
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "reviewed_by_id" uuid REFERENCES "users"("id"),
  "reviewed_at" timestamptz,
  "applied_update_id" uuid REFERENCES "goal_updates"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_goal_suggestion_goal_meeting" UNIQUE ("goal_id", "meeting_id")
);

ALTER TABLE "goal_update_suggestions" ADD CONSTRAINT "chk_goal_suggestions_status"
  CHECK ("status" IN ('pending', 'applied', 'dismissed'));
ALTER TABLE "goal_update_suggestions" ADD CONSTRAINT "chk_goal_suggestions_progress"
  CHECK ("suggested_progress_percent" IS NULL OR "suggested_progress_percent" BETWEEN 0 AND 100);

CREATE INDEX IF NOT EXISTS "idx_goal_suggestions_goal_status"
  ON "goal_update_suggestions" ("goal_id", "status");
CREATE INDEX IF NOT EXISTS "idx_goal_suggestions_status"
  ON "goal_update_suggestions" ("status");
