-- Beta gate review fixes (2026-09-28).

-- 1. self_reflections.conversation_id: SET NULL like every other link to a
-- conversation (0043 missed this one), so retention can delete a
-- conversation that ended with a support signpost; the reflection row stays.
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
    JOIN pg_class t ON t.oid = con.conrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (con.conkey)
    WHERE t.relname = 'self_reflections' AND a.attname = 'conversation_id' AND con.contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE self_reflections DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE "self_reflections" ADD CONSTRAINT "self_reflections_conversation_id_conversations_id_fk"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL;
--> statement-breakpoint
-- 2. checkin_jobs: one row per (reviewer, subject, meeting) even when the
-- subject or meeting is null (Postgres treats NULLs as distinct, so the
-- nightly run duplicated rejected proposals). Keep the earliest of each.
DELETE FROM "checkin_jobs" j USING "checkin_jobs" k
WHERE j.reviewer_id = k.reviewer_id
  AND j.subject_id IS NOT DISTINCT FROM k.subject_id
  AND j.anchor_event_id IS NOT DISTINCT FROM k.anchor_event_id
  AND (j.created_at, j.id) > (k.created_at, k.id);
--> statement-breakpoint
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con JOIN pg_class t ON t.oid = con.conrelid
    WHERE t.relname = 'checkin_jobs' AND con.contype = 'u'
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attnum = ANY (con.conkey))
          = ARRAY['anchor_event_id', 'reviewer_id', 'subject_id']
  LOOP
    EXECUTE format('ALTER TABLE checkin_jobs DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE "checkin_jobs" ADD CONSTRAINT "uq_checkin_jobs_pair"
  UNIQUE NULLS NOT DISTINCT ("reviewer_id", "subject_id", "anchor_event_id");
--> statement-breakpoint
-- 3. imported_feedback.source_key: keyed with the pseudonym secret, so the
-- author can't be recovered by hashing users' emails. New key = HMAC(secret,
-- old key), which is what the code now computes.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
DO $$
DECLARE
  secret text := current_setting('revualy.pseudonym_secret', true);
BEGIN
  IF EXISTS (SELECT 1 FROM imported_feedback) THEN
    IF secret IS NULL OR length(secret) < 32 THEN
      RAISE EXCEPTION 'migration 0051 needs REVIEWER_PSEUDONYM_SECRET to rekey imported feedback; run migrations through the API (runMigrations)';
    END IF;
    UPDATE imported_feedback
      SET source_key = encode(hmac(convert_to(source_key, 'UTF8'), convert_to(secret, 'UTF8'), 'sha256'), 'hex');
  END IF;
END $$;
