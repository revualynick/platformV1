-- Profiling system: assessment quizzes, sessions, profile snapshots,
-- behavioral signals, and development goals.

CREATE TABLE IF NOT EXISTS "assessment_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "framework" varchar(20) NOT NULL,
  "question_type" varchar(20) NOT NULL,
  "text" text NOT NULL,
  "options" jsonb NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_assessment_questions_framework"
  ON "assessment_questions" ("framework");

CREATE TABLE IF NOT EXISTS "assessment_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "framework" varchar(20) NOT NULL,
  "context" varchar(30) NOT NULL DEFAULT 'onboarding',
  "responses" jsonb NOT NULL DEFAULT '{}',
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "idx_assessment_sessions_user"
  ON "assessment_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_assessment_sessions_user_framework"
  ON "assessment_sessions" ("user_id", "framework");

CREATE TABLE IF NOT EXISTS "profile_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "framework" varchar(20) NOT NULL,
  "source" varchar(20) NOT NULL,
  "session_id" uuid REFERENCES "assessment_sessions"("id"),
  "dimensions" jsonb NOT NULL,
  "signal_count" integer NOT NULL DEFAULT 0,
  "period_start" date,
  "period_end" date,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_profile_snapshots_user_framework"
  ON "profile_snapshots" ("user_id", "framework", "created_at");

CREATE TABLE IF NOT EXISTS "behavioral_signals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "framework" varchar(20) NOT NULL,
  "dimension" varchar(30) NOT NULL,
  "value" real NOT NULL,
  "confidence" real NOT NULL,
  "source_type" varchar(30) NOT NULL,
  "source_id" uuid,
  "captured_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_behavioral_signals_user_framework"
  ON "behavioral_signals" ("user_id", "framework", "captured_at");
CREATE INDEX IF NOT EXISTS "idx_behavioral_signals_user_dimension"
  ON "behavioral_signals" ("user_id", "dimension", "captured_at");

CREATE TABLE IF NOT EXISTS "profile_development_goals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "framework" varchar(20) NOT NULL,
  "dimension" varchar(30) NOT NULL,
  "target_direction" varchar(10) NOT NULL,
  "set_by_id" uuid NOT NULL REFERENCES "users"("id"),
  "baseline_snapshot_id" uuid REFERENCES "profile_snapshots"("id"),
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_profile_goals_user"
  ON "profile_development_goals" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_profile_goals_user_framework"
  ON "profile_development_goals" ("user_id", "framework");
