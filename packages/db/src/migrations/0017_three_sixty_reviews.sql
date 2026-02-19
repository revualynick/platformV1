-- 360 Manager Reviews: aggregated upward/peer feedback on managers

CREATE TABLE IF NOT EXISTS three_sixty_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES users(id),
  initiated_by_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'collecting',
  target_reviewer_count INTEGER NOT NULL DEFAULT 5,
  completed_reviewer_count INTEGER DEFAULT 0,
  aggregated_data JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_three_sixty_reviews_subject_id
ON three_sixty_reviews (subject_id);

CREATE INDEX IF NOT EXISTS idx_three_sixty_reviews_status
ON three_sixty_reviews (status);

CREATE INDEX IF NOT EXISTS idx_three_sixty_reviews_initiated_by
ON three_sixty_reviews (initiated_by_id);

CREATE TABLE IF NOT EXISTS three_sixty_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES three_sixty_reviews(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users(id),
  feedback_entry_id UUID REFERENCES feedback_entries(id),
  conversation_id UUID REFERENCES conversations(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  invited_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_three_sixty_responses_review_id
ON three_sixty_responses (review_id);

CREATE INDEX IF NOT EXISTS idx_three_sixty_responses_reviewer_id
ON three_sixty_responses (reviewer_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_three_sixty_response_review_reviewer
ON three_sixty_responses (review_id, reviewer_id);
