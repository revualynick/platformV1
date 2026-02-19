-- Self-reflections: weekly self-reflection entries linked to conversations

CREATE TABLE IF NOT EXISTS "self_reflections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "conversation_id" uuid REFERENCES "conversations"("id"),
  "week_starting" date NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "mood" varchar(20),
  "highlights" text,
  "challenges" text,
  "goal_for_next_week" text,
  "engagement_score" integer,
  "prompt_theme" varchar(100),
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "self_reflections"
  ADD CONSTRAINT "uq_self_reflection_user_week" UNIQUE ("user_id", "week_starting");

CREATE INDEX IF NOT EXISTS "idx_self_reflections_user_id" ON "self_reflections" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_self_reflections_status" ON "self_reflections" ("status");
CREATE INDEX IF NOT EXISTS "idx_self_reflections_week_starting" ON "self_reflections" ("week_starting");

-- Apply updated_at trigger if it exists (created in migration 0009)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER set_updated_at_self_reflections
      BEFORE UPDATE ON "self_reflections"
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
