-- 2026-09-27 (Nick): the concern wording is the client's to sign off and
-- adjust; and the bot offers to stop after two off-script replies in a row.
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "support_wording" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
-- Who at the client signed off which version of the wording, and when.
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "support_wording_signoff" jsonb;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "off_script_streak" integer DEFAULT 0 NOT NULL;
