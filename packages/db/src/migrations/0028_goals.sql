-- Goals tracking: cycles, goals (org/team/individual/personal ladder),
-- and goal updates (check-in trail).

CREATE TABLE IF NOT EXISTS "goal_cycles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(100) NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_goal_cycles_start_date"
  ON "goal_cycles" ("start_date");

CREATE TABLE IF NOT EXISTS "goals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "level" varchar(20) NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "parent_goal_id" uuid,
  "cycle_id" uuid REFERENCES "goal_cycles"("id"),
  "team_id" uuid REFERENCES "teams"("id"),
  "owner_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_by_id" uuid NOT NULL REFERENCES "users"("id"),
  "status" varchar(20) NOT NULL DEFAULT 'on_track',
  "progress_percent" integer NOT NULL DEFAULT 0,
  "metric_name" varchar(255),
  "metric_start_value" double precision,
  "metric_target_value" double precision,
  "metric_current_value" double precision,
  "share_with_manager" boolean NOT NULL DEFAULT false,
  "target_date" date,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Self-referencing FK (cannot be expressed inline in Drizzle)
ALTER TABLE "goals" ADD CONSTRAINT "fk_goals_parent_goal_id"
  FOREIGN KEY ("parent_goal_id") REFERENCES "goals"("id");

-- Invariants expressible without lookups. Parent *level* correctness
-- (team->org, individual->team) and cycle agreement are API-enforced.
ALTER TABLE "goals" ADD CONSTRAINT "chk_goals_level"
  CHECK ("level" IN ('org', 'team', 'individual', 'personal'));
ALTER TABLE "goals" ADD CONSTRAINT "chk_goals_status"
  CHECK ("status" IN ('draft', 'on_track', 'at_risk', 'behind', 'achieved', 'archived'));
ALTER TABLE "goals" ADD CONSTRAINT "chk_goals_progress"
  CHECK ("progress_percent" BETWEEN 0 AND 100);
ALTER TABLE "goals" ADD CONSTRAINT "chk_goals_personal_isolated"
  CHECK ("level" <> 'personal' OR ("parent_goal_id" IS NULL AND "cycle_id" IS NULL AND "team_id" IS NULL));
ALTER TABLE "goals" ADD CONSTRAINT "chk_goals_org_no_parent"
  CHECK ("level" <> 'org' OR "parent_goal_id" IS NULL);
ALTER TABLE "goals" ADD CONSTRAINT "chk_goals_child_has_parent"
  CHECK ("level" NOT IN ('team', 'individual') OR "parent_goal_id" IS NOT NULL);
ALTER TABLE "goals" ADD CONSTRAINT "chk_goals_nonpersonal_cycle"
  CHECK ("level" = 'personal' OR "cycle_id" IS NOT NULL);
ALTER TABLE "goals" ADD CONSTRAINT "chk_goals_team_has_team"
  CHECK ("level" <> 'team' OR "team_id" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "idx_goals_level" ON "goals" ("level");
CREATE INDEX IF NOT EXISTS "idx_goals_parent_goal_id" ON "goals" ("parent_goal_id");
CREATE INDEX IF NOT EXISTS "idx_goals_cycle_id" ON "goals" ("cycle_id");
CREATE INDEX IF NOT EXISTS "idx_goals_owner_id" ON "goals" ("owner_id");
CREATE INDEX IF NOT EXISTS "idx_goals_team_id" ON "goals" ("team_id");

CREATE TABLE IF NOT EXISTS "goal_updates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "goal_id" uuid NOT NULL REFERENCES "goals"("id"),
  "author_id" uuid NOT NULL REFERENCES "users"("id"),
  "progress_percent" integer,
  "metric_current_value" double precision,
  "status" varchar(20),
  "note" text NOT NULL DEFAULT '',
  "source" varchar(20) NOT NULL DEFAULT 'dashboard',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_goal_updates_goal_created"
  ON "goal_updates" ("goal_id", "created_at");
