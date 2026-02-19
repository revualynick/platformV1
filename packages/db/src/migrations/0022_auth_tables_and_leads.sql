-- Migration: Add auth tables + leads table to tenant DB
-- Per-tenant deployment: auth tables now live alongside business data.

CREATE TABLE IF NOT EXISTS "auth_user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text,
  "email" text UNIQUE,
  "emailVerified" timestamp,
  "image" text,
  "org_id" uuid,
  "tenant_user_id" uuid UNIQUE,
  "role" varchar(50),
  "team_id" uuid,
  "onboarding_completed" boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS "idx_auth_user_email" ON "auth_user" ("email");
CREATE INDEX IF NOT EXISTS "idx_auth_user_tenant_user_id" ON "auth_user" ("tenant_user_id");

CREATE TABLE IF NOT EXISTS "auth_account" (
  "userId" text NOT NULL REFERENCES "auth_user"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "provider" text NOT NULL,
  "providerAccountId" text NOT NULL,
  "refresh_token" text,
  "access_token" text,
  "expires_at" integer,
  "token_type" text,
  "scope" text,
  "id_token" text,
  "session_state" text,
  PRIMARY KEY ("provider", "providerAccountId")
);

CREATE TABLE IF NOT EXISTS "auth_session" (
  "sessionToken" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "auth_user"("id") ON DELETE CASCADE,
  "expires" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "auth_verification_token" (
  "identifier" text NOT NULL,
  "token" text NOT NULL,
  "expires" timestamp NOT NULL,
  PRIMARY KEY ("identifier", "token")
);

CREATE TABLE IF NOT EXISTS "leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" varchar(255) NOT NULL,
  "name" varchar(255),
  "count_today" integer NOT NULL DEFAULT 0,
  "conversation_date" date,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "uq_leads_email" UNIQUE ("email")
);

CREATE INDEX IF NOT EXISTS "idx_leads_email" ON "leads" ("email");
