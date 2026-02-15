import { EngagementRing } from "@/components/engagement-ring";
import { EngagementChart } from "@/components/charts/engagement-chart";
import { ValuesRadar } from "@/components/charts/values-radar";
import {
  currentUser,
  recentFeedback,
  engagementHistory,
  valuesScores,
  upcomingInteraction,
} from "@/lib/mock-data";

const sentimentColors = {
  positive: "bg-positive/10 text-positive",
  neutral: "bg-amber/10 text-warning",
  negative: "bg-danger/10 text-danger",
  mixed: "bg-stone-100 text-stone-600",
};

export default function EmployeeDashboard() {
  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Good morning,</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          {currentUser.name.split(" ")[0]}
        </h1>
      </div>

      {/* Top row: Engagement ring + stats + upcoming */}
      <div className="mb-8 grid gap-6 lg:grid-cols-12">
        {/* Engagement ring card */}
        <div
          className="card-enter flex flex-col items-center justify-center rounded-2xl border border-stone-200/60 bg-white p-8 lg:col-span-3"
          style={{ boxShadow: "var(--shadow-sm)" }}
        >
          <EngagementRing score={87} />
          <div className="mt-4 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-positive/10 px-2.5 py-1 text-xs font-medium text-positive">
              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
                <path d="M6 2L10 8H2L6 2Z" />
              </svg>
              +5
            </span>
            <span className="text-xs text-stone-400">vs last week</span>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-4 lg:col-span-4">
          {[
            {
              label: "Interactions",
              value: "3 / 3",
              sub: "This week — complete!",
              color: "text-forest",
            },
            {
              label: "Streak",
              value: `${currentUser.streak}w`,
              sub: "Consecutive weeks",
              color: "text-terracotta",
            },
            {
              label: "Avg Quality",
              value: "85",
              sub: "Across all feedback",
              color: "text-forest",
            },
            {
              label: "Response Rate",
              value: "100%",
              sub: "Always responsive",
              color: "text-forest",
            },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className="card-enter flex flex-col rounded-2xl border border-stone-200/60 bg-white p-5"
              style={{
                animationDelay: `${i * 80 + 100}ms`,
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
                {stat.label}
              </span>
              <span
                className={`mt-1 font-display text-2xl font-semibold ${stat.color}`}
              >
                {stat.value}
              </span>
              <span className="mt-auto pt-2 text-xs text-stone-400">
                {stat.sub}
              </span>
            </div>
          ))}
        </div>

        {/* Upcoming interaction */}
        <div
          className="card-enter flex flex-col rounded-2xl border border-terracotta/15 bg-gradient-to-br from-terracotta/[0.04] to-transparent p-6 lg:col-span-5"
          style={{ animationDelay: "300ms", boxShadow: "var(--shadow-sm)" }}
        >
          <div className="flex items-start justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
              Next Interaction
            </span>
            <span className="rounded-full bg-terracotta/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-terracotta">
              {upcomingInteraction.type.replace("_", " ")}
            </span>
          </div>
          <div className="mt-4">
            <p className="font-display text-lg font-semibold text-stone-900">
              Review of {upcomingInteraction.subjectName}
            </p>
            <p className="mt-1.5 text-sm text-stone-500">
              {upcomingInteraction.topic}
            </p>
          </div>
          <div className="mt-auto flex items-center gap-4 pt-5">
            <div className="flex items-center gap-2 text-sm text-stone-500">
              <span className="text-base">⏱</span>
              {upcomingInteraction.scheduledFor}
            </div>
            <div className="flex items-center gap-2 text-sm text-stone-500">
              <span className="text-base">💬</span>
              via{" "}
              <span className="capitalize">
                {upcomingInteraction.platform}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="mb-8 grid gap-6 lg:grid-cols-12">
        {/* Engagement trend */}
        <div
          className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6 lg:col-span-7"
          style={{ animationDelay: "400ms", boxShadow: "var(--shadow-sm)" }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-stone-800">
              Engagement Trend
            </h3>
            <span className="text-xs text-stone-400">Last 6 weeks</span>
          </div>
          <EngagementChart data={engagementHistory} />
        </div>

        {/* Values radar */}
        <div
          className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6 lg:col-span-5"
          style={{ animationDelay: "500ms", boxShadow: "var(--shadow-sm)" }}
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-stone-800">
              Values Alignment
            </h3>
            <span className="text-xs text-stone-400">Avg scores</span>
          </div>
          <ValuesRadar data={valuesScores} />
        </div>
      </div>

      {/* Recent feedback */}
      <div
        className="card-enter"
        style={{ animationDelay: "600ms" }}
      >
        <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
          Recent Feedback
        </h3>
        <div className="space-y-3">
          {recentFeedback.map((fb) => (
            <div
              key={fb.id}
              className="group rounded-2xl border border-stone-200/60 bg-white p-6 transition-all hover:border-stone-300/60 hover:shadow-md"
              style={{ boxShadow: "var(--shadow-sm)" }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-xs font-medium text-stone-600">
                      {fb.fromName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <div>
                      <span className="text-sm font-medium text-stone-800">
                        {fb.fromName}
                      </span>
                      <span className="ml-2 text-xs text-stone-400">
                        {fb.date}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-stone-600">
                    {fb.summary}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {fb.values.map((v) => (
                      <span
                        key={v}
                        className="rounded-full bg-forest/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-forest"
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${sentimentColors[fb.sentiment]}`}
                  >
                    {fb.sentiment}
                  </span>
                  <span className="text-xs tabular-nums text-stone-400">
                    Score: {fb.engagementScore}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
