-- 1:1 ingestion, version 2. Each 1:1 (found on the manager's calendar, or
-- uploaded by hand) yields tasks, between-meeting goals and progress
-- suggestions on formal goals. Only derived data is stored, plus a pointer
-- to the source Doc: never the notes or transcript text itself.
-- (Numbered 0041: 0040 is reserved for another branch.)

-- How 1:1s reach us, chosen per organisation by an admin:
-- automatic (service account), semi_automatic (the manager approves each
-- import, using their own Google token), manual (file upload only).
ALTER TABLE "org_settings"
  ADD COLUMN IF NOT EXISTS "one_on_one_ingestion_mode" varchar(20) NOT NULL DEFAULT 'semi_automatic';
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "org_settings" ADD CONSTRAINT "chk_org_settings_ingestion_mode"
    CHECK ("one_on_one_ingestion_mode" IN ('automatic', 'semi_automatic', 'manual'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
-- check_in_meetings becomes the record of every ingested 1:1.
ALTER TABLE "check_in_meetings"
  ADD COLUMN IF NOT EXISTS "source" varchar(20) NOT NULL DEFAULT 'calendar',
  ADD COLUMN IF NOT EXISTS "detected_by" varchar(20),
  ADD COLUMN IF NOT EXISTS "notes_doc_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "session_id" uuid REFERENCES "one_on_one_sessions"("id") ON DELETE SET NULL,
  -- Items that looked like wellbeing, conduct or safety: counted, never stored.
  ADD COLUMN IF NOT EXISTS "withheld_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "check_in_meetings" ADD CONSTRAINT "chk_check_in_meetings_source"
    CHECK ("source" IN ('calendar', 'automatic', 'upload'));
  ALTER TABLE "check_in_meetings" ADD CONSTRAINT "chk_check_in_meetings_detected_by"
    CHECK ("detected_by" IS NULL OR "detected_by" IN ('marker', 'pair'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "check_in_meetings" DROP CONSTRAINT IF EXISTS "chk_check_in_meetings_status";
--> statement-breakpoint
ALTER TABLE "check_in_meetings" ADD CONSTRAINT "chk_check_in_meetings_status"
  CHECK ("status" IN ('awaiting_approval', 'declined', 'pending_transcript', 'processing', 'processed', 'transcript_missing', 'no_subject_match', 'no_goals', 'failed'));
--> statement-breakpoint
-- Tasks from a 1:1 land in the existing action items, private by default.
ALTER TABLE "one_on_one_action_items"
  ADD COLUMN IF NOT EXISTS "visibility" varchar(20) NOT NULL DEFAULT 'private',
  -- Encrypted: why the item may be shared (required when shareable).
  ADD COLUMN IF NOT EXISTS "share_reason" text,
  ADD COLUMN IF NOT EXISTS "source_meeting_id" uuid REFERENCES "check_in_meetings"("id") ON DELETE SET NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "one_on_one_action_items" ADD CONSTRAINT "chk_action_items_visibility"
    CHECK ("visibility" IN ('private', 'shareable'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
-- Ongoing focus areas that run until the next 1:1 (not formal goals).
-- Visible to and editable by both people in the 1:1, nobody else.
CREATE TABLE IF NOT EXISTS "between_meeting_goals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "counterpart_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- Encrypted.
  "text" text NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "visibility" varchar(20) NOT NULL DEFAULT 'private',
  -- Encrypted.
  "share_reason" text,
  "source_meeting_id" uuid REFERENCES "check_in_meetings"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "chk_between_meeting_goals_status" CHECK ("status" IN ('active', 'done', 'dropped')),
  CONSTRAINT "chk_between_meeting_goals_visibility" CHECK ("visibility" IN ('private', 'shareable')),
  CONSTRAINT "chk_between_meeting_goals_pair" CHECK ("owner_id" <> "counterpart_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_between_meeting_goals_owner"
  ON "between_meeting_goals" ("owner_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_between_meeting_goals_counterpart"
  ON "between_meeting_goals" ("counterpart_id", "status");
