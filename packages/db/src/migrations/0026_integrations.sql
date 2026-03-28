CREATE TABLE IF NOT EXISTS "integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "platform" varchar(50) NOT NULL,
  "name" varchar(255) NOT NULL,
  "status" varchar(50) NOT NULL DEFAULT 'disconnected',
  "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "workspace" varchar(255),
  "connected_at" timestamp with time zone,
  "connected_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "integrations_platform_idx" ON "integrations" ("platform");
