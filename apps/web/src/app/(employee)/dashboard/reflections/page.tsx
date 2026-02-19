import { getReflections, getReflectionStats } from "@/lib/api";
import type { SelfReflectionRow, ReflectionStatsRow } from "@/lib/api";
import { selfReflections as mockReflections } from "@/lib/mock-data";

const moodStyles: Record<string, { emoji: string; bg: string; text: string }> = {
  energized: { emoji: "\u26A1", bg: "bg-positive/10", text: "text-positive" },
  focused: { emoji: "\uD83C\uDFAF", bg: "bg-forest/10", text: "text-forest" },
  reflective: { emoji: "\uD83D\uDCAD", bg: "bg-violet-100", text: "text-violet-600" },
  tired: { emoji: "\uD83C\uDF19", bg: "bg-amber/10", text: "text-warning" },
  optimistic: { emoji: "\u2600\uFE0F", bg: "bg-sky-50", text: "text-sky-600" },
  stressed: { emoji: "\uD83D\uDD25", bg: "bg-danger/10", text: "text-danger" },
};

interface ReflectionDisplay {
  id: string;
  week: string;
  status: string;
  promptTheme: string | null;
  highlights: string | null;
  challenges: string | null;
  goalForNextWeek: string | null;
  mood: string;
  engagementScore: number | null;
}

function formatWeekDate(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function mapApiToDisplay(row: SelfReflectionRow): ReflectionDisplay {
  return {
    id: row.id,
    week: formatWeekDate(row.weekStarting),
    status: row.status,
    promptTheme: row.promptTheme,
    highlights: row.highlights,
    challenges: row.challenges,
    goalForNextWeek: row.goalForNextWeek,
    mood: row.mood ?? "reflective",
    engagementScore: row.engagementScore,
  };
}

function mapMockToDisplay(
  mock: (typeof mockReflections)[number],
): ReflectionDisplay {
  return {
    id: mock.id,
    week: mock.week,
    status: mock.status,
    promptTheme: mock.promptTheme,
    highlights: mock.highlights,
    challenges: mock.challenges,
    goalForNextWeek: mock.goalForNextWeek,
    mood: mock.mood,
    engagementScore: mock.engagementScore,
  };
}

export default async function ReflectionsPage() {
  let reflections: ReflectionDisplay[];
  let completedCount: number;
  let avgScore: number | null;
  let topMood: string | null;
  let currentStreak: number;

  const [reflectionsResult, statsResult] = await Promise.allSettled([
    getReflections(12),
    getReflectionStats(),
  ]);

  if (
    reflectionsResult.status === "fulfilled" &&
    reflectionsResult.value.data.length > 0
  ) {
    reflections = reflectionsResult.value.data.map(mapApiToDisplay);
  } else {
    reflections = mockReflections.map(mapMockToDisplay);
  }

  if (statsResult.status === "fulfilled") {
    const stats: ReflectionStatsRow = statsResult.value;
    completedCount = stats.totalCompleted;
    avgScore = stats.avgEngagementScore;
    topMood = stats.topMood;
    currentStreak = stats.currentStreak;
  } else {
    completedCount = mockReflections.filter((r) => r.status === "complete").length;
    avgScore = Math.round(
      mockReflections.reduce((sum, r) => sum + r.engagementScore, 0) /
        mockReflections.length,
    );
    const moodCounts: Record<string, number> = {};
    mockReflections.forEach((r) => {
      moodCounts[r.mood] = (moodCounts[r.mood] || 0) + 1;
    });
    const topEntry = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0];
    topMood = topEntry ? topEntry[0] : null;
    currentStreak = completedCount;
  }

  const topMoodLabel = topMood
    ? topMood.charAt(0).toUpperCase() + topMood.slice(1)
    : "\u2014";

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Self-awareness</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Reflections
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">
          Your weekly self-reflections — a private space to process wins, challenges, and intentions.
          Only you and your AI coach can see these.
        </p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "Reflections",
            value: completedCount.toString(),
            sub: "Completed",
            color: "text-stone-900",
          },
          {
            label: "Avg Quality",
            value: avgScore != null ? avgScore.toString() : "\u2014",
            sub: "Engagement score",
            color: "text-forest",
          },
          {
            label: "Top Mood",
            value: topMoodLabel,
            sub: topMood ? "" : "",
            color: "text-stone-900",
          },
          {
            label: "Streak",
            value: `${currentStreak}w`,
            sub: "Consecutive reflections",
            color: "text-terracotta",
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
            <p className={`mt-1 font-display text-2xl font-semibold ${stat.color}`}>
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-stone-400">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Mood timeline */}
      <div
        className="card-enter mb-8 rounded-2xl border border-stone-200/60 bg-white p-6"
        style={{ animationDelay: "250ms", boxShadow: "var(--shadow-sm)" }}
      >
        <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
          Mood Over Time
        </h3>
        <div className="flex items-center gap-1">
          {reflections
            .slice()
            .reverse()
            .map((r) => {
              const mood = moodStyles[r.mood] ?? moodStyles.reflective;
              return (
                <div key={r.id} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${mood.bg} text-lg`}
                    title={`${r.mood} \u2014 ${r.week}`}
                  >
                    {mood.emoji}
                  </div>
                  <span className="text-[10px] text-stone-400">
                    {r.week.replace(/, \d{4}$/, "")}
                  </span>
                </div>
              );
            })}
        </div>
      </div>

      {/* Reflections */}
      <div className="space-y-5">
        {reflections.map((reflection, i) => {
          const mood = moodStyles[reflection.mood] ?? moodStyles.reflective;
          const score = reflection.engagementScore;
          return (
            <div
              key={reflection.id}
              className="card-enter rounded-2xl border border-stone-200/60 bg-white transition-all hover:border-stone-300/60 hover:shadow-md"
              style={{
                animationDelay: `${350 + i * 80}ms`,
                boxShadow: "var(--shadow-sm)",
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="font-display text-sm font-semibold text-stone-800">
                    Week of {reflection.week}
                  </span>
                  <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${mood.bg} ${mood.text}`}>
                    <span>{mood.emoji}</span>
                    <span className="capitalize">{reflection.mood}</span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] uppercase tracking-wider text-stone-300">
                    {reflection.promptTheme}
                  </span>
                  {score != null && (
                    <span
                      className={`font-display text-base font-semibold tabular-nums ${
                        score >= 80
                          ? "text-forest"
                          : score >= 60
                            ? "text-warning"
                            : "text-danger"
                      }`}
                    >
                      {score}
                    </span>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="grid gap-0 lg:grid-cols-3">
                {/* Highlights */}
                <div className="border-b border-stone-100 p-6 lg:border-b-0 lg:border-r">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-positive">
                    Highlights
                  </p>
                  <p className="text-sm leading-relaxed text-stone-600">
                    {reflection.highlights || "\u2014"}
                  </p>
                </div>

                {/* Challenges */}
                <div className="border-b border-stone-100 p-6 lg:border-b-0 lg:border-r">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-warning">
                    Challenges
                  </p>
                  <p className="text-sm leading-relaxed text-stone-600">
                    {reflection.challenges || "\u2014"}
                  </p>
                </div>

                {/* Goal */}
                <div className="p-6">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-forest">
                    Goal for Next Week
                  </p>
                  <p className="text-sm leading-relaxed text-stone-600">
                    {reflection.goalForNextWeek || "\u2014"}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
