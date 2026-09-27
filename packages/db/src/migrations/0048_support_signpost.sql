-- Support signposting replaces the consented request queue (Nick,
-- 2026-09-27). Above the threshold the bot tells the person who at their
-- organisation to reach out to and shows the organisation's details;
-- nothing is passed on and nothing is recorded about the person. Only
-- monthly counts of how often each signpost was shown.
UPDATE "conversations" SET "phase" = 'support' WHERE "phase" IN ('support_offer', 'support_retry');
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "chk_conversations_phase";
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "chk_conversations_phase"
  CHECK ("phase" IN ('opening', 'exploring', 'follow_up', 'closing', 'support'));
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "chk_conversations_support_level";
--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN IF EXISTS "support_level";
--> statement-breakpoint
DROP TABLE IF EXISTS "support_requests";
--> statement-breakpoint
DROP TABLE IF EXISTS "support_signals";
--> statement-breakpoint
ALTER TABLE "org_settings" DROP COLUMN IF EXISTS "support_contact_id";
--> statement-breakpoint
ALTER TABLE "org_settings" DROP COLUMN IF EXISTS "support_backup_id";
--> statement-breakpoint
-- Who to reach out to, in the organisation's words: a person or a team.
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "support_contact" text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_signposts" (
  "month" date NOT NULL,
  "level" varchar(20) NOT NULL,
  "shown" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "support_signposts_pkey" PRIMARY KEY ("month", "level"),
  CONSTRAINT "chk_support_signposts_level" CHECK ("level" IN ('wellbeing', 'safety', 'conduct'))
);
