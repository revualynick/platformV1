-- Phase 3: Add ownership/scope columns to questionnaires for manager question bank
ALTER TABLE questionnaires ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id);
ALTER TABLE questionnaires ADD COLUMN IF NOT EXISTS team_scope UUID REFERENCES teams(id);

CREATE INDEX IF NOT EXISTS idx_questionnaires_created_by ON questionnaires(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_questionnaires_team_scope ON questionnaires(team_scope);
