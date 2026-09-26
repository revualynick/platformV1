-- C3 step 6: conversations that go quiet become `incomplete` and are
-- analysed as partial. Partial feedback is stored and shown (labelled) but
-- kept out of quality averages and completed-interaction counts.
-- (Reflections use status 'partial'; that column is free text, no change.)
ALTER TABLE "feedback_entries" ADD COLUMN IF NOT EXISTS "is_partial" boolean NOT NULL DEFAULT false;
