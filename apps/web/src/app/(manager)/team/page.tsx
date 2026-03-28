import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listActiveUsers, getBulkLatestEngagement, getFlaggedItemsForReports } from "@revualy/db/queries";
import { TeamTrendChart } from "@/components/charts/team-trend-chart";
import { ChartErrorBoundary } from "@/components/chart-error-boundary";
import {
  teamMembers as mockTeamMembers,
  flaggedItems as mockFlaggedItems,
  leaderboard as mockLeaderboard,
  teamEngagementTrend as mockTrend,
} from "@/lib/mock-data";
import { trendIcons, severityStyles } from "@/lib/style-constants";
import { isDemoSession } from "@/lib/session-utils";

type TeamMember = {
  id: string;
  name: string;
  engagementScore: number;
  interactionsThisWeek: number;
  target: number;
  trend: string;
};

type FlaggedItem = {
  id: string;
  severity: string;
  subjectName: string;
  reason: string;
  excerpt: string | null;
  date: string;
};

type LeaderboardEntry = {
  rank: number;
  name: string;
  score: number;
  streak: number;
};

// ── Skeleton fallbacks ─────────────────────────────────

function StatsSkeleton() {
  return (
    <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-stone-100" />
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-[300px] animate-pulse rounded-2xl bg-stone-100" />;
}

function SectionSkeleton() {
  return <div className="h-48 animate-pulse rounded-2xl bg-stone-100" />;
}

// ── Async sub-components ───────────────────────────────

async function StatsSection({
  userId,
  isDemo,
}: {
  userId: string;
  isDemo: boolean;
}) {
  let teamMembers: TeamMember[] = isDemo ? mockTeamMembers : [];
  let flaggedItems: FlaggedItem[] = isDemo ? mockFlaggedItems : [];

  try {
    const db = getDb();
    const members = await listActiveUsers(db, { managerId: userId });

    if (members.length > 0) {
      const memberIds = members.map((m) => m.id);
      const [bulkEng, flaggedResult] = await Promise.allSettled([
        getBulkLatestEngagement(db, memberIds),
        getFlaggedItemsForReports(db, memberIds),
      ]);

      const engMap = bulkEng.status === "fulfilled"
        ? bulkEng.value
        : ({} as Record<string, Array<{ averageQualityScore: number; interactionsCompleted: number; interactionsTarget: number; streak: number }>>);

      teamMembers = members.map((m) => {
        const scores = engMap[m.id] ?? [];
        if (scores.length > 0) {
          const latest = scores[0];
          return {
            id: m.id,
            name: m.name,
            engagementScore: latest.averageQualityScore,
            interactionsThisWeek: latest.interactionsCompleted,
            target: latest.interactionsTarget,
            trend: "stable" as string,
          };
        }
        return { id: m.id, name: m.name, engagementScore: 0, interactionsThisWeek: 0, target: 3, trend: "stable" };
      });

      if (flaggedResult.status === "fulfilled" && flaggedResult.value.length > 0) {
        flaggedItems = flaggedResult.value.map((item) => ({
          id: item.escalation.id,
          severity: item.escalation.severity,
          subjectName: item.subjectName ?? "Team Member",
          reason: item.escalation.reason,
          excerpt: item.escalation.flaggedContent || null,
          date: new Date(item.escalation.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        }));
      }
    }
  } catch {
    // use defaults
  }

  const avgEngagement = teamMembers.length > 0
    ? Math.round(teamMembers.reduce((sum, m) => sum + m.engagementScore, 0) / teamMembers.length)
    : 0;
  const totalInteractions = teamMembers.reduce((sum, m) => sum + m.interactionsThisWeek, 0);
  const totalTarget = teamMembers.reduce((sum, m) => sum + m.target, 0);

  return (
    <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {[
        { label: "Team Members", value: teamMembers.length.toString(), sub: "Active this period", color: "text-stone-900" },
        { label: "Avg Engagement", value: avgEngagement.toString(), sub: avgEngagement >= 70 ? "On track" : "Needs attention", color: avgEngagement >= 70 ? "text-forest" : "text-warning" },
        { label: "Interactions", value: `${totalInteractions}/${totalTarget}`, sub: "Team total this week", color: "text-forest" },
        { label: "Flagged Items", value: flaggedItems.length.toString(), sub: "Require attention", color: flaggedItems.length > 0 ? "text-terracotta" : "text-forest" },
      ].map((stat, i) => {
        const railColors = ["bg-forest", "bg-forest-light", "bg-terracotta", "bg-forest-muted"];
        return (
          <div
            key={stat.label}
            className="card-enter relative overflow-hidden rounded-2xl border border-stone-200/60 bg-surface pb-5 pl-7 pr-5 pt-5"
            style={{ animationDelay: `${i * 80}ms`, boxShadow: "var(--shadow-sm)" }}
          >
            <div className={`absolute bottom-4 left-0 top-4 w-1.5 rounded-full ${railColors[i % railColors.length]}`} />
            <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">{stat.label}</span>
            <p className={`mt-1 font-display text-2xl font-semibold ${stat.color}`}>{stat.value}</p>
            <p className="mt-1 text-xs text-stone-400">{stat.sub}</p>
          </div>
        );
      })}
    </div>
  );
}

async function ChartAndLeaderboardSection({
  userId,
  isDemo,
}: {
  userId: string;
  isDemo: boolean;
}) {
  let leaderboard: LeaderboardEntry[] = isDemo ? mockLeaderboard : [];
  const trendData = isDemo ? mockTrend : [];

  try {
    const usersResult = await listActiveUsers(getDb(), { managerId: userId }).catch(() => [] as Array<{ id: string; name: string }>);

    if (usersResult.length > 0) {
      const members = usersResult;
      const bulkEng = await getBulkLatestEngagement(getDb(), members.map((m) => m.id)).catch(
        () => ({} as Record<string, Array<{ averageQualityScore: number; interactionsCompleted: number; interactionsTarget: number; streak: number }>>),
      );

      const teamMembers: TeamMember[] = members.map((m) => {
        const scores = bulkEng[m.id] ?? [];
        if (scores.length > 0) {
          const latest = scores[0];
          return { id: m.id, name: m.name, engagementScore: latest.averageQualityScore, interactionsThisWeek: latest.interactionsCompleted, target: latest.interactionsTarget, trend: "stable" };
        }
        return { id: m.id, name: m.name, engagementScore: 0, interactionsThisWeek: 0, target: 3, trend: "stable" };
      });

      leaderboard = [...teamMembers]
        .sort((a, b) => b.engagementScore - a.engagementScore)
        .map((m, i) => ({ rank: i + 1, name: m.name, score: m.engagementScore, streak: 0 }));
    }
  } catch {
    // use defaults
  }

  return (
    <div className="mb-8 grid gap-6 lg:grid-cols-12">
      {/* Engagement trend */}
      <div
        className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6 lg:col-span-7"
        style={{ animationDelay: "300ms", boxShadow: "var(--shadow-sm)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-stone-800">Team Engagement Trend</h3>
          <span className="text-xs text-stone-400">Range: highest — avg — lowest</span>
        </div>
        <ChartErrorBoundary>
          <Suspense fallback={<div className="h-[300px] animate-pulse rounded-2xl bg-stone-100" />}>
            <TeamTrendChart data={trendData} />
          </Suspense>
        </ChartErrorBoundary>
      </div>

      {/* Leaderboard */}
      <div
        className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6 lg:col-span-5"
        style={{ animationDelay: "400ms", boxShadow: "var(--shadow-sm)" }}
      >
        <h3 className="mb-4 font-display text-base font-semibold text-stone-800">Weekly Leaderboard</h3>
        <div className="space-y-2">
          {leaderboard.map((entry, i) => (
            <div
              key={entry.name}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 ${
                i === 0
                  ? "bg-forest/[0.05] border border-forest/10"
                  : i < 3
                    ? "bg-stone-50"
                    : ""
              }`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  i === 0
                    ? "bg-forest text-white"
                    : i < 3
                      ? "bg-stone-200 text-stone-700"
                      : "text-stone-400"
                }`}
              >
                {entry.rank}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-stone-800">{entry.name}</p>
                <p className="text-xs text-stone-400">{entry.streak > 0 ? `${entry.streak}w streak` : "No streak"}</p>
              </div>
              <span className="font-display text-lg font-semibold tabular-nums text-stone-800">{entry.score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

async function FlaggedSection({
  userId,
  isDemo,
}: {
  userId: string;
  isDemo: boolean;
}) {
  let flaggedItems: FlaggedItem[] = isDemo ? mockFlaggedItems : [];

  try {
    const db = getDb();
    const members = await listActiveUsers(db, { managerId: userId });
    const memberIds = members.map((m) => m.id);
    const flaggedResult = await getFlaggedItemsForReports(db, memberIds).catch(() => [] as Array<{ escalation: { id: string; severity: string; reason: string; flaggedContent: string | null; createdAt: Date }; feedback: unknown; subjectName: string | null }>);
    if (flaggedResult.length > 0) {
      flaggedItems = flaggedResult.map((item) => ({
        id: item.escalation.id,
        severity: item.escalation.severity,
        subjectName: "Team Member",
        reason: item.escalation.reason,
        excerpt: item.escalation.flaggedContent || null,
        date: new Date(item.escalation.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      }));
    }
  } catch {
    // use defaults
  }

  if (flaggedItems.length === 0) return null;

  return (
    <div className="card-enter" style={{ animationDelay: "600ms" }}>
      <h3 className="mb-4 font-display text-base font-semibold text-stone-800">Flagged Items</h3>
      <div className="space-y-3">
        {flaggedItems.map((item) => {
          const style = severityStyles[item.severity] ?? severityStyles.coaching;
          return (
            <div
              key={item.id}
              className={`rounded-2xl border ${style.border} ${style.bg} p-5`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style.text} ${style.bg}`}>
                      {style.label}
                    </span>
                    <span className="text-xs text-stone-400">{item.date}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-stone-800">{item.subjectName}</p>
                  <p className="mt-1 text-sm text-stone-600">{item.reason}</p>
                  {item.excerpt && (
                    <p className="mt-2 rounded-lg bg-surface/60 px-3 py-2 text-xs italic text-stone-500">{item.excerpt}</p>
                  )}
                </div>
                <button className="rounded-xl border border-stone-200 bg-surface px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50">
                  Review
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────

export default async function TeamDashboard() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  const isDemo = isDemoSession(session);

  void trendIcons;

  return (
    <div className="max-w-6xl">
      {/* Header — renders immediately */}
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Team overview</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Your Team
        </h1>
      </div>

      {/* Top stats */}
      <Suspense fallback={<StatsSkeleton />}>
        <StatsSection userId={userId} isDemo={isDemo} />
      </Suspense>

      {/* Trend chart + Leaderboard */}
      <Suspense
        fallback={
          <div className="mb-8 grid gap-6 lg:grid-cols-12">
            <div className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6 lg:col-span-7" style={{ boxShadow: "var(--shadow-sm)" }}>
              <ChartSkeleton />
            </div>
            <div className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6 lg:col-span-5" style={{ boxShadow: "var(--shadow-sm)" }}>
              <SectionSkeleton />
            </div>
          </div>
        }
      >
        <ChartAndLeaderboardSection userId={userId} isDemo={isDemo} />
      </Suspense>

      {/* Flagged items */}
      <Suspense fallback={null}>
        <FlaggedSection userId={userId} isDemo={isDemo} />
      </Suspense>
    </div>
  );
}
