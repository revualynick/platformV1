import { requireManagerPage } from "@/lib/page-guards";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  getManagerGoalView,
  getCurrentCycle,
  getOrgGoalsForCycle,
  getOrgSettings,
  getPendingSuggestionsForGoals,
  listActiveUsers,
} from "@revualy/db/queries";
import { isDemoSession } from "@/lib/session-utils";
import { getGoogleIntegrationStatus } from "@/lib/api";
import { logPageError } from "@/lib/page-errors";
import { mockManagerGoalView, mockGoalCycle, mockGoalSuggestions } from "@/lib/mock-data";
import { GoalCard, type GoalCardGoal } from "@/components/goals/goal-card";
import type { SuggestionView } from "@/components/goals/suggestion-review-modal";
import { CreateGoalModal } from "@/components/goals/create-goal-modal";
import { EmptyState } from "@/components/empty-state";
import { InfoHint } from "@/components/info-hint";
import { DismissibleCard } from "@/components/dismissible-card";
import { DataUnavailable } from "@/components/data-unavailable";
import { createTeamScopedGoalAction, managerCheckInAction } from "./actions";
import {
  applySuggestionAction,
  dismissSuggestionAction,
} from "@/app/(employee)/dashboard/goals/actions";

export const dynamic = "force-dynamic";

type OwnedGoal = GoalCardGoal & { ownerName?: string };

interface View {
  ownedTeams: Array<{ id: string; name: string }>;
  teamGoals: OwnedGoal[];
  individualGoals: OwnedGoal[];
  sharedPersonalGoals: OwnedGoal[];
}

async function TeamGoalsContent({ userId, isDemo }: { userId: string; isDemo: boolean }) {
  let view: View = isDemo
    ? (mockManagerGoalView as View)
    : { ownedTeams: [], teamGoals: [], individualGoals: [], sharedPersonalGoals: [] };
  let cycle: { id: string; name: string } | null = isDemo ? mockGoalCycle : null;
  let orgGoalOptions: Array<{ id: string; label: string }> = isDemo
    ? [{ id: "g-o1", label: "Grow NPS from 42 to 55" }]
    : [];
  let reportOptions: Array<{ id: string; label: string }> = [];
  let suggestionsByGoal = new Map<string, SuggestionView[]>(
    isDemo ? [["g-i2", mockGoalSuggestions]] : [],
  );
  let loadFailed = false;
  let checkInMarker = "[Check-in]";
  let googleStatus: "connected" | "not_connected" | "missing_scope" | "unknown" =
    "unknown";

  if (!isDemo) {
    try {
      const db = getDb();
      const [viewResult, cycleResult, reportsResult, settingsResult] =
        await Promise.allSettled([
          getManagerGoalView(db, userId),
          getCurrentCycle(db),
          listActiveUsers(db, { managerId: userId }),
          getOrgSettings(db),
        ]);
      if (
        settingsResult.status === "fulfilled" &&
        settingsResult.value?.checkInTitleMarker
      ) {
        checkInMarker = settingsResult.value.checkInTitleMarker;
      }
      if (viewResult.status === "fulfilled") {
        view = viewResult.value as View;
        const raw = await getPendingSuggestionsForGoals(db, [
          ...view.teamGoals.map((g) => g.id),
          ...view.individualGoals.map((g) => g.id),
        ], userId).catch(
          () => new Map() as Awaited<ReturnType<typeof getPendingSuggestionsForGoals>>,
        );
        suggestionsByGoal = new Map(
          [...raw.entries()].map(([goalId, list]) => [
            goalId,
            list.map((s) => ({ ...s, meetingDate: s.meetingDate.toISOString() })),
          ]),
        );
      }
      if (cycleResult.status === "fulfilled" && cycleResult.value) {
        cycle = cycleResult.value;
        const orgGoals = await getOrgGoalsForCycle(db, cycle.id).catch((err) => {
          logPageError("team-goals:org-options", err);
          return [];
        });
        orgGoalOptions = orgGoals.map((g) => ({ id: g.id, label: g.title }));
      }
      if (reportsResult.status === "fulfilled") {
        reportOptions = reportsResult.value.map((u) => ({ id: u.id, label: u.name }));
      }
    } catch (err) {
      logPageError("team-goals", err);
      loadFailed = true;
    }

    try {
      const status = await getGoogleIntegrationStatus();
      googleStatus = status.connected
        ? status.hasDriveScope
          ? "connected"
          : "missing_scope"
        : "not_connected";
    } catch {
      // status endpoint can be unreachable (e.g. demo) — leave unknown
    }
  }

  if (loadFailed && !isDemo) {
    return <DataUnavailable what="your team's goals" />;
  }

  const teamGoalOptions = view.teamGoals.map((g) => ({ id: g.id, label: g.title }));
  const byOwner = new Map<string, OwnedGoal[]>();
  for (const g of view.individualGoals) {
    const key = g.ownerName ?? "Unknown";
    byOwner.set(key, [...(byOwner.get(key) ?? []), g]);
  }

  return (
    <div className="space-y-8">
      {!isDemo && !cycle && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No goal cycle yet — an admin needs to create one under Settings →
          Goals before goals can be set.
        </div>
      )}
      {!isDemo && cycle && orgGoalOptions.length === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Team goals ladder up to org goals <InfoHint entry="laddering" /> —
          ask an admin to create org goals first.
        </div>
      )}

      <DismissibleCard id="checkin-explainer" title="How check-in suggestions work">
        <ol className="list-decimal space-y-1.5 pl-4">
          <li>
            Your admin sets a meeting title marker — currently{" "}
            <code className="rounded bg-stone-100 px-1 py-0.5 text-xs text-stone-700">
              {checkInMarker}
            </code>
            .
          </li>
          <li>
            Connect Google in your own{" "}
            <Link
              href="/dashboard/settings"
              className="font-medium text-forest hover:text-forest-light"
            >
              Settings
            </Link>{" "}
            —{" "}
            {googleStatus === "connected" && (
              <span className="font-medium text-forest">✓ connected</span>
            )}
            {googleStatus === "not_connected" && (
              <span className="font-medium text-danger">
                ✗ not connected —{" "}
                <Link href="/dashboard/settings" className="underline">
                  connect now
                </Link>
              </span>
            )}
            {googleStatus === "missing_scope" && (
              <span className="font-medium text-warning">
                ⚠ connected but transcript access missing —{" "}
                <Link href="/dashboard/settings" className="underline">
                  reconnect
                </Link>
              </span>
            )}
            {googleStatus === "unknown" && (
              <span className="text-stone-400">status unavailable</span>
            )}
          </li>
          <li>
            Title your 1:1 calendar events with the marker, e.g.{" "}
            &ldquo;{checkInMarker} Sarah × Jordan — July&rdquo;.
          </li>
          <li>Turn on transcription in the Meet call.</li>
          <li>
            Suggested updates appear as ✨ badges on the goal cards below —
            you review and apply, nothing is automatic.
          </li>
        </ol>
      </DismissibleCard>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-stone-900">
              Team Goals
            </h2>
            <p className="text-sm text-stone-500">
              Ladder up to org goals{cycle ? ` — ${cycle.name}` : ""}
            </p>
          </div>
          <CreateGoalModal
            level="team"
            buttonLabel="New team goal"
            parentOptions={orgGoalOptions}
            teamOptions={view.ownedTeams.map((t) => ({ id: t.id, label: t.name }))}
            cycleId={cycle?.id ?? null}
            cycleName={cycle?.name}
            createAction={createTeamScopedGoalAction}
          />
        </div>
        {view.teamGoals.length === 0 ? (
          <EmptyState
            icon="◍"
            title="No team goals yet"
            description="Create a team goal that ladders up to one of the org goals."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {view.teamGoals.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                checkInAction={managerCheckInAction}
                suggestions={suggestionsByGoal.get(g.id)}
                applySuggestionAction={applySuggestionAction}
                dismissSuggestionAction={dismissSuggestionAction}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-stone-900">
              Reports' Goals
            </h2>
            <p className="text-sm text-stone-500">
              Individual goals across your reporting line
            </p>
          </div>
          {reportOptions.length > 0 && (
            <CreateGoalModal
              level="individual"
              buttonLabel="New goal for a report"
              parentOptions={teamGoalOptions}
              ownerOptions={reportOptions}
              cycleId={cycle?.id ?? null}
              createAction={createTeamScopedGoalAction}
            />
          )}
        </div>
        {byOwner.size === 0 ? (
          <EmptyState
            icon="◑"
            title="No individual goals yet"
            description="Your reports' goals show up here once they commit to a slice of a team goal."
          />
        ) : (
          <div className="space-y-6">
            {[...byOwner.entries()].map(([owner, ownerGoals]) => (
              <div key={owner}>
                <h3 className="mb-3 text-sm font-medium text-stone-600">{owner}</h3>
                <div className="grid gap-4 lg:grid-cols-2">
                  {ownerGoals.map((g) => (
                    <GoalCard
                      key={g.id}
                      goal={g}
                      checkInAction={managerCheckInAction}
                      suggestions={suggestionsByGoal.get(g.id)}
                      applySuggestionAction={applySuggestionAction}
                      dismissSuggestionAction={dismissSuggestionAction}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {view.sharedPersonalGoals.length > 0 && (
        <section>
          <div className="mb-4">
            <h2 className="font-display text-lg font-semibold text-stone-900">
              Shared Personal Goals
            </h2>
            <p className="text-sm text-stone-500">
              Growth goals your reports chose to share with you — read-only,
              for coaching conversations
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {view.sharedPersonalGoals.map((g) => (
              <GoalCard key={g.id} goal={g} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function GoalsSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-36 animate-pulse rounded-2xl border border-stone-200/60 bg-stone-100"
        />
      ))}
    </div>
  );
}

export default async function TeamGoalsPage() {
  await requireManagerPage();
  const session = await auth();
  const isDemo = process.env.DEMO_MODE === "true" && (!session || isDemoSession(session));
  const userId = session?.user?.id;
  if (!userId && !isDemo) redirect("/login");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-stone-900">
          Team Goals
        </h1>
        <Link
          href="/dashboard/goals/alignment"
          className="text-sm font-medium text-forest hover:text-forest-light"
        >
          View org alignment →
        </Link>
      </div>
      <Suspense fallback={<GoalsSkeleton />}>
        <TeamGoalsContent userId={userId ?? "demo-user"} isDemo={isDemo} />
      </Suspense>
    </div>
  );
}
