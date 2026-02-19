-- Calibration engine: weekly bias detection + cross-team comparison reports

CREATE TABLE IF NOT EXISTS calibration_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  week_starting DATE NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One report per week
CREATE UNIQUE INDEX IF NOT EXISTS uq_calibration_report_week
ON calibration_reports (week_starting);

CREATE INDEX IF NOT EXISTS idx_calibration_reports_week_starting
ON calibration_reports (week_starting);
