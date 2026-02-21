import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEngagementScores } from "@/lib/api";
import { EngagementRing } from "@/components/engagement-ring";
import { EngagementChart } from "@/components/charts/engagement-chart";
import { ChartErrorBoundary } from "@/components/chart-error-boundary";
import {
  weeklyEngagementDetail as mockWeeklyDetail,
  engagementHistory as mockHistory,
  currentUser as mockUser,
} from "@/lib/mock-data";
import { engagementStatusStyles as statusStyles } from "@/lib/style-constants";

type WeekDetail = {
  week: string;
  score: number;
  interactions: number;
  avgWordCount: number;
  responseTime: string;
  specificExamples: number;
  status: string;
};

async function loadEngagementData() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  try {
    const result = await getEngagementScores(userId);
    if (result.data.length === 0) {
      return {
        weeklyDetail: mockWeeklyDetail as WeekDetail[],
        chartData: mockHistory,
        streak: mockUser.streak,
      };
    }

    const scores = result.data;

    // Build chart data (last 6 weeks)
    const chartData = scores.slice(-6).map((s) => ({
      week: new Date(s.weekStarting).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      score: s.averageQualityScore,
      interactions: s.interactionsCompleted,
    }));

    // Build weekly detail
    const weeklyDetail: WeekDetail[] = scores.slice(-6).reverse().map((s) => ({
      week: new Date(s.weekStarting).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      score: s.averageQualityScore,
      interactions: s.interactionsCompleted,
      // These fields aren't tracked per-week in the API yet — use reasonable defaults
      avgWordCount: 0,
      responseTime: "—",
      specificExamples: 0,
      status: s.interactionsCompleted >= s.interactionsTarget ? "complete" : "partial",
    }));

    const latest = scores[scores.length - 1];

    return {
      weeklyDetail,
      chartData,
      streak: latest.streak,
    };
  } catch {
    return {
      weeklyDetail: mockWeeklyDetail as WeekDetail[],
      chartData: mockHistory,
      streak: mockUser.streak,
    };
  }
}

export default async function EngagementPage() {
  const { weeklyDetail, chartData, streak } = await loadEngagementData();

  const current = weeklyDetail[0];
  const previous = weeklyDetail[1] ?? current;
  const scoreDelta = current.score - previous.score;

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Your engagement</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Engagement Score
        </h1>
      </div>

      {/* Top section: Ring + current week breakdown */}
      <div className="mb-8 grid gap-6 lg:grid-cols-12">
        {/* Ring + delta */}
        <div
          className="card-enter flex flex-col items-center justify-center rounded-2xl border border-stone-200/60 bg-surface p-8 lg:col-span-4"
          style={{ boxShadow: "var(--shadow-sm)" }}
        >
          <EngagementRing score={current.score} />
          <div className="mt-4 flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                scoreDelta >= 0
                  ? "bg-positive/10 text-positive"
                  : "bg-danger/10 text-danger"
              }`}
            >
              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
                <path
                  d={
                    scoreDelta >= 0
                      ? "M6 2L10 8H2L6 2Z"
                      : "M6 10L2 4H10L6 10Z"
                  }
                />
              </svg>
              {scoreDelta >= 0 ? "+" : ""}
              {scoreDelta}
            </span>
            <span className="text-xs text-stone-400">vs last week</span>
          </div>
          <p className="mt-3 text-center text-xs text-stone-400">
            {streak}w streak
          </p>
        </div>

        {/* This week's breakdown */}
        <div className="grid grid-cols-2 gap-4 lg:col-span-8">
          {[
            {
              label: "Interactions",
              value: `${current.interactions} / 3`,
              sub: "Target met",
              color: "text-forest",
            },
            {
              label: "Avg Word Count",
              value: current.avgWordCount > 0 ? current.avgWordCount.toString() : "—",
              sub: "Words per response",
              color: "text-stone-900",
            },
            {
              label: "Response Time",
              value: current.responseTime,
              sub: "Average response",
              color: "text-forest",
            },
            {
              label: "Specific Examples",
              value: current.specificExamples > 0 ? current.specificExamples.toString() : "—",
              sub: "Cited in feedback",
              color: "text-forest",
            },
          ].map((stat, i) => {
            const railColors = ["bg-forest", "bg-forest-light", "bg-terracotta", "bg-forest-muted"];
            return (
              <div
                key={stat.label}
                className="card-enter relative flex flex-col overflow-hidden rounded-2xl border border-stone-200/60 bg-surface pb-5 pl-7 pr-5 pt-5"
                style={{
                  animationDelay: `${i * 80 + 100}ms`,
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div className={`absolute bottom-4 left-0 top-4 w-1.5 rounded-full ${railColors[i % railColors.length]}`} />
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
            );
          })}
        </div>
      </div>

      {/* Chart */}
      <div
        className="card-enter mb-8 rounded-2xl border border-stone-200/60 bg-surface p-6"
        style={{ animationDelay: "400ms", boxShadow: "var(--shadow-sm)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-stone-800">
            Score Trend
          </h3>
          <span className="text-xs text-stone-400">Last 6 weeks</span>
        </div>
        <ChartErrorBoundary>
          <Suspense fallback={<div className="h-[300px] animate-pulse rounded-2xl bg-stone-100" />}>
            <EngagementChart data={chartData} />
          </Suspense>
        </ChartErrorBoundary>
      </div>

      {/* Weekly history table */}
      <div
        className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6"
        style={{ animationDelay: "500ms", boxShadow: "var(--shadow-sm)" }}
      >
        <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
          Weekly Breakdown
        </h3>
        <div className="overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-6 gap-4 border-b border-stone-100 pb-3">
            {["Week", "Score", "Interactions", "Avg Words", "Response", "Status"].map(
              (h) => (
                <span
                  key={h}
                  className="text-[11px] font-medium uppercase tracking-wider text-stone-400"
                >
                  {h}
                </span>
              ),
            )}
          </div>
          {/* Rows */}
          {weeklyDetail.map((week, i) => {
            const status = statusStyles[week.status] ?? statusStyles.partial;
            return (
              <div
                key={week.week}
                className={`grid grid-cols-6 items-center gap-4 py-3.5 ${
                  i !== weeklyDetail.length - 1
                    ? "border-b border-stone-50"
                    : ""
                }`}
              >
                <span className="text-sm font-medium text-stone-700">
                  {week.week}
                </span>
                <span
                  className={`font-display text-base font-semibold tabular-nums ${
                    week.score >= 80
                      ? "text-forest"
                      : week.score >= 60
                        ? "text-warning"
                        : "text-danger"
                  }`}
                >
                  {week.score}
                </span>
                <span className="text-sm tabular-nums text-stone-600">
                  {week.interactions} / 3
                </span>
                <span className="text-sm tabular-nums text-stone-600">
                  {week.avgWordCount > 0 ? week.avgWordCount : "—"}
                </span>
                <span className="text-sm text-stone-600">
                  {week.responseTime}
                </span>
                <span
                  className={`w-fit rounded-full px-2.5 py-0.5 text-[11px] font-medium ${status.bg} ${status.text}`}
                >
                  {status.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
