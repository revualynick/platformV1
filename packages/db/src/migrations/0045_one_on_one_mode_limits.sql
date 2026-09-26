-- 1:1 ingestion: the admin sets the most automatic mode allowed; each
-- manager picks their own mode within it (Nick, 2026-09-26).
-- org_settings.one_on_one_ingestion_mode (0041) stays as the default for
-- managers who haven't chosen.
ALTER TABLE "org_settings"
  ADD COLUMN IF NOT EXISTS "one_on_one_max_mode" varchar(20) NOT NULL DEFAULT 'semi_automatic';
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "org_settings" ADD CONSTRAINT "chk_org_settings_max_mode"
    CHECK ("one_on_one_max_mode" IN ('automatic', 'semi_automatic', 'manual'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
-- NULL = use the org default.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "one_on_one_ingestion_mode" varchar(20);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "chk_users_ingestion_mode"
    CHECK ("one_on_one_ingestion_mode" IS NULL OR "one_on_one_ingestion_mode" IN ('automatic', 'semi_automatic', 'manual'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
