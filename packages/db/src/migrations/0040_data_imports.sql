-- Customer data imports: stage -> map -> dry run -> admin approves -> commit.
-- Nothing reaches users, goals or feedback until an admin approves a run.
-- Staged rows are personal data: raw and mapped are encrypted JSON (text
-- columns, encrypted in the ORM) and deleted 30 days after commit, or 30
-- days after upload for runs never committed (rows_purge_after; the
-- conversation sweeper calls purgeExpiredImportRows).
CREATE TABLE IF NOT EXISTS "import_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "kind" varchar(20) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'staged',
  -- 'file' today; 'google_sheet' is designed for (same tabular rows), not built.
  "source_type" varchar(20) NOT NULL DEFAULT 'file',
  -- Free label for the old tool (e.g. culture_amp), copied onto imported feedback.
  "source_system" varchar(50),
  "file_name" varchar(255),
  "content_type" varchar(100),
  "file_size" integer,
  "file_sha256" varchar(64),
  -- Header row of a tabular file (column names only, no cell values).
  "columns" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "row_count" integer NOT NULL DEFAULT 0,
  "mapping" jsonb,
  -- model | heuristic | admin
  "mapping_source" varchar(20),
  "report" jsonb,
  "error" text,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "approved_by" uuid REFERENCES "users"("id"),
  "approved_at" timestamptz,
  "committed_at" timestamptz,
  "rows_purge_after" timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "chk_import_runs_kind" CHECK ("kind" IN ('people', 'goals', 'feedback', 'org_chart')),
  CONSTRAINT "chk_import_runs_status" CHECK ("status" IN ('staged', 'mapped', 'dry_run', 'approved', 'committed', 'failed')),
  CONSTRAINT "chk_import_runs_source_type" CHECK ("source_type" IN ('file', 'google_sheet'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_import_runs_created" ON "import_runs" ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_import_runs_purge" ON "import_runs" ("rows_purge_after");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_rows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" uuid NOT NULL REFERENCES "import_runs"("id") ON DELETE CASCADE,
  "row_index" integer NOT NULL,
  -- Encrypted JSON: the cells as uploaded (or the model's reading of a chart).
  "raw" text NOT NULL,
  -- Encrypted JSON: the row after the mapping is applied.
  "mapped" text,
  -- staged | ready | invalid | applied | skipped
  "status" varchar(20) NOT NULL DEFAULT 'staged',
  -- create | update | none
  "action" varchar(20),
  -- Field names and reasons only, never cell values.
  "error" text,
  "target_id" uuid,
  CONSTRAINT "uq_import_rows_run_index" UNIQUE ("run_id", "row_index")
);
--> statement-breakpoint
-- Historical feedback from the old tool. Kept apart from feedback_entries
-- (which needs a conversation) so it can never feed engagement scores,
-- digests or calibration. Text encrypted like other feedback.
CREATE TABLE IF NOT EXISTS "imported_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "author_id" uuid NOT NULL REFERENCES "users"("id"),
  "recipient_id" uuid NOT NULL REFERENCES "users"("id"),
  "given_at" timestamptz NOT NULL,
  "content" text NOT NULL,
  "source_system" varchar(50) NOT NULL DEFAULT 'import',
  "import_run_id" uuid REFERENCES "import_runs"("id") ON DELETE SET NULL,
  -- sha256 of author, recipient, date and text: re-imports skip what exists.
  "source_key" varchar(64) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_imported_feedback_source_key" UNIQUE ("source_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_imported_feedback_recipient" ON "imported_feedback" ("recipient_id", "given_at");
--> statement-breakpoint
-- People imports carry a job title and start date; nowhere held them before.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "job_title" varchar(255);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "start_date" date;
--> statement-breakpoint
-- Stable identity for an imported goal (the source's id, or owner + title),
-- so re-importing a delta updates the goal instead of duplicating it.
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "import_key" varchar(128);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_goals_import_key" ON "goals" ("import_key") WHERE "import_key" IS NOT NULL;
