import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUsers, getEngagementScores, getFlaggedItems } from "@/lib/api";
import { TeamTrendChart } from "@/components/charts/team-trend-chart";
import {
  teamMembers as mockTeamMembers,
  flaggedItems as mockFlaggedItems,
  leaderboard as mockLeaderboard,
  teamEngagementTrend as mockTrend,
} from "@/lib/mock-data";
import { trendIcons, severityStyles } from "@/lib/style-constants";

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

async function loadTeamData() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  try {
    const [usersResult, flaggedResult] = await Promise.allSettled([
      getUsers({ managerId: userId }),
      getFlaggedItems(),
    ]);

    let teamMembers: TeamMember[] = mockTeamMembers;
    let leaderboard: LeaderboardEntry[] = mockLeaderboard;

    if (usersResult.status === "fulfilled" && usersResult.value.data.length > 0) {
      const members = usersResult.value.data;

      // Fetch engagement scores for each team member
      const engResults = await Promise.allSettled(
        members.map((m) => getEngagementScores(m.id)),
      );

      teamMembers = members.map((m, idx) => {
        const eng = engResults[idx];
        let score = 0;
        let interactions = 0;
        let target = 3;
        let streak = 0;
        if (eng.status === "fulfilled" && eng.value.data.length > 0) {
          const latest = eng.value.data[eng.value.data.length - 1];
          score = latest.averageQualityScore;
          interactions = latest.interactionsCompleted;
          target = latest.interactionsTarget;
          streak = latest.streak;
          const prev = eng.value.data.length > 1 ? eng.value.data[eng.value.data.length - 2] : null;
          const delta = prev ? latest.averageQualityScore - prev.averageQualityScore : 0;
          return {
            id: m.id,
            name: m.name,
            engagementScore: score,
            interactionsThisWeek: interactions,
            target,
            trend: delta > 2 ? "up" : delta < -2 ? "down" : "stable",
          };
        }
        return {
          id: m.id,
          name: m.name,
          engagementScore: score,
          interactionsThisWeek: interactions,
          target,
          trend: "stable",
        };
      });

      // Build leaderboard from team members
      leaderboard = [...teamMembers]
        .sort((a, b) => b.engagementScore - a.engagementScore)
        .map((m, i) => ({
          rank: i + 1,
          name: m.name,
          score: m.engagementScore,
          streak: 0,
        }));
    }

    // Flagged items
    let flaggedItems: FlaggedItem[] = mockFlaggedItems;
    if (flaggedResult.status === "fulfilled" && flaggedResult.value.data.length > 0) {
      flaggedItems = flaggedResult.value.data.map((item) => ({
        id: item.escalation.id,
        severity: item.escalation.severity,
        subjectName: "Team Member",
        reason: item.escalation.reason,
        excerpt: item.escalation.flaggedContent || null,
        date: new Date(item.escalation.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      }));
    }

    return {
      teamName: "Your Team",
      teamMembers,
      flaggedItems,
      leaderboard,
      trendData: mockTrend, // Trend chart needs historical aggregate — not available per API yet
    };
  } catch {
    return {
      teamName: "Engineering",
      teamMembers: mockTeamMembers as TeamMember[],
      flaggedItems: mockFlaggedItems as FlaggedItem[],
      leaderboard: mockLeaderboard as LeaderboardEntry[],
      trendData: mockTrend,
    };
  }
}

export default async function TeamDashboard() {
  const { teamName, teamMembers, flaggedItems, leaderboard, trendData } = await loadTeamData();

  const avgEngagement = teamMembers.length > 0
    ? Math.round(teamMembers.reduce((sum, m) => sum + m.engagementScore, 0) / teamMembers.length)
    : 0;
  const totalInteractions = teamMembers.reduce((sum, m) => sum + m.interactionsThisWeek, 0);
  const totalTarget = teamMembers.reduce((sum, m) => sum + m.target, 0);

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Team overview</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          {teamName}
        </h1>
      </div>

      {/* Top stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "Team Members",
            value: teamMembers.length.toString(),
            sub: "Active this period",
            color: "text-stone-900",
          },
          {
            label: "Avg Engagement",
            value: avgEngagement.toString(),
            sub: avgEngagement >= 70 ? "On track" : "Needs attention",
            color: avgEngagement >= 70 ? "text-forest" : "text-warning",
          },
          {
            label: "Interactions",
            value: `${totalInteractions}/${totalTarget}`,
            sub: "Team total this week",
            color: "text-forest",
          },
          {
            label: "Flagged Items",
            value: flaggedItems.length.toString(),
            sub: "Require attention",
            color:
              flaggedItems.length > 0 ? "text-terracotta" : "text-forest",
          },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className="card-enter rounded-2xl border border-stone-200/60 bg-white p-5"
            style={{
              animationDelay: `${i * 80}ms`,
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
              {stat.label}
            </span>
            <p
              className={`mt-1 font-display text-2xl font-semibold ${stat.color}`}
            >
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-stone-400">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Main content: Trend chart + Leaderboard */}
      <div className="mb-8 grid gap-6 lg:grid-cols-12">
        {/* Engagement trend */}
        <div
          className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6 lg:col-span-7"
          style={{ animationDelay: "300ms", boxShadow: "var(--shadow-sm)" }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-stone-800">
              Team Engagement Trend
            </h3>
            <span className="text-xs text-stone-400">
              Range: highest — avg — lowest
            </span>
          </div>
          <Suspense fallback={<div className="h-[300px] animate-pulse rounded-2xl bg-stone-100" />}>
            <TeamTrendChart data={trendData} />
          </Suspense>
        </div>

        {/* Leaderboard */}
        <div
          className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6 lg:col-span-5"
          style={{ animationDelay: "400ms", boxShadow: "var(--shadow-sm)" }}
        >
          <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
            Weekly Leaderboard
          </h3>
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
                  <p className="text-sm font-medium text-stone-800">
                    {entry.name}
                  </p>
                  <p className="text-xs text-stone-400">
                    {entry.streak > 0
                      ? `${entry.streak}w streak`
                      : "No streak"}
                  </p>
                </div>
                <span className="font-display text-lg font-semibold tabular-nums text-stone-800">
                  {entry.score}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Flagged items */}
      {flaggedItems.length > 0 && (
        <div
          className="card-enter"
          style={{ animationDelay: "600ms" }}
        >
          <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
            Flagged Items
          </h3>
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
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style.text} ${style.bg}`}
                        >
                          {style.label}
                        </span>
                        <span className="text-xs text-stone-400">
                          {item.date}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium text-stone-800">
                        {item.subjectName}
                      </p>
                      <p className="mt-1 text-sm text-stone-600">
                        {item.reason}
                      </p>
                      {item.excerpt && (
                        <p className="mt-2 rounded-lg bg-white/60 px-3 py-2 text-xs italic text-stone-500">
                          {item.excerpt}
                        </p>
                      )}
                    </div>
                    <button className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50">
                      Review
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
