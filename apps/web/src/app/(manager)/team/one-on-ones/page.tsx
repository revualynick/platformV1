import { auth } from "@/lib/auth";
import { requireManagerPage } from "@/lib/page-guards";
import { isDemoSession } from "@/lib/session-utils";
import { logPageError } from "@/lib/page-errors";
import {
  getBetweenMeetingGoals,
  getIngestionMode,
  getPendingImports,
  getRecentImports,
  getUsers,
  type BetweenMeetingGoal,
  type IngestionModeInfo,
  type PendingImport,
  type RecentImport,
} from "@/lib/api";
import {
  decideImportAction,
  setMyModeAction,
  updateGoalAction,
  uploadNotesAction,
} from "@/lib/one-on-one-import-actions";
import { ModePicker } from "@/components/one-on-one-imports/mode-picker";
import { PendingImports } from "@/components/one-on-one-imports/pending-imports";
import { UploadNotes } from "@/components/one-on-one-imports/upload-notes";
import { RecentImports } from "@/components/one-on-one-imports/recent-imports";
import { BetweenMeetingGoals } from "@/components/one-on-one-imports/between-meeting-goals";
import { DataUnavailable } from "@/components/data-unavailable";

const DEMO_MODE_INFO: IngestionModeInfo = {
  allowed: ["manual", "semi_automatic"],
  orgMaxMode: "semi_automatic",
  orgDefault: "semi_automatic",
  choice: null,
  effective: "semi_automatic",
  automaticAvailable: false,
  driveConnected: true,
};

/**
 * 1:1 notes for managers: how notes come in (their mode, within the
 * admin's limit), calendar 1:1s waiting for approval, uploads, recent
 * imports, and the between-meeting goals from their 1:1s.
 */
export default async function TeamOneOnOnesPage() {
  await requireManagerPage();
  const session = await auth();
  const viewerId = session?.user?.id ?? "";
  const isDemo = isDemoSession(session);

  let modeInfo: IngestionModeInfo | null = isDemo ? DEMO_MODE_INFO : null;
  let pending: PendingImport[] = [];
  let recent: RecentImport[] = [];
  let goals: BetweenMeetingGoal[] = [];
  let reports: Array<{ id: string; name: string }> = [];

  if (!isDemo) {
    const [modeR, pendingR, recentR, goalsR, reportsR] = await Promise.allSettled([
      getIngestionMode(),
      getPendingImports(),
      getRecentImports(),
      getBetweenMeetingGoals(),
      getUsers({ managerId: viewerId }),
    ]);
    for (const r of [modeR, pendingR, recentR, goalsR, reportsR]) {
      if (r.status === "rejected") logPageError("team-one-on-ones", r.reason);
    }
    if (modeR.status === "fulfilled") modeInfo = modeR.value;
    if (pendingR.status === "fulfilled") pending = pendingR.value.data;
    if (recentR.status === "fulfilled") recent = recentR.value.data;
    if (goalsR.status === "fulfilled") goals = goalsR.value.data;
    if (reportsR.status === "fulfilled") {
      reports = reportsR.value.data.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name }));
    }
  }

  const names = Object.fromEntries(reports.map((r) => [r.id, r.name]));
  const showApprovals = modeInfo?.effective === "semi_automatic" || pending.length > 0;

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">1:1 Notes</h1>
        <p className="mt-1 text-sm text-stone-500">
          Turn your Google Meet 1:1s into tasks, between-meeting goals and goal updates. What's said in a 1:1 stays
          between the two of you.
        </p>
      </div>

      <div className="space-y-5">
        <div className="card-enter">
          {modeInfo ? (
            <ModePicker
              info={modeInfo}
              setModeAction={setMyModeAction}
              connectGoogleHref="/api/integrations/google/authorize?returnTo=/team/one-on-ones"
            />
          ) : (
            <DataUnavailable what="your 1:1 notes settings" />
          )}
        </div>

        {showApprovals && (
          <div className="card-enter" style={{ animationDelay: "60ms" }}>
            <PendingImports imports={pending} decideAction={decideImportAction} />
          </div>
        )}

        <div className="card-enter" style={{ animationDelay: "120ms" }}>
          <UploadNotes counterparts={reports} uploadAction={uploadNotesAction} />
        </div>

        <div className="card-enter" style={{ animationDelay: "180ms" }}>
          <BetweenMeetingGoals goals={goals} names={names} viewerId={viewerId} updateAction={updateGoalAction} />
        </div>

        <div className="card-enter" style={{ animationDelay: "240ms" }}>
          <RecentImports imports={recent} viewerId={viewerId} names={names} />
        </div>
      </div>
    </div>
  );
}
