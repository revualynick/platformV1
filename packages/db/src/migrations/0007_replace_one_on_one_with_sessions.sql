-- Migration 0007: Replace one-on-one entries/revisions with real-time meeting sessions
-- Drops old chat-style 1:1 notes, adds session-based model with action items + agenda

-- Drop old tables (revisions first due to FK)
DROP TABLE IF EXISTS "one_on_one_entry_revisions";
DROP TABLE IF EXISTS "one_on_one_entries";

-- Sessions
CREATE TABLE "one_on_one_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "manager_id" uuid NOT NULL REFERENCES "users"("id"),
  "employee_id" uuid NOT NULL REFERENCES "users"("id"),
  "status" varchar(20) NOT NULL DEFAULT 'scheduled',
  "scheduled_at" timestamp with time zone NOT NULL,
  "started_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "notes" text NOT NULL DEFAULT '',
  "summary" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "idx_one_on_one_sessions_pair" ON "one_on_one_sessions"("manager_id", "employee_id");
CREATE INDEX "idx_one_on_one_sessions_status" ON "one_on_one_sessions"("status");
CREATE INDEX "idx_one_on_one_sessions_scheduled_at" ON "one_on_one_sessions"("scheduled_at");

-- Action items
CREATE TABLE "one_on_one_action_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL REFERENCES "one_on_one_sessions"("id") ON DELETE CASCADE,
  "text" text NOT NULL,
  "assignee_id" uuid REFERENCES "users"("id"),
  "due_date" date,
  "completed" boolean NOT NULL DEFAULT false,
  "completed_at" timestamp with time zone,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "idx_one_on_one_action_items_session" ON "one_on_one_action_items"("session_id");
CREATE INDEX "idx_one_on_one_action_items_assignee" ON "one_on_one_action_items"("assignee_id", "completed");

-- Agenda items
CREATE TABLE "one_on_one_agenda_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL REFERENCES "one_on_one_sessions"("id") ON DELETE CASCADE,
  "text" text NOT NULL,
  "source" varchar(20) NOT NULL DEFAULT 'manual',
  "covered" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "idx_one_on_one_agenda_items_session" ON "one_on_one_agenda_items"("session_id");
