import { requireAdminPage } from "@/lib/page-guards";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  getGoalCycles,
  getCurrentCycle,
  getOrgGoalsWithAlignment,
  getOrgSettings,
} from "@revualy/db/queries";
import { isDemoSession } from "@/lib/session-utils";
import { mockGoalCycle, mockOrgGoalsWithAlignment } from "@/lib/mock-data";
import { GoalCard, type GoalCardGoal } from "@/components/goals/goal-card";
import { GoalStatusBadge } from "@/components/goals/status-badge";
import { CreateGoalModal } from "@/components/goals/create-goal-modal";
import { EmptyState } from "@/components/empty-state";
import { DataUnavailable } from "@/components/data-unavailable";
import { logPageError } from "@/lib/page-errors";
import { CycleModal } from "./cycle-modal";
import { CheckInMarkerForm } from "./check-in-marker-form";
import {
  createCycleAction,
  createOrgGoalAction,
  adminCheckInAction,
  saveCheckInMarkerAction,
} from "./actions";

export const dynamic = "force-dynamic";

interface CycleRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

type OrgGoal = GoalCardGoal & {
  childTeamGoals: Array<{
    id: string;
    title: string;
    status: string;
    effectiveProgress: number;
  }>;
};

async function AdminGoalsContent({ isDemo }: { isDemo: boolean }) {
  let cycles: CycleRow[] = isDemo ? [mockGoalCycle] : [];
  let currentCycle: CycleRow | null = isDemo ? mockGoalCycle : null;
  let orgGoals: OrgGoal[] = isDemo ? (mockOrgGoalsWithAlignment as OrgGoal[]) : [];
  let checkInMarker = "[Check-in]";
  let loadFailed = false;

  if (!isDemo) {
    try {
      const db = getDb();
      const [cyclesResult, currentResult, settingsResult] = await Promise.allSettled([
        getGoalCycles(db),
        getCurrentCycle(db),
        getOrgSettings(db),
      ]);
      for (const result of [cyclesResult, currentResult, settingsResult]) {
        if (result.status === "rejected") logPageError("admin-goals", result.reason);
      }
      if (cyclesResult.status === "fulfilled") cycles = cyclesResult.value;
      if (settingsResult.status === "fulfilled" && settingsResult.value) {
        checkInMarker = settingsResult.value.checkInTitleMarker;
      }
      if (currentResult.status === "fulfilled" && currentResult.value) {
        currentCycle = currentResult.value;
        orgGoals = (await getOrgGoalsWithAlignment(db, currentCycle.id).catch(
          (err) => {
            logPageError("admin-goals", err);
            return [];
          },
        )) as OrgGoal[];
      }
      loadFailed =
        cyclesResult.status === "rejected" &&
        currentResult.status === "rejected" &&
        settingsResult.status === "rejected";
    } catch (err) {
      logPageError("admin-goals", err);
      loadFailed = true;
    }
  }

  if (loadFailed && !isDemo) {
    return <DataUnavailable what="goal settings" />;
  }

  return (
    <div className="space-y-8">
      {/* Setup order — shown until the ladder has its anchors */}
      {!isDemo && (cycles.length === 0 || orgGoals.length === 0) && (
        <div className="rounded-2xl border border-forest/20 bg-forest/[0.04] p-5">
          <h2 className="font-display text-sm font-semibold text-stone-900">Setup order</h2>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-sm text-stone-600">
            <li>Create a goal cycle</li>
            <li>Create org goals</li>
            <li>Managers ladder team goals to them</li>
            <li>Employees ladder individual goals to team goals</li>
          </ol>
        </div>
      )}
      <section
        className="rounded-2xl border border-stone-200/60 bg-surface p-6"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-stone-900">
              Goal Cycles
            </h2>
            <p className="text-sm text-stone-500">
              Time periods that org, team, and individual goals live in
            </p>
          </div>
          <CycleModal createAction={createCycleAction} />
        </div>
        {cycles.length === 0 ? (
          <p className="text-sm text-stone-400">
            No cycles yet — create one to start setting goals.
          </p>
        ) : (
          <div className="divide-y divide-stone-100">
            {cycles.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm font-medium text-stone-800">
                  {c.name}
                  {currentCycle?.id === c.id && (
                    <span className="ml-2 rounded-full bg-forest/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-forest">
                      Current
                    </span>
                  )}
                </span>
                <span className="text-xs tabular-nums text-stone-400">
                  {c.startDate} → {c.endDate}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section
        className="rounded-2xl border border-stone-200/60 bg-surface p-6"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        <div className="mb-4">
          <h2 className="font-display text-lg font-semibold text-stone-900">
            Check-in Meetings
          </h2>
          <p className="text-sm text-stone-500">
            Meet transcripts from marked calendar events become suggested goal
            updates for the goal owner to confirm. How the chain works:
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-stone-500">
            <li>Set the marker here (e.g. &ldquo;[Check-in]&rdquo;)</li>
            <li>
              Each manager connects Google from their own{" "}
              <Link href="/dashboard/settings" className="font-medium text-forest hover:text-forest-light">
                Settings page
              </Link>{" "}
              — calendar + transcript access
            </li>
            <li>
              Managers title check-in events with the marker, e.g.
              &ldquo;[Check-in] Sarah × Jordan — July&rdquo;
            </li>
            <li>
              Transcription must be turned on inside the Meet call (Workspace
              Business Standard+)
            </li>
            <li>
              Suggested goal updates appear on manager/employee goal pages for
              review — nothing is applied automatically
            </li>
          </ol>
        </div>
        <CheckInMarkerForm
          currentMarker={checkInMarker}
          saveAction={saveCheckInMarkerAction}
        />
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-stone-900">
              Org Goals{currentCycle ? ` — ${currentCycle.name}` : ""}
            </h2>
            <p className="text-sm text-stone-500">
              The top of the ladder: what the whole company is driving toward
            </p>
          </div>
          <CreateGoalModal
            level="org"
            buttonLabel="New org goal"
            cycleId={currentCycle?.id ?? null}
            cycleName={currentCycle?.name}
            createAction={createOrgGoalAction}
          />
        </div>
        {orgGoals.length === 0 ? (
          <EmptyState
            icon="◍"
            title="No org goals this cycle"
            description="Org goals anchor the whole ladder — teams ladder their goals up to these."
          />
        ) : (
          <div className="space-y-4">
            {orgGoals.map((g) => (
              <div key={g.id}>
                <GoalCard goal={g} checkInAction={adminCheckInAction} />
                {g.childTeamGoals.length > 0 && (
                  <div className="ml-6 mt-2 space-y-1.5 border-l-2 border-stone-100 pl-4">
                    {g.childTeamGoals.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="flex items-center gap-2 text-stone-600">
                          <span className="text-stone-300">↳</span>
                          {c.title}
                          <GoalStatusBadge status={c.status} />
                        </span>
                        <span className="text-xs font-semibold tabular-nums text-stone-500">
                          {c.effectiveProgress}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default async function AdminGoalsPage() {
  await requireAdminPage();
  const session = await auth();
  const isDemo = process.env.DEMO_MODE === "true" && (!session || isDemoSession(session));
  if (!session?.user?.id && !isDemo) redirect("/login");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-stone-900">Goals</h1>
        <Link
          href="/dashboard/goals/alignment"
          className="text-sm font-medium text-forest hover:text-forest-light"
        >
          View org alignment →
        </Link>
      </div>
      
        <AdminGoalsContent isDemo={isDemo} />
      
    </div>
  );
}
