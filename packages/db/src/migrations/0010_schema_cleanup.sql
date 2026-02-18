-- Add unique constraint on org_platform_configs (prevent duplicate platform per org)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_org_platform" ON "org_platform_configs" ("org_id", "platform");

-- Remove duplicated resolved_by column (resolved_by_id with FK is the canonical column)
ALTER TABLE "escalations" DROP COLUMN IF EXISTS "resolved_by";

-- Add missing FK references on questionnaires scope columns (matches migration 0004)
-- These FKs already exist from 0004 but are now declared in the Drizzle schema too
-- No-op if constraints already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'questionnaires_created_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "questionnaires"
      ADD CONSTRAINT "questionnaires_created_by_user_id_users_id_fk"
      FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'questionnaires_team_scope_teams_id_fk'
  ) THEN
    ALTER TABLE "questionnaires"
      ADD CONSTRAINT "questionnaires_team_scope_teams_id_fk"
      FOREIGN KEY ("team_scope") REFERENCES "teams"("id");
  END IF;
END $$;
