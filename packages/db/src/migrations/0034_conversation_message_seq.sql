-- C3 step 5: a monotonic sequence for conversation messages.
-- created_at uses now(), which is fixed at transaction start, so a message
-- whose transaction began earlier but waited on a lock can sort before a
-- bot reply committed first, and would then look already answered. A
-- sequence value is assigned when the row is actually inserted, so the
-- turn engine orders by seq, never by created_at. Existing rows are
-- numbered in their current physical order.
ALTER TABLE "conversation_messages"
  ADD COLUMN IF NOT EXISTS "seq" bigint GENERATED ALWAYS AS IDENTITY;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversation_messages_conv_seq"
  ON "conversation_messages" ("conversation_id", "seq");
