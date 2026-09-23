-- Persist questionnaire_id on conversations so an in-progress conversation can
-- be fully reconstructed from the DB after Redis conversation-state loss.
-- Nullable: legacy rows and non-questionnaire interaction flows have no id.
ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "questionnaire_id" uuid
  REFERENCES "questionnaires"("id") ON DELETE SET NULL;

-- Allow true ON CONFLICT DO NOTHING dedup of calendar-inferred relationships.
-- Collapse any pre-existing exact-duplicate directional pairs first, then
-- enforce uniqueness so concurrent calendar syncs landing on the same pair in
-- the same window can't insert duplicates. When duplicates exist we keep the
-- preferred survivor per (from,to) pair: prefer active over inactive, then the
-- most recently updated, with ctid as a final deterministic tie-break.
DELETE FROM "user_relationships" a
  USING "user_relationships" b
  WHERE a.from_user_id = b.from_user_id
    AND a.to_user_id = b.to_user_id
    AND (
      (a.is_active < b.is_active)
      OR (a.is_active = b.is_active AND a.updated_at < b.updated_at)
      OR (a.is_active = b.is_active AND a.updated_at = b.updated_at AND a.ctid < b.ctid)
    );

ALTER TABLE "user_relationships"
  ADD CONSTRAINT "uq_user_relationship_pair" UNIQUE ("from_user_id", "to_user_id");
