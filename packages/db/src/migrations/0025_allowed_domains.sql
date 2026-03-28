-- Migration: Add allowed_domains to org_settings
-- JSON array of email domains permitted for self-service sign-up.
-- Empty array = no self-provisioning allowed (admin must pre-create users).

ALTER TABLE "org_settings"
ADD COLUMN IF NOT EXISTS "allowed_domains" jsonb NOT NULL DEFAULT '[]'::jsonb;
