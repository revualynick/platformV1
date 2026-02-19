-- Additional indexes and constraints (review round 2)

-- kudos.giver_id index for "kudos I gave" queries (finding #11)
CREATE INDEX IF NOT EXISTS idx_kudos_giver_id
ON kudos (giver_id);

-- conversation_messages composite index for message ordering (finding #11)
CREATE INDEX IF NOT EXISTS idx_conversation_messages_conv_created
ON conversation_messages (conversation_id, created_at DESC);

-- platformUserId must be unique per platform (finding #19)
-- Prevents same Slack/GChat user ID being claimed by multiple Revualy users
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_user_id
ON user_platform_identities (platform, platform_user_id);

-- conversation_messages cascade delete when conversation is deleted (finding #12)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'conversation_messages'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%conversation_id%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE conversation_messages DROP CONSTRAINT ' || quote_ident(constraint_name)
      FROM information_schema.table_constraints
      WHERE table_name = 'conversation_messages'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%conversation_id%'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE conversation_messages
  ADD CONSTRAINT conversation_messages_conversation_id_fk
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
