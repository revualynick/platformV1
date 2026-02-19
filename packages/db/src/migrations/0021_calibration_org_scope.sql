-- Drop the week-only unique constraint and replace with (orgId, weekStarting)
ALTER TABLE "calibration_reports" DROP CONSTRAINT IF EXISTS "uq_calibration_report_week";
ALTER TABLE "calibration_reports" ADD CONSTRAINT "uq_calibration_report_org_week" UNIQUE("org_id", "week_starting");
