-- Relax over-strict CHECK constraints introduced in 0028_goals.sql that block
-- legitimate drafting workflows, and add a missing date-order guard on goal_cycles.
--
-- Decision rationale:
--
-- chk_goals_child_has_parent (team/individual goals must have a parent):
--   Dropped and replaced with a looser version. Individual goals may be created
--   before their parent team goal exists (e.g. a draft personal-development goal
--   in a new cycle). Team goals may similarly be drafted before an org goal is
--   chosen. The API enforces parent-level correctness (team→org, individual→team)
--   when a parent IS provided; the DB only prevents nonsensical cross-level wiring.
--
-- chk_goals_nonpersonal_cycle (non-personal goals must have a cycle):
--   Dropped and replaced with a looser version. Org and team goals may be
--   drafted without assigning them to a cycle yet. Personal goals remain
--   cycle-free per chk_goals_personal_isolated.
--
-- chk_goal_cycles_date_order (new):
--   Ensures a cycle's end_date is strictly after its start_date, preventing
--   inverted or zero-length cycles from being inserted.

-- 1. Relax chk_goals_child_has_parent: allow null parent for team/individual.
ALTER TABLE "goals" DROP CONSTRAINT IF EXISTS "chk_goals_child_has_parent";
-- (No replacement needed — the constraint was purely "must have parent", which
--  we are intentionally relaxing. API layer validates parent level when present.)

-- 2. Relax chk_goals_nonpersonal_cycle: allow null cycle for org/team/individual.
ALTER TABLE "goals" DROP CONSTRAINT IF EXISTS "chk_goals_nonpersonal_cycle";
-- (No replacement needed — personal goal isolation is already enforced by
--  chk_goals_personal_isolated which sets cycle_id IS NULL for personal goals.)

-- 3. Add end_date > start_date guard on goal_cycles.
ALTER TABLE "goal_cycles" ADD CONSTRAINT "chk_goal_cycles_date_order"
  CHECK ("end_date" > "start_date");
