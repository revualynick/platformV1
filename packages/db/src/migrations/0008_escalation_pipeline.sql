-- Escalation Pipeline: expand escalations for standalone filing + audit trail
-- The existing escalations table is tied to feedback_entry_id (not null).
-- We make it nullable and add new fields for standalone escalation reports.

ALTER TABLE "escalations"
  ALTER COLUMN "feedback_entry_id" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "reporter_id" uuid REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "subject_id" uuid REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "type" varchar(50) NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS "status" varchar(20) NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS "description" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "resolution" text,
  ADD COLUMN IF NOT EXISTS "resolved_by_id" uuid REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now();

-- Add indexes for the new columns
CREATE INDEX IF NOT EXISTS "idx_escalations_status" ON "escalations" ("status");
CREATE INDEX IF NOT EXISTS "idx_escalations_subject_id" ON "escalations" ("subject_id");
CREATE INDEX IF NOT EXISTS "idx_escalations_reporter_id" ON "escalations" ("reporter_id");

-- Rename escalation_audit_log to escalation_notes for clarity
ALTER TABLE "escalation_audit_log" RENAME TO "escalation_notes";

-- Add content column to escalation_notes (repurpose from action-only to general notes)
ALTER TABLE "escalation_notes"
  ADD COLUMN IF NOT EXISTS "content" text NOT NULL DEFAULT '';
