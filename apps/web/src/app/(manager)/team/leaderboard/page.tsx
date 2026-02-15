import { leaderboard, leaderboardHistory, teamMembers } from "@/lib/mock-data";

const rankStyles = [
  "bg-forest text-white",
  "bg-stone-200 text-stone-700",
  "bg-stone-100 text-stone-600",
];

export default function LeaderboardPage() {
  const avgScore = Math.round(
    leaderboard.reduce((sum, e) => sum + e.score, 0) / leaderboard.length,
  );
  const topStreak = Math.max(...leaderboard.map((e) => e.streak));

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
            value: leaderboard[0].name.split(" ")[0],
            sub: `Score: ${leaderboard[0].score}`,
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
            value: `${teamMembers.filter((m) => m.interactionsThisWeek > 0).length}/${teamMembers.length}`,
            sub: "Active this week",
            color: "text-forest",
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

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Current rankings */}
        <div className="lg:col-span-7">
          <div
            className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6"
            style={{ animationDelay: "300ms", boxShadow: "var(--shadow-sm)" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-stone-800">
                This Week
              </h3>
              <span className="text-xs text-stone-400">Week of Feb 10</span>
            </div>
            <div className="space-y-2">
              {leaderboard.map((entry, i) => {
                const member = teamMembers.find(
                  (m) => m.name === entry.name,
                );
                return (
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
                        {member &&
                          ` · ${member.interactionsThisWeek}/${member.target} this week`}
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
                );
              })}
            </div>
          </div>
        </div>

        {/* Historical rankings */}
        <div className="lg:col-span-5">
          <div
            className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6"
            style={{ animationDelay: "400ms", boxShadow: "var(--shadow-sm)" }}
          >
            <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
              Previous Weeks
            </h3>
            <div className="space-y-5">
              {leaderboardHistory.map((week) => (
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
