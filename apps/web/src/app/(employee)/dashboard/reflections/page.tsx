import { selfReflections, engagementHistory } from "@/lib/mock-data";

const moodStyles: Record<string, { emoji: string; bg: string; text: string }> = {
  energized: { emoji: "⚡", bg: "bg-positive/10", text: "text-positive" },
  focused: { emoji: "🎯", bg: "bg-forest/10", text: "text-forest" },
  reflective: { emoji: "💭", bg: "bg-violet-100", text: "text-violet-600" },
  tired: { emoji: "🌙", bg: "bg-amber/10", text: "text-warning" },
  optimistic: { emoji: "☀️", bg: "bg-sky-50", text: "text-sky-600" },
  stressed: { emoji: "🔥", bg: "bg-danger/10", text: "text-danger" },
};

export default function ReflectionsPage() {
  const completedCount = selfReflections.filter((r) => r.status === "complete").length;
  const avgScore = Math.round(
    selfReflections.reduce((sum, r) => sum + r.engagementScore, 0) /
      selfReflections.length,
  );

  // Count mood occurrences
  const moodCounts: Record<string, number> = {};
  selfReflections.forEach((r) => {
    moodCounts[r.mood] = (moodCounts[r.mood] || 0) + 1;
  });
  const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0];

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
            value: avgScore.toString(),
            sub: "Engagement score",
            color: "text-forest",
          },
          {
            label: "Top Mood",
            value: topMood ? topMood[0].charAt(0).toUpperCase() + topMood[0].slice(1) : "—",
            sub: topMood ? `${topMood[1]} times` : "",
            color: "text-stone-900",
          },
          {
            label: "Streak",
            value: `${completedCount}w`,
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
          {selfReflections
            .slice()
            .reverse()
            .map((r) => {
              const mood = moodStyles[r.mood] ?? moodStyles.reflective;
              return (
                <div key={r.id} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${mood.bg} text-lg`}
                    title={`${r.mood} — ${r.week}`}
                  >
                    {mood.emoji}
                  </div>
                  <span className="text-[10px] text-stone-400">
                    {r.week.replace(", 2026", "")}
                  </span>
                </div>
              );
            })}
        </div>
      </div>

      {/* Reflections */}
      <div className="space-y-5">
        {selfReflections.map((reflection, i) => {
          const mood = moodStyles[reflection.mood] ?? moodStyles.reflective;
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
                  <span
                    className={`font-display text-base font-semibold tabular-nums ${
                      reflection.engagementScore >= 80
                        ? "text-forest"
                        : reflection.engagementScore >= 60
                          ? "text-warning"
                          : "text-danger"
                    }`}
                  >
                    {reflection.engagementScore}
                  </span>
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
                    {reflection.highlights}
                  </p>
                </div>

                {/* Challenges */}
                <div className="border-b border-stone-100 p-6 lg:border-b-0 lg:border-r">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-warning">
                    Challenges
                  </p>
                  <p className="text-sm leading-relaxed text-stone-600">
                    {reflection.challenges}
                  </p>
                </div>

                {/* Goal */}
                <div className="p-6">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-forest">
                    Goal for Next Week
                  </p>
                  <p className="text-sm leading-relaxed text-stone-600">
                    {reflection.goalForNextWeek}
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
