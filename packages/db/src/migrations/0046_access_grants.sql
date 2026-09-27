-- Break-glass access grants (docs/design/privacy-and-agent-access.md).
-- An admin records a reason and gets read-only content access to one
-- person for a dated period, for up to 30 days. reason and hold_reason are
-- encrypted by the application.
CREATE TABLE IF NOT EXISTS "access_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "grantee_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "subject_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "scope" varchar(20) DEFAULT 'content' NOT NULL,
  "reason" text NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "hold_reason" text,
  "hold_lifted_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "revoked_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "chk_access_grants_scope" CHECK ("scope" IN ('content')),
  CONSTRAINT "chk_access_grants_period" CHECK ("period_end" >= "period_start"),
  CONSTRAINT "chk_access_grants_not_self" CHECK ("grantee_id" <> "subject_id"),
  CONSTRAINT "chk_access_grants_expiry" CHECK ("expires_at" > "created_at" AND "expires_at" <= "created_at" + interval '30 days')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_access_grants_grantee_subject" ON "access_grants" ("grantee_id", "subject_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_access_grants_subject" ON "access_grants" ("subject_id");
