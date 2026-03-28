-- Migration: Add org_settings table
-- Single-row table for per-tenant organization metadata (name, subdomain, timezone).

CREATE TABLE IF NOT EXISTS "org_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(255) NOT NULL DEFAULT 'My Organization',
  "subdomain" varchar(100) NOT NULL DEFAULT '',
  "timezone" varchar(100) NOT NULL DEFAULT 'UTC',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Seed a default row so GET always returns data
INSERT INTO "org_settings" ("name", "subdomain", "timezone")
VALUES ('My Organization', '', 'UTC')
ON CONFLICT DO NOTHING;
