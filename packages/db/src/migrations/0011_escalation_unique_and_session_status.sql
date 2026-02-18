-- Prevent duplicate escalations for the same feedback entry
CREATE UNIQUE INDEX IF NOT EXISTS uq_escalation_feedback_entry
ON escalations (feedback_entry_id)
WHERE feedback_entry_id IS NOT NULL;
