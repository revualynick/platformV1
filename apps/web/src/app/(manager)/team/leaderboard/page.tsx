import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUsers, getEngagementScores } from "@/lib/api";
import {
  leaderboard as mockLeaderboard,
  leaderboardHistory as mockHistory,
  teamMembers as mockTeamMembers,
} from "@/lib/mock-data";

const rankStyles = [
  "bg-forest text-white",
  "bg-stone-200 text-stone-700",
  "bg-stone-100 text-stone-600",
];

type LeaderboardEntry = {
  rank: number;
  name: string;
  score: number;
  streak: number;
  interactionsThisWeek: number;
  target: number;
};

async function loadLeaderboardData() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  try {
    const usersResult = await getUsers({ managerId: userId });

    if (usersResult.data.length === 0) {
      const members = mockTeamMembers as Array<{ name: string; interactionsThisWeek: number; target: number }>;
      return {
        leaderboard: (mockLeaderboard as Array<{ rank: number; name: string; score: number; streak: number }>).map((e) => {
          const member = members.find((m) => m.name === e.name);
          return { ...e, interactionsThisWeek: member?.interactionsThisWeek ?? 0, target: member?.target ?? 3 };
        }),
        history: mockHistory,
        teamSize: members.length,
        activeCount: members.filter((m) => m.interactionsThisWeek > 0).length,
      };
    }

    const teamUsers = usersResult.data;
    const engResults = await Promise.allSettled(
      teamUsers.map((u) => getEngagementScores(u.id)),
    );

    const entries: LeaderboardEntry[] = teamUsers.map((u, idx) => {
      const eng = engResults[idx];
      if (eng.status === "fulfilled" && eng.value.data.length > 0) {
        const latest = eng.value.data[eng.value.data.length - 1];
        return {
          rank: 0,
          name: u.name,
          score: latest.averageQualityScore,
          streak: latest.streak,
          interactionsThisWeek: latest.interactionsCompleted,
          target: latest.interactionsTarget,
        };
      }
      return { rank: 0, name: u.name, score: 0, streak: 0, interactionsThisWeek: 0, target: 3 };
    });

    entries.sort((a, b) => b.score - a.score);
    entries.forEach((e, i) => { e.rank = i + 1; });

    const activeCount = entries.filter((e) => e.interactionsThisWeek > 0).length;

    return {
      leaderboard: entries,
      history: mockHistory, // Historical data not available from API yet
      teamSize: teamUsers.length,
      activeCount,
    };
  } catch {
    const members = mockTeamMembers as Array<{ name: string; interactionsThisWeek: number; target: number }>;
    return {
      leaderboard: (mockLeaderboard as Array<{ rank: number; name: string; score: number; streak: number }>).map((e) => {
        const member = members.find((m) => m.name === e.name);
        return { ...e, interactionsThisWeek: member?.interactionsThisWeek ?? 0, target: member?.target ?? 3 };
      }),
      history: mockHistory,
      teamSize: members.length,
      activeCount: members.filter((m) => m.interactionsThisWeek > 0).length,
    };
  }
}

export default async function LeaderboardPage() {
  const { leaderboard, history, teamSize, activeCount } = await loadLeaderboardData();

  const avgScore = leaderboard.length > 0
    ? Math.round(leaderboard.reduce((sum, e) => sum + e.score, 0) / leaderboard.length)
    : 0;
  const topStreak = leaderboard.length > 0
    ? Math.max(...leaderboard.map((e) => e.streak))
    : 0;

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Team recognition</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Leaderboard
        </h1>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "Team Avg",
            value: avgScore.toString(),
            sub: "Engagement score",
            color: "text-forest",
          },
          {
            label: "Top Performer",
            value: leaderboard[0]?.name.split(" ")[0] ?? "—",
            sub: leaderboard[0] ? `Score: ${leaderboard[0].score}` : "",
            color: "text-stone-900",
          },
          {
            label: "Longest Streak",
            value: `${topStreak}w`,
            sub: "Consecutive weeks",
            color: "text-terracotta",
          },
          {
            label: "Participation",
            value: `${activeCount}/${teamSize}`,
            sub: "Active this week",
            color: "text-forest",
          },
        ].map((stat, i) => {
          const railColors = ["bg-forest", "bg-forest-light", "bg-terracotta", "bg-forest-muted"];
          return (
            <div
              key={stat.label}
              className="card-enter relative overflow-hidden rounded-2xl border border-stone-200/60 bg-surface pb-5 pl-7 pr-5 pt-5"
              style={{
                animationDelay: `${i * 80}ms`,
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div className={`absolute bottom-4 left-0 top-4 w-1.5 rounded-full ${railColors[i % railColors.length]}`} />
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
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Current rankings */}
        <div className="lg:col-span-7">
          <div
            className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6"
            style={{ animationDelay: "300ms", boxShadow: "var(--shadow-sm)" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-stone-800">
                This Week
              </h3>
              <span className="text-xs text-stone-400">
                Week of {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </div>
            <div className="space-y-2">
              {leaderboard.map((entry, i) => (
                <div
                  key={entry.name}
                  className={`flex items-center gap-4 rounded-xl px-4 py-4 ${
                    i === 0
                      ? "border border-forest/10 bg-forest/[0.04]"
                      : i < 3
                        ? "bg-stone-50"
                        : "hover:bg-stone-50"
                  } transition-colors`}
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                      rankStyles[i] ?? "text-stone-400"
                    }`}
                  >
                    {entry.rank}
                  </span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-xs font-medium text-stone-600">
                    {entry.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-stone-800">
                      {entry.name}
                    </p>
                    <p className="text-xs text-stone-400">
                      {entry.streak > 0
                        ? `${entry.streak}w streak`
                        : "Building momentum"}
                      {` \u00B7 ${entry.interactionsThisWeek}/${entry.target} this week`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className={`h-full rounded-full ${
                          entry.score >= 80
                            ? "bg-forest"
                            : entry.score >= 60
                              ? "bg-warning"
                              : "bg-danger"
                        }`}
                        style={{ width: `${entry.score}%` }}
                      />
                    </div>
                    <span className="w-8 text-right font-display text-lg font-semibold tabular-nums text-stone-800">
                      {entry.score}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Historical rankings */}
        <div className="lg:col-span-5">
          <div
            className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6"
            style={{ animationDelay: "400ms", boxShadow: "var(--shadow-sm)" }}
          >
            <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
              Previous Weeks
            </h3>
            <div className="space-y-5">
              {history.map((week) => (
                <div key={week.week}>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                    Week of {week.week}
                  </p>
                  <div className="space-y-1.5">
                    {week.data.map((entry, i) => (
                      <div
                        key={entry.name}
                        className="flex items-center gap-3 rounded-lg px-3 py-2"
                      >
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                            rankStyles[i] ?? "text-stone-400"
                          }`}
                        >
                          {entry.rank}
                        </span>
                        <span className="flex-1 text-sm text-stone-700">
                          {entry.name}
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-stone-600">
                          {entry.score}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
