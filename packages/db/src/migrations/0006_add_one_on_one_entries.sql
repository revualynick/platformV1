-- Shared 1:1 notes between manager and employee
CREATE TABLE IF NOT EXISTS one_on_one_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id UUID NOT NULL REFERENCES users(id),
  employee_id UUID NOT NULL REFERENCES users(id),
  author_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_one_on_one_entries_pair ON one_on_one_entries(manager_id, employee_id);
CREATE INDEX idx_one_on_one_entries_created_at ON one_on_one_entries(created_at);

-- Revision history for edited entries
CREATE TABLE IF NOT EXISTS one_on_one_entry_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES one_on_one_entries(id) ON DELETE CASCADE,
  previous_content TEXT NOT NULL,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_one_on_one_revisions_entry_id ON one_on_one_entry_revisions(entry_id);
