-- Schema hardening (review round 3)

-- #24: platformMessageId should be unique within a conversation
CREATE UNIQUE INDEX IF NOT EXISTS uq_conv_msg_platform_id
ON conversation_messages (conversation_id, platform_message_id)
WHERE platform_message_id IS NOT NULL;

-- #33: questions.core_value_id — add SET NULL on delete
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'questions'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%core_value_id%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE questions DROP CONSTRAINT ' || quote_ident(constraint_name)
      FROM information_schema.table_constraints
      WHERE table_name = 'questions'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%core_value_id%'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE questions
  ADD CONSTRAINT questions_core_value_id_fk
  FOREIGN KEY (core_value_id) REFERENCES core_values(id) ON DELETE SET NULL;

-- #35: pulseCheckTriggers indexes
CREATE INDEX IF NOT EXISTS idx_pulse_check_triggers_source_type
ON pulse_check_triggers (source_type);

CREATE INDEX IF NOT EXISTS idx_pulse_check_triggers_created_at
ON pulse_check_triggers (created_at);

-- #34: Add comment clarifying rank column semantics
COMMENT ON COLUMN engagement_scores.rank IS 'Org-wide rank for the week (computed by scheduler). NULL means not yet computed.';
