import { requireAdminPage } from "@/lib/page-guards";
import { auth } from "@/lib/auth";
import { isDemoSession } from "@/lib/session-utils";
import { getDb } from "@/lib/db";
import { getOrgSettings } from "@revualy/db/queries";
import { logPageError } from "@/lib/page-errors";
import type { IngestionMode } from "@/lib/api";
import { saveOrgModeLimitsAction } from "@/lib/one-on-one-import-actions";
import { DataUnavailable } from "@/components/data-unavailable";
import { ModeLimitsForm } from "./mode-limits-form";

const MODES: IngestionMode[] = ["manual", "semi_automatic", "automatic"];
const asMode = (v: unknown, fallback: IngestionMode): IngestionMode =>
  MODES.includes(v as IngestionMode) ? (v as IngestionMode) : fallback;

/** No automatic meeting source is connected yet (see apps/api/src/lib/ingestion-mode.ts). */
const AUTOMATIC_AVAILABLE = false;

export default async function AdminOneOnOnesPage() {
  await requireAdminPage();
  const session = await auth();
  const isDemo = isDemoSession(session);

  let maxMode: IngestionMode = "semi_automatic";
  let defaultMode: IngestionMode = "semi_automatic";
  let loadFailed = false;
  if (!isDemo) {
    try {
      const settings = await getOrgSettings(getDb());
      maxMode = asMode(settings?.oneOnOneMaxMode, "semi_automatic");
      defaultMode = asMode(settings?.oneOnOneIngestionMode, "semi_automatic");
    } catch (err) {
      logPageError("admin-one-on-ones", err);
      loadFailed = true;
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">1:1 Notes</h1>
        <p className="mt-1 text-sm text-stone-500">
          Decide how far managers can automate importing their Google Meet 1:1 notes. Each manager chooses their own
          mode within this limit.
        </p>
      </div>

      <div className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6" style={{ boxShadow: "var(--shadow-sm)" }}>
        {loadFailed ? (
          <DataUnavailable what="the 1:1 notes settings" />
        ) : (
          <ModeLimitsForm
            maxMode={maxMode}
            defaultMode={defaultMode}
            automaticAvailable={AUTOMATIC_AVAILABLE}
            saveAction={saveOrgModeLimitsAction}
          />
        )}
      </div>

      <div className="card-enter mt-5 rounded-2xl border border-stone-200/60 bg-surface p-6 text-sm text-stone-600" style={{ boxShadow: "var(--shadow-sm)", animationDelay: "80ms" }}>
        <h2 className="font-display text-base font-semibold text-stone-800">What this does and doesn't allow</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>Uploading notes by hand is always possible, whatever the limit.</li>
          <li>
            Only the two people in a 1:1 see its tasks, between-meeting goals and suggestions. Admins and skip-level
            managers don't, and this setting doesn't change that.
          </li>
          <li>Anything about wellbeing, conduct or safety is held back from what's created, and only counted.</li>
          <li>
            Automatic needs an organisation-wide Google connection that isn't built yet, so it can't be selected. Until
            then, a manager on automatic would get semi-automatic.
          </li>
        </ul>
      </div>
    </div>
  );
}
