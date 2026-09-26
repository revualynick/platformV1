-- Privacy step 2 (docs/design/privacy-and-agent-access.md, tier A).
--
-- Reviews of others are keyed by reviewer_ref = HMAC-SHA256(secret,
-- org_id || ':' || user_id) in place of the reviewer's user id. The secret
-- lives outside the database; existing rows are converted here with the
-- secret passed in as the session settings revualy.pseudonym_secret and
-- revualy.org_id (packages/db/src/migrate.ts sets them from
-- REVIEWER_PSEUDONYM_SECRET and ORG_ID). With rows to convert and no
-- secret, the migration fails rather than store a guessable value.
--
-- Also: audit_log (append-only, hash-chained), and conversation links that
-- survive the conversation being deleted after its retention window.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE FUNCTION pg_temp.revualy_reviewer_ref(uid uuid) RETURNS varchar(64) AS $$
DECLARE
  secret text := current_setting('revualy.pseudonym_secret', true);
  org text := current_setting('revualy.org_id', true);
BEGIN
  IF secret IS NULL OR length(secret) < 32 OR org IS NULL OR org = '' THEN
    RAISE EXCEPTION 'migration 0043 needs REVIEWER_PSEUDONYM_SECRET (32+ chars) and ORG_ID to convert existing reviewer ids; run migrations through the API (runMigrations)';
  END IF;
  RETURN encode(hmac(convert_to(org || ':' || lower(uid::text), 'UTF8'), convert_to(secret, 'UTF8'), 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Drops the foreign key on table.col, whatever it was named.
CREATE FUNCTION pg_temp.revualy_drop_fk(tbl text, col text) RETURNS void AS $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
    WHERE con.contype = 'f' AND con.conrelid = tbl::regclass AND a.attname = col
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', tbl, c.conname);
  END LOOP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- ── feedback_entries ──────────────────────────────────
ALTER TABLE "feedback_entries" ADD COLUMN IF NOT EXISTS "reviewer_ref" varchar(64);
--> statement-breakpoint
UPDATE "feedback_entries" SET "reviewer_ref" = pg_temp.revualy_reviewer_ref("reviewer_id") WHERE "reviewer_ref" IS NULL;
--> statement-breakpoint
-- Behavioural signals about the reviewer's own writing pointed at the
-- feedback entry, which joined the reviewer to the review. Point them at
-- the (short-lived) conversation instead.
UPDATE "behavioral_signals" s SET "source_id" = f."conversation_id"
  FROM "feedback_entries" f WHERE s."source_id" = f."id";
--> statement-breakpoint
ALTER TABLE "feedback_entries" DROP COLUMN "reviewer_id";
--> statement-breakpoint
ALTER TABLE "feedback_entries" ALTER COLUMN "reviewer_ref" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_entries_reviewer_ref" ON "feedback_entries" ("reviewer_ref");
--> statement-breakpoint
-- The conversation (tier D, named) is deleted after its retention window;
-- the feedback stays.
SELECT pg_temp.revualy_drop_fk('feedback_entries', 'conversation_id');
--> statement-breakpoint
ALTER TABLE "feedback_entries" ALTER COLUMN "conversation_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "feedback_entries" ADD CONSTRAINT "feedback_entries_conversation_id_fk"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- ── three_sixty_responses ─────────────────────────────
ALTER TABLE "three_sixty_responses" ADD COLUMN IF NOT EXISTS "reviewer_ref" varchar(64);
--> statement-breakpoint
UPDATE "three_sixty_responses" SET "reviewer_ref" = pg_temp.revualy_reviewer_ref("reviewer_id") WHERE "reviewer_ref" IS NULL;
--> statement-breakpoint
ALTER TABLE "three_sixty_responses" DROP COLUMN "reviewer_id";
--> statement-breakpoint
ALTER TABLE "three_sixty_responses" ALTER COLUMN "reviewer_ref" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_three_sixty_response_review_reviewer" ON "three_sixty_responses" ("review_id", "reviewer_ref");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_three_sixty_responses_reviewer_ref" ON "three_sixty_responses" ("reviewer_ref");
--> statement-breakpoint
SELECT pg_temp.revualy_drop_fk('three_sixty_responses', 'conversation_id');
--> statement-breakpoint
ALTER TABLE "three_sixty_responses" ADD CONSTRAINT "three_sixty_responses_conversation_id_fk"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- ── imported_feedback (historical reviews of others) ──
ALTER TABLE "imported_feedback" ADD COLUMN IF NOT EXISTS "author_ref" varchar(64);
--> statement-breakpoint
UPDATE "imported_feedback" SET "author_ref" = pg_temp.revualy_reviewer_ref("author_id") WHERE "author_ref" IS NULL;
--> statement-breakpoint
ALTER TABLE "imported_feedback" DROP COLUMN "author_id";
--> statement-breakpoint
ALTER TABLE "imported_feedback" ALTER COLUMN "author_ref" SET NOT NULL;
--> statement-breakpoint

-- ── other links to conversations survive their deletion ──
SELECT pg_temp.revualy_drop_fk('interaction_schedule', 'conversation_id');
--> statement-breakpoint
ALTER TABLE "interaction_schedule" ADD CONSTRAINT "interaction_schedule_conversation_id_fk"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL;
--> statement-breakpoint
SELECT pg_temp.revualy_drop_fk('pulse_check_triggers', 'follow_up_conversation_id');
--> statement-breakpoint
ALTER TABLE "pulse_check_triggers" ADD CONSTRAINT "pulse_check_triggers_follow_up_conversation_id_fk"
  FOREIGN KEY ("follow_up_conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- ── audit_log ─────────────────────────────────────────
-- Append-only and hash-chained. Rows are written by apps/api/src/lib/audit-log.ts
-- under an advisory lock: seq is the chain order, row_hash = sha256 of the
-- canonical row including prev_hash. No foreign keys: entries outlive users.
-- Never holds feedback content.
CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "seq" bigint NOT NULL,
  "occurred_at" timestamptz NOT NULL,
  "actor_id" uuid,
  "action" varchar(100) NOT NULL,
  "target" varchar(255),
  "reason" text,
  "outcome" varchar(50) NOT NULL,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "prev_hash" char(64) NOT NULL,
  "row_hash" char(64) NOT NULL,
  CONSTRAINT "uq_audit_log_seq" UNIQUE ("seq")
);
--> statement-breakpoint
CREATE FUNCTION "audit_log_reject_change"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % refused', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "audit_log_no_update_delete" BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_reject_change"();
--> statement-breakpoint
CREATE TRIGGER "audit_log_no_truncate" BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_reject_change"();
--> statement-breakpoint
-- Belt and braces for any non-owner role: INSERT and SELECT only. (The
-- owner is bound by the triggers, not by grants.)
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_log" FROM PUBLIC;
