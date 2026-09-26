import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  getMyGoals,
  getCurrentCycle,
  getTeamGoalsForCycle,
  getUserWithManager,
  getPendingSuggestionsForGoals,
} from "@revualy/db/queries";
import { isDemoSession } from "@/lib/session-utils";
import { logPageError } from "@/lib/page-errors";
import { mockMyGoals, mockGoalCycle, mockGoalSuggestions } from "@/lib/mock-data";
import { GoalCard, type GoalCardGoal } from "@/components/goals/goal-card";
import { InfoHint } from "@/components/info-hint";
import type { SuggestionView } from "@/components/goals/suggestion-review-modal";
import { CreateGoalModal } from "@/components/goals/create-goal-modal";
import { EmptyState } from "@/components/empty-state";
import {
  createMyGoalAction,
  checkInAction,
  toggleShareAction,
  applySuggestionAction,
  dismissSuggestionAction,
} from "./actions";

export const dynamic = "force-dynamic";

type MyGoal = GoalCardGoal & { parentTitle: string | null };

async function GoalsContent({ userId, isDemo }: { userId: string; isDemo: boolean }) {
  let myGoals: MyGoal[] = isDemo ? (mockMyGoals as MyGoal[]) : [];
  let cycle: { id: string; name: string } | null = isDemo ? mockGoalCycle : null;
  let teamGoalOptions: Array<{ id: string; label: string }> = isDemo
    ? [{ id: "g-t1", label: "Ship self-serve onboarding" }]
    : [];
  let suggestionsByGoal = new Map<string, SuggestionView[]>(
    isDemo ? [["g-i2", mockGoalSuggestions]] : [],
  );

  if (!isDemo) {
    try {
      const db = getDb();
      const [goalsResult, cycleResult, userResult] = await Promise.allSettled([
        getMyGoals(db, userId),
        getCurrentCycle(db),
        getUserWithManager(db, userId),
      ]);
      if (goalsResult.status === "fulfilled") {
        myGoals = goalsResult.value as MyGoal[];
        const raw = await getPendingSuggestionsForGoals(
          db,
          myGoals.map((g) => g.id),
          userId,
        ).catch(
          () => new Map() as Awaited<ReturnType<typeof getPendingSuggestionsForGoals>>,
        );
        suggestionsByGoal = new Map(
          [...raw.entries()].map(([goalId, list]) => [
            goalId,
            list.map((s) => ({
              ...s,
              meetingDate: s.meetingDate.toISOString(),
            })),
          ]),
        );
      }
      if (cycleResult.status === "fulfilled" && cycleResult.value) {
        cycle = cycleResult.value;
        const teamId =
          userResult.status === "fulfilled" ? userResult.value?.teamId : null;
        const teamGoals = await getTeamGoalsForCycle(db, cycle.id, teamId).catch(
          (err) => {
            logPageError("goals:team-options", err);
            return [];
          },
        );
        teamGoalOptions = teamGoals.map((g) => ({ id: g.id, label: g.title }));
      }
    } catch (err) {
      logPageError("goals", err);
    }
  }

  const individual = myGoals.filter((g) => g.level === "individual");
  const personal = myGoals.filter((g) => g.level === "personal");

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-stone-900">
              My Goals
            </h2>
            <p className="text-sm text-stone-500">
              Your committed slice of the team's goals
              {cycle ? ` — ${cycle.name}` : ""}
              <InfoHint entry="laddering" />
            </p>
          </div>
          <CreateGoalModal
            level="individual"
            buttonLabel="New goal"
            parentOptions={teamGoalOptions}
            cycleId={cycle?.id ?? null}
            cycleName={cycle?.name}
            createAction={createMyGoalAction}
          />
        </div>
        {individual.length === 0 ? (
          <EmptyState
            icon="◍"
            title="No goals this cycle"
            description="Create a goal that ladders up to one of your team's goals."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {individual.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                checkInAction={checkInAction}
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
              Personal Goals
            </h2>
            <p className="text-sm text-stone-500">
              Private to you unless you share them with your manager
            </p>
          </div>
          <CreateGoalModal
            level="personal"
            buttonLabel="New personal goal"
            createAction={createMyGoalAction}
          />
        </div>
        {personal.length === 0 ? (
          <EmptyState
            icon="○"
            title="No personal goals yet"
            description="Personal goals are for your own growth — they don't ladder anywhere and stay private by default."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {personal.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                checkInAction={checkInAction}
                toggleShareAction={toggleShareAction}
                suggestions={suggestionsByGoal.get(g.id)}
                applySuggestionAction={applySuggestionAction}
                dismissSuggestionAction={dismissSuggestionAction}
              />
            ))}
          </div>
        )}
      </section>
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

export default async function GoalsPage() {
  const session = await auth();
  const isDemo = process.env.DEMO_MODE === "true" && (!session || isDemoSession(session));
  const userId = session?.user?.id;
  if (!userId && !isDemo) redirect("/login");

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
      <Suspense fallback={<GoalsSkeleton />}>
        <GoalsContent userId={userId ?? "demo-user"} isDemo={isDemo} />
      </Suspense>
    </div>
  );
}
