-- Beta gate monitoring (C3 step 8): when each scheduled job last ran and
-- last succeeded, and the alert job's memory of what it has already sent.
-- No personal data: job names, times, counts and error class names only.
CREATE TABLE IF NOT EXISTS "ops_heartbeats" (
  "job" varchar(50) PRIMARY KEY NOT NULL,
  "last_run_at" timestamp with time zone NOT NULL,
  "last_ok_at" timestamp with time zone,
  "last_error" varchar(200),
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
