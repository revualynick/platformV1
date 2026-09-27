-- Support handover (docs/bot/concerns-playbook.md, 2026-09-27). The bot
-- recognises that someone may need support and offers to ask the
-- organisation's support contact to get in touch; only a yes creates a
-- request, and a request never holds what the person wrote.

-- Conversations waiting for a yes or no to the offer, and ones that ended
-- for a support concern (never analysed as feedback).
ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "chk_conversations_phase";
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "chk_conversations_phase"
  CHECK ("phase" IN ('opening', 'exploring', 'follow_up', 'closing', 'support_offer', 'support_retry', 'support'));
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "support_level" varchar(10);
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "chk_conversations_support_level";
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "chk_conversations_support_level"
  CHECK ("support_level" IS NULL OR "support_level" IN ('wellbeing', 'safety'));
--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "support_contact_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "support_backup_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "support_details" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "support_outside" text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "urgency" varchar(10) NOT NULL,
  "status" varchar(20) DEFAULT 'open' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "due_at" timestamp with time zone NOT NULL,
  "acknowledged_at" timestamp with time zone,
  "acknowledged_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "closed_at" timestamp with time zone,
  "closed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reminded_at" timestamp with time zone,
  CONSTRAINT "chk_support_requests_urgency" CHECK ("urgency" IN ('today', 'soon')),
  CONSTRAINT "chk_support_requests_status" CHECK ("status" IN ('open', 'acknowledged', 'closed'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_support_requests_open" ON "support_requests" ("status", "due_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_signals" (
  "month" date PRIMARY KEY NOT NULL,
  "offers" integer DEFAULT 0 NOT NULL,
  "accepted" integer DEFAULT 0 NOT NULL
);
