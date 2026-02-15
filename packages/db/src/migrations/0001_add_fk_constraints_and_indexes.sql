-- Add missing self-referencing FK constraints
ALTER TABLE "users" ADD CONSTRAINT "fk_users_manager_id" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "fk_teams_parent_team_id" FOREIGN KEY ("parent_team_id") REFERENCES "teams"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "fk_teams_manager_id" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- Add unique constraints
ALTER TABLE "user_platform_identities" ADD CONSTRAINT "uq_user_platform" UNIQUE ("user_id", "platform");
--> statement-breakpoint
ALTER TABLE "engagement_scores" ADD CONSTRAINT "uq_engagement_user_week" UNIQUE ("user_id", "week_starting");
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "uq_calendar_user_event" UNIQUE ("user_id", "external_event_id");
--> statement-breakpoint

-- Add indexes on frequently queried columns
CREATE INDEX IF NOT EXISTS "idx_users_team_id" ON "users" ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_manager_id" ON "users" ("manager_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_is_active" ON "users" ("is_active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users" ("role");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_platform_identities_platform_user" ON "user_platform_identities" ("platform", "platform_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_teams_parent_team_id" ON "teams" ("parent_team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_teams_manager_id" ON "teams" ("manager_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_reviewer_id" ON "conversations" ("reviewer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_subject_id" ON "conversations" ("subject_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_status" ON "conversations" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_scheduled_at" ON "conversations" ("scheduled_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversation_messages_conversation_id" ON "conversation_messages" ("conversation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_entries_subject_id" ON "feedback_entries" ("subject_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_entries_reviewer_id" ON "feedback_entries" ("reviewer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_entries_created_at" ON "feedback_entries" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_value_scores_entry_id" ON "feedback_value_scores" ("feedback_entry_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kudos_receiver_id" ON "kudos" ("receiver_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kudos_created_at" ON "kudos" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_engagement_scores_user_id" ON "engagement_scores" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_engagement_scores_week_starting" ON "engagement_scores" ("week_starting");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_escalations_feedback_entry_id" ON "escalations" ("feedback_entry_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_escalations_created_at" ON "escalations" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_relationships_from_user_id" ON "user_relationships" ("from_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_relationships_to_user_id" ON "user_relationships" ("to_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_relationships_is_active" ON "user_relationships" ("is_active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_questionnaire_themes_questionnaire_id" ON "questionnaire_themes" ("questionnaire_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_interaction_schedule_user_id" ON "interaction_schedule" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_interaction_schedule_scheduled_at" ON "interaction_schedule" ("scheduled_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_interaction_schedule_status" ON "interaction_schedule" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_calendar_events_user_id" ON "calendar_events" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_calendar_events_start_at" ON "calendar_events" ("start_at");
