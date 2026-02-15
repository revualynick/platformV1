import { TeamTrendChart } from "@/components/charts/team-trend-chart";
import {
  teamMembers,
  flaggedItems,
  leaderboard,
  teamEngagementTrend,
} from "@/lib/mock-data";

const trendIcons = {
  up: { icon: "▲", color: "text-positive" },
  stable: { icon: "—", color: "text-stone-400" },
  down: { icon: "▼", color: "text-danger" },
};

const severityStyles = {
  coaching: {
    bg: "bg-amber/10",
    text: "text-warning",
    border: "border-amber/20",
    label: "Coaching",
  },
  warning: {
    bg: "bg-terracotta/10",
    text: "text-terracotta",
    border: "border-terracotta/20",
    label: "Warning",
  },
  critical: {
    bg: "bg-danger/10",
    text: "text-danger",
    border: "border-danger/20",
    label: "Critical",
  },
};

export default function TeamDashboard() {
  const avgEngagement = Math.round(
    teamMembers.reduce((sum, m) => sum + m.engagementScore, 0) /
      teamMembers.length,
  );
  const totalInteractions = teamMembers.reduce(
    (sum, m) => sum + m.interactionsThisWeek,
    0,
  );
  const totalTarget = teamMembers.reduce((sum, m) => sum + m.target, 0);

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Team overview</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Engineering
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
          <TeamTrendChart data={teamEngagementTrend} />
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

      {/* Team members grid */}
      <div
        className="card-enter mb-8"
        style={{ animationDelay: "500ms" }}
      >
        <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
          Team Members
        </h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teamMembers.map((member) => {
            const trend = trendIcons[member.trend];
            return (
              <div
                key={member.id}
                className="rounded-2xl border border-stone-200/60 bg-white p-5 transition-all hover:border-stone-300/60 hover:shadow-md"
                style={{ boxShadow: "var(--shadow-sm)" }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-sm font-medium text-stone-600">
                    {member.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-stone-800">
                      {member.name}
                    </p>
                    <p className="text-xs text-stone-400">
                      {member.interactionsThisWeek}/{member.target} interactions
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
                      Engagement
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-display text-xl font-semibold ${
                          member.engagementScore >= 70
                            ? "text-forest"
                            : member.engagementScore >= 50
                              ? "text-warning"
                              : "text-danger"
                        }`}
                      >
                        {member.engagementScore}
                      </span>
                      <span className={`text-xs ${trend.color}`}>
                        {trend.icon}
                      </span>
                    </div>
                  </div>
                  {/* Mini bar */}
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-stone-100">
                    <div
                      className={`h-full rounded-full transition-all ${
                        member.engagementScore >= 70
                          ? "bg-forest"
                          : member.engagementScore >= 50
                            ? "bg-warning"
                            : "bg-danger"
                      }`}
                      style={{ width: `${member.engagementScore}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
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
              const style = severityStyles[item.severity];
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
