-- Theme discovery: AI-discovered recurring themes from feedback content

CREATE TABLE IF NOT EXISTS "discovered_themes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(200) NOT NULL,
  "description" text,
  "frequency" integer DEFAULT 0 NOT NULL,
  "confidence" real DEFAULT 0 NOT NULL,
  "trend" varchar(20) DEFAULT 'stable',
  "related_core_value_id" uuid REFERENCES "core_values"("id") ON DELETE SET NULL,
  "sample_evidence" jsonb DEFAULT '[]',
  "status" varchar(20) DEFAULT 'suggested',
  "accepted_as_theme_id" uuid REFERENCES "questionnaire_themes"("id") ON DELETE SET NULL,
  "discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_discovered_themes_status" ON "discovered_themes" ("status");
CREATE INDEX IF NOT EXISTS "idx_discovered_themes_discovered_at" ON "discovered_themes" ("discovered_at");
