-- C3 step 6 (phase 5): how each theme went, per conversation. One row per
-- theme selected for the conversation: created `unanswered` when the theme
-- is first asked (or when the conversation ends before reaching it), then
-- judged `answered` or `weak` from the reply. The re-presentation engine
-- (step 9) re-asks weak and unanswered themes later, worded differently.
CREATE TABLE IF NOT EXISTS "conversation_theme_outcomes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "theme_id" uuid REFERENCES "questionnaire_themes"("id") ON DELETE SET NULL,
  "reviewer_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- Null for self-reflections (the reviewer is the subject).
  "subject_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "interaction_type" varchar(50) NOT NULL,
  "outcome" varchar(20) NOT NULL DEFAULT 'unanswered',
  "follow_up_count" integer NOT NULL DEFAULT 0,
  -- The question as first asked for this theme (encrypted: it can name the
  -- subject). Null if the conversation ended before reaching the theme.
  "question_text" text,
  -- How the outcome was judged: the model, or the rule used when it was down.
  "judged_by" varchar(20),
  "created_at" timestamptz NOT NULL DEFAULT clock_timestamp(),
  "updated_at" timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "chk_theme_outcome" CHECK ("outcome" IN ('answered', 'weak', 'unanswered')),
  CONSTRAINT "chk_theme_outcome_judged_by" CHECK ("judged_by" IS NULL OR "judged_by" IN ('llm', 'fallback')),
  CONSTRAINT "chk_theme_outcome_follow_ups" CHECK ("follow_up_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_theme_outcome_conversation_theme"
  ON "conversation_theme_outcomes" ("conversation_id", "theme_id");
--> statement-breakpoint
-- Re-presentation lookups: this reviewer's weak/unanswered themes, recent first.
CREATE INDEX IF NOT EXISTS "idx_theme_outcomes_reviewer_recent"
  ON "conversation_theme_outcomes" ("reviewer_id", "created_at" DESC)
  WHERE "outcome" IN ('weak', 'unanswered');
