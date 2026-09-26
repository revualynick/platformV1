-- Meeting-anchored check-ins: "You were on a call with Jon on Wednesday,
-- how did he contribute?" The scheduler picks a recent meeting both people
-- attended; the conversation opens with it.

-- 1. What calendar sync now keeps: who declined, and the event's
-- visibility, so the bot never asks about a meeting someone declined or
-- one marked private.
ALTER TABLE "calendar_events"
  ADD COLUMN IF NOT EXISTS "declined" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "visibility" varchar(20) NOT NULL DEFAULT 'default';
--> statement-breakpoint

-- 2. The meeting a check-in is about. The label (with the title when it is
-- safe to use) is written once at scheduling time and encrypted: meeting
-- titles can be sensitive.
ALTER TABLE "interaction_schedule"
  ADD COLUMN IF NOT EXISTS "anchor_event_id" uuid REFERENCES "calendar_events"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "anchor_event_id" uuid REFERENCES "calendar_events"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "anchor_label" text;
