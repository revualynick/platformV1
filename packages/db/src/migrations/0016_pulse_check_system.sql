-- Pulse check configuration table
CREATE TABLE IF NOT EXISTS "pulse_check_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "negative_sentiment_threshold" integer DEFAULT 2 NOT NULL,
  "window_days" integer DEFAULT 7 NOT NULL,
  "cooldown_days" integer DEFAULT 14 NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Add source_ref index for pulse_check_triggers to speed up cooldown lookups
CREATE INDEX IF NOT EXISTS "idx_pulse_check_triggers_source_ref" ON "pulse_check_triggers" ("source_ref");
