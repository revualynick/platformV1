-- Composite indexes for hot query patterns (findings #27)

-- escalation_notes: filtered by escalation_id, sorted by created_at
CREATE INDEX IF NOT EXISTS idx_escalation_notes_escalation_created
ON escalation_notes (escalation_id, created_at);

-- feedback_entries: filtered by subject_id, sorted by created_at
CREATE INDEX IF NOT EXISTS idx_feedback_entries_subject_created
ON feedback_entries (subject_id, created_at DESC);

-- conversations: filtered by reviewer_id, sorted by created_at
CREATE INDEX IF NOT EXISTS idx_conversations_reviewer_created
ON conversations (reviewer_id, created_at DESC);

-- calendar_events: filtered by user_id + time range
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_start
ON calendar_events (user_id, start_at);

-- Fix escalation_notes cascade delete (finding #25)
-- Drop the old FK constraint and recreate with ON DELETE CASCADE
DO $$
BEGIN
  -- Find and drop existing FK constraint on escalation_notes.escalation_id
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'escalation_notes'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%escalation_id%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE escalation_notes DROP CONSTRAINT ' || quote_ident(constraint_name)
      FROM information_schema.table_constraints
      WHERE table_name = 'escalation_notes'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%escalation_id%'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE escalation_notes
  ADD CONSTRAINT escalation_notes_escalation_id_fk
  FOREIGN KEY (escalation_id) REFERENCES escalations(id) ON DELETE CASCADE;

-- Check constraint: escalation must have at least one origin (finding #26)
-- Either feedbackEntryId or reporterId must be non-null
ALTER TABLE escalations
  ADD CONSTRAINT chk_escalation_has_origin
  CHECK (feedback_entry_id IS NOT NULL OR reporter_id IS NOT NULL);
