import { auth } from "@/lib/auth";
import { getTeamInsights } from "@/lib/api";
import type { FeedbackDigestRow } from "@/lib/api";
import { mockTeamInsights } from "@/lib/mock-data";
import { trendIcons } from "@/lib/style-constants";
import { ThemeFrequencyChart } from "@/components/charts/theme-frequency-chart";

async function loadInsightsData(): Promise<FeedbackDigestRow[]> {
  try {
    const result = await getTeamInsights();
    if (result.data.length > 0) return result.data;
    return mockTeamInsights;
  } catch {
    return mockTeamInsights;
  }
}

function formatMonth(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default async function TeamInsightsPage() {
  const session = await auth();
  const digests = await loadInsightsData();

  // Use the latest digest
  const sorted = [...digests].sort(
    (a, b) =>
      new Date(b.monthStarting).getTime() -
      new Date(a.monthStarting).getTime(),
  );
  const current = sorted[0];

  if (!current) {
    return (
      <div className="max-w-6xl">
        <div className="mb-10">
          <p className="text-sm font-medium text-stone-400">Team insights</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
            Team Insights
          </h1>
        </div>
        <div className="rounded-2xl border border-stone-200/60 bg-white p-12 text-center">
          <p className="text-stone-500">
            No insight data available yet. Feedback digests will appear here
            once your team has collected peer feedback.
          </p>
        </div>
      </div>
    );
  }

  const { memberSummaries, teamHealth } = current.data;
  const totalFeedback = memberSummaries.reduce(
    (sum, m) => sum + m.feedbackCount,
    0,
  );
  const activeThemes = Object.keys(teamHealth.themeFrequency).length;
  const totalLanguage =
    teamHealth.languagePatterns.constructive +
    teamHealth.languagePatterns.vague;
  const languagePercent =
    totalLanguage > 0
      ? Math.round(
          (teamHealth.languagePatterns.constructive / totalLanguage) * 100,
        )
      : 0;

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-10 flex items-end justify-between">
        <div>
          <p className="text-sm font-medium text-stone-400">Team insights</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
            Team Insights
          </h1>
        </div>
        {/* Month selector */}
        <div className="flex items-center gap-2">
          {sorted.map((d, i) => (
            <span
              key={d.id}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                i === 0
                  ? "bg-forest text-white"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
            >
              {formatMonth(d.monthStarting)}
            </span>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "Team Health",
            value: `${Math.round(teamHealth.overallSentiment * 100)}%`,
            sub: "Overall sentiment score",
            color:
              teamHealth.overallSentiment >= 0.7
                ? "text-forest"
                : teamHealth.overallSentiment >= 0.5
                  ? "text-warning"
                  : "text-danger",
          },
          {
            label: "Participation",
            value: `${Math.round(teamHealth.participationRate * 100)}%`,
            sub: `${memberSummaries.filter((m) => m.feedbackCount > 0).length} of ${memberSummaries.length} members`,
            color: "text-forest",
          },
          {
            label: "Active Themes",
            value: activeThemes.toString(),
            sub: `${totalFeedback} feedback entries`,
            color: "text-stone-900",
          },
          {
            label: "Language Quality",
            value: `${languagePercent}%`,
            sub: `${teamHealth.languagePatterns.constructive} constructive, ${teamHealth.languagePatterns.vague} vague`,
            color:
              languagePercent >= 70
                ? "text-forest"
                : languagePercent >= 50
                  ? "text-warning"
                  : "text-terracotta",
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

      {/* Per-employee cards */}
      <div className="mb-8">
        <h2 className="mb-4 font-display text-lg font-semibold text-stone-800">
          Team Members
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {memberSummaries.map((member, i) => {
            const trend = trendIcons[
              member.sentimentTrend === "improving"
                ? "up"
                : member.sentimentTrend === "declining"
                  ? "down"
                  : "stable"
            ];
            const sentimentPercent = Math.round(member.avgSentiment * 100);

            return (
              <div
                key={member.userId}
                className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6 transition-all hover:border-stone-300/60 hover:shadow-md"
                style={{
                  animationDelay: `${400 + i * 60}ms`,
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest/[0.06] text-sm font-semibold text-forest">
                    {member.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Name + trend */}
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-stone-800 truncate">
                        {member.name}
                      </h3>
                      <span
                        className={`text-xs font-medium ${trend.color}`}
                        title={`Trend: ${member.sentimentTrend}`}
                      >
                        {trend.icon}
                      </span>
                    </div>

                    {/* Sentiment bar */}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-stone-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            sentimentPercent >= 70
                              ? "bg-forest"
                              : sentimentPercent >= 50
                                ? "bg-warning"
                                : "bg-danger"
                          }`}
                          style={{ width: `${sentimentPercent}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium tabular-nums text-stone-500 w-10 text-right">
                        {sentimentPercent}%
                      </span>
                    </div>

                    {/* Theme pills */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {member.topThemes.map((theme) => (
                        <span
                          key={theme}
                          className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-medium text-stone-600"
                        >
                          {theme}
                        </span>
                      ))}
                    </div>

                    {/* Stats row */}
                    <div className="mt-3 flex items-center gap-4 text-[11px] text-stone-400">
                      <span>
                        {member.feedbackCount} feedback{member.feedbackCount !== 1 ? "s" : ""}
                      </span>
                      <span>&middot;</span>
                      <span>
                        {Math.round(member.languageQuality * 100)}% actionable
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Team-level section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Theme frequency chart */}
        <div
          className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6"
          style={{
            animationDelay: "600ms",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
            Theme Frequency
          </h3>
          <p className="mb-4 text-xs text-stone-400">
            Which values and themes come up most across the team
          </p>
          <ThemeFrequencyChart
            themeFrequency={teamHealth.themeFrequency}
          />
        </div>

        {/* Language patterns */}
        <div
          className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6"
          style={{
            animationDelay: "680ms",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
            Language Patterns
          </h3>
          <p className="mb-6 text-xs text-stone-400">
            How specific and actionable is the feedback your team gives?
          </p>

          <div className="space-y-6">
            {/* Constructive bar */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-stone-700">
                  Constructive
                </span>
                <span className="text-sm font-semibold text-forest tabular-nums">
                  {teamHealth.languagePatterns.constructive}
                </span>
              </div>
              <div className="h-3 rounded-full bg-stone-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-forest transition-all"
                  style={{
                    width:
                      totalLanguage > 0
                        ? `${(teamHealth.languagePatterns.constructive / totalLanguage) * 100}%`
                        : "0%",
                  }}
                />
              </div>
              <p className="mt-1 text-[11px] text-stone-400">
                Feedback with specific examples and actionable observations
              </p>
            </div>

            {/* Vague bar */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-stone-700">
                  Vague
                </span>
                <span className="text-sm font-semibold text-terracotta tabular-nums">
                  {teamHealth.languagePatterns.vague}
                </span>
              </div>
              <div className="h-3 rounded-full bg-stone-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-terracotta/60 transition-all"
                  style={{
                    width:
                      totalLanguage > 0
                        ? `${(teamHealth.languagePatterns.vague / totalLanguage) * 100}%`
                        : "0%",
                  }}
                />
              </div>
              <p className="mt-1 text-[11px] text-stone-400">
                Generic feedback lacking concrete details or examples
              </p>
            </div>
          </div>

          {/* Summary */}
          <div className="mt-6 rounded-xl bg-stone-50 p-4">
            <p className="text-xs text-stone-500 leading-relaxed">
              {languagePercent >= 70
                ? "Your team is providing high-quality, actionable feedback. This helps team members understand exactly what they're doing well."
                : languagePercent >= 50
                  ? "Feedback quality is moderate. Encourage team members to include specific examples when sharing observations."
                  : "Most feedback lacks specific examples. Consider coaching the team on giving concrete, actionable feedback."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
