import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { isDemoSession } from "@/lib/session-utils";
import { redirect } from "next/navigation";
import { getMyProfiles, getAssessmentSessions, getMyGoals } from "@/lib/api";
import type { ProfileSnapshotRow, AssessmentSessionRow, DevelopmentGoalRow } from "@/lib/api";
import { DataUnavailable } from "@/components/data-unavailable";
import { logPageError } from "@/lib/page-errors";
import Link from "next/link";
import {
  COLOUR_DIMENSION_LABELS,
  CDM_DIMENSION_LABELS,
  type ColourDimension,
  type CdmDimension,
} from "@revualy/shared";

const COLOUR_VISUAL: Record<string, { bg: string; text: string; ring: string }> = {
  red: { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-200" },
  yellow: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200" },
  green: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200" },
  blue: { bg: "bg-blue-50", text: "text-blue-700", ring: "ring-blue-200" },
};

export default async function ProfilePage() {
  const session = await auth();
  const isDemo = isDemoSession(session);

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Development</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          My Profile
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          Two short assessments build your profile: your{" "}
          <strong>Colour Profile</strong> maps how you communicate across four
          energies — Red (direct), Yellow (expressive), Green (supportive),
          Blue (analytical) — and <strong>CDM (Critical Decision Making)</strong>{" "}
          maps how you gather information, weigh options, and handle dissent.
          Take an assessment to set your baseline, then watch how you evolve.
        </p>
      </div>

      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileContent isDemo={isDemo} />
      </Suspense>
    </div>
  );
}

async function ProfileContent({ isDemo }: { isDemo: boolean }) {
  let profiles: ProfileSnapshotRow[] = [];
  let sessions: AssessmentSessionRow[] = [];
  let goals: DevelopmentGoalRow[] = [];

  if (!isDemo) {
    try {
      const [profilesRes, sessionsRes, goalsRes] = await Promise.allSettled([
        getMyProfiles(),
        getAssessmentSessions(),
        getMyGoals(),
      ]);
      if (profilesRes.status === "fulfilled") profiles = profilesRes.value.data;
      if (sessionsRes.status === "fulfilled") sessions = sessionsRes.value.data;
      if (goalsRes.status === "fulfilled") goals = goalsRes.value.data;
    } catch {
      // render empty state
    }
  }

  const colourProfile = profiles.find((p) => p.framework === "colour");
  const cdmProfile = profiles.find((p) => p.framework === "cdm");
  const colourSessions = sessions.filter((s) => s.framework === "colour" && s.completedAt);
  const cdmSessions = sessions.filter((s) => s.framework === "cdm" && s.completedAt);

  return (
    <div className="space-y-8">
      {/* Assessment Cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        <AssessmentCard
          title="Communication Style"
          subtitle="Colour Profiling"
          description="Understand how you communicate, collaborate, and handle conflict. Based on four communication energies."
          profile={colourProfile}
          completedCount={colourSessions.length}
          framework="colour"
          delay={100}
        />
        <AssessmentCard
          title="Decision Making"
          subtitle="Critical Decision Making"
          description="Discover how you gather information, handle dissent, and review decisions. Based on six decision-making dimensions."
          profile={cdmProfile}
          completedCount={cdmSessions.length}
          framework="cdm"
          delay={200}
        />
      </div>

      {/* Active Development Goals */}
      {goals.length > 0 && (
        <div
          className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6"
          style={{ animationDelay: "300ms", boxShadow: "var(--shadow-sm)" }}
        >
          <h2 className="font-display text-lg font-semibold text-stone-900">
            Development Goals
          </h2>
          <div className="mt-4 divide-y divide-stone-100">
            {goals.map((goal) => {
              const labels =
                goal.framework === "colour"
                  ? COLOUR_DIMENSION_LABELS[goal.dimension as ColourDimension]
                  : CDM_DIMENSION_LABELS[goal.dimension as CdmDimension];
              return (
                <div key={goal.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-stone-800">
                      {goal.targetDirection === "increase" ? "Develop" : "Moderate"}{" "}
                      {labels ? ("name" in labels ? labels.name : goal.dimension) : goal.dimension}
                    </p>
                    {goal.notes && (
                      <p className="mt-0.5 text-xs text-stone-500">{goal.notes}</p>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      goal.status === "active"
                        ? "bg-positive/10 text-positive"
                        : goal.status === "achieved"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-stone-100 text-stone-500"
                    }`}
                  >
                    {goal.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AssessmentCard({
  title,
  subtitle,
  description,
  profile,
  completedCount,
  framework,
  delay,
}: {
  title: string;
  subtitle: string;
  description: string;
  profile: ProfileSnapshotRow | undefined;
  completedCount: number;
  framework: string;
  delay: number;
}) {
  const hasProfile = !!profile;

  return (
    <div
      className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6"
      style={{ animationDelay: `${delay}ms`, boxShadow: "var(--shadow-sm)" }}
    >
      <div className="mb-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
          {subtitle}
        </p>
        <h2 className="mt-1 font-display text-xl font-semibold text-stone-900">
          {title}
        </h2>
        <p className="mt-2 text-sm text-stone-500">{description}</p>
      </div>

      {hasProfile ? (
        <>
          <ProfileDimensions
            framework={framework}
            dimensions={profile.dimensions}
          />
          <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-4">
            <p className="text-xs text-stone-400">
              {completedCount} assessment{completedCount !== 1 ? "s" : ""} completed
            </p>
            <div className="flex gap-2">
              <Link
                href={`/dashboard/profile/assess/${framework}?context=retake`}
                className="rounded-xl px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100 transition-colors"
              >
                Retake
              </Link>
              {profile.sessionId && (
                <Link
                  href={`/dashboard/profile/results/${profile.sessionId}`}
                  className="rounded-xl bg-forest/10 px-3 py-1.5 text-xs font-medium text-forest hover:bg-forest/20 transition-colors"
                >
                  View Results
                </Link>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="mt-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-xl text-stone-400">
            {framework === "colour" ? "◐" : "◇"}
          </div>
          <p className="text-sm text-stone-500">No assessment taken yet</p>
          <Link
            href={`/dashboard/profile/assess/${framework}`}
            className="mt-4 inline-block rounded-xl bg-forest px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(61,24,55,0.25)] hover:bg-forest-light transition-colors"
          >
            Take Assessment
          </Link>
        </div>
      )}
    </div>
  );
}

function ProfileDimensions({
  framework,
  dimensions,
}: {
  framework: string;
  dimensions: Record<string, number>;
}) {
  if (framework === "colour") {
    const dims = ["red", "yellow", "green", "blue"] as const;
    const sorted = [...dims].sort(
      (a, b) => (dimensions[b] ?? 0) - (dimensions[a] ?? 0),
    );
    const dominant = sorted[0];

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${COLOUR_VISUAL[dominant].bg} ${COLOUR_VISUAL[dominant].text} ${COLOUR_VISUAL[dominant].ring}`}
          >
            {COLOUR_DIMENSION_LABELS[dominant].name}
          </span>
          <span className="text-xs text-stone-400">dominant</span>
        </div>
        {dims.map((dim) => {
          const pct = Math.round((dimensions[dim] ?? 0) * 100);
          const vis = COLOUR_VISUAL[dim];
          return (
            <div key={dim} className="flex items-center gap-3">
              <span className="w-20 text-xs font-medium text-stone-600">
                {COLOUR_DIMENSION_LABELS[dim].name.split(" ")[0]}
              </span>
              <div className="flex-1 overflow-hidden rounded-full bg-stone-100 h-2">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${vis.bg.replace("/50", "").replace("bg-", "bg-")}`}
                  style={{
                    width: `${pct}%`,
                    backgroundColor:
                      dim === "red" ? "#ef4444" :
                      dim === "yellow" ? "#f59e0b" :
                      dim === "green" ? "#10b981" :
                      "#3b82f6",
                  }}
                />
              </div>
              <span className="w-10 text-right text-xs font-medium text-stone-500">
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  // CDM — horizontal bars for each dimension
  const dims = [
    "inquiryVsAdvocacy",
    "conflictTolerance",
    "frameFlexibility",
    "analysisVsAction",
    "cogDiversitySeeking",
    "postMortemOrientation",
  ] as const;

  return (
    <div className="space-y-3">
      {dims.map((dim) => {
        const value = dimensions[dim] ?? 0.5;
        const pct = Math.round(value * 100);
        const labels = CDM_DIMENSION_LABELS[dim];
        return (
          <div key={dim}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-stone-600">{labels.name}</span>
              <span className="text-[10px] text-stone-400">
                {value < 0.4 ? labels.low : value > 0.6 ? labels.high : "Balanced"}
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-stone-100">
              <div
                className="absolute h-full rounded-full bg-forest/70 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="h-72 animate-pulse rounded-2xl bg-stone-100" />
      <div className="h-72 animate-pulse rounded-2xl bg-stone-100" />
    </div>
  );
}
