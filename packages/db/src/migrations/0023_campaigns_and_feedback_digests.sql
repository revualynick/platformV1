-- Migration: Add campaigns + feedback_digests tables
-- Campaigns provide date-based lifecycle for questionnaires.
-- Feedback digests store aggregated monthly team insights.

CREATE TABLE IF NOT EXISTS "campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(255) NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "questionnaire_id" uuid REFERENCES "questionnaires"("id"),
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "start_date" date,
  "end_date" date,
  "target_audience" varchar(100),
  "target_team_id" uuid REFERENCES "teams"("id"),
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_campaigns_status" ON "campaigns" ("status");
CREATE INDEX IF NOT EXISTS "idx_campaigns_questionnaire_id" ON "campaigns" ("questionnaire_id");
CREATE INDEX IF NOT EXISTS "idx_campaigns_target_team_id" ON "campaigns" ("target_team_id");
CREATE INDEX IF NOT EXISTS "idx_campaigns_created_by" ON "campaigns" ("created_by_user_id");
CREATE INDEX IF NOT EXISTS "idx_campaigns_start_date" ON "campaigns" ("start_date");

CREATE TABLE IF NOT EXISTS "feedback_digests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "team_id" uuid REFERENCES "teams"("id"),
  "manager_id" uuid NOT NULL REFERENCES "users"("id"),
  "month_starting" date NOT NULL,
  "data" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "feedback_digests"
  ADD CONSTRAINT "uq_feedback_digest_manager_month"
  UNIQUE ("manager_id", "month_starting");

CREATE INDEX IF NOT EXISTS "idx_feedback_digests_manager_id" ON "feedback_digests" ("manager_id");
CREATE INDEX IF NOT EXISTS "idx_feedback_digests_team_id" ON "feedback_digests" ("team_id");
CREATE INDEX IF NOT EXISTS "idx_feedback_digests_month_starting" ON "feedback_digests" ("month_starting");
