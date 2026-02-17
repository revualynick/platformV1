import { auth } from "@/lib/auth";
import { getEngagementScores, getFeedback, getOrgConfig, getCurrentUser, getOneOnOneSessions } from "@/lib/api";
import type { OneOnOneSession } from "@/lib/api";
import { EngagementRing } from "@/components/engagement-ring";
import { EngagementChart } from "@/components/charts/engagement-chart";
import { ValuesRadar } from "@/components/charts/values-radar";
import {
  currentUser as mockUser,
  recentFeedback as mockFeedback,
  engagementHistory as mockHistory,
  valuesScores as mockValuesScores,
  upcomingInteraction,
  oneOnOneSessions as mockOneOnOneSessions,
} from "@/lib/mock-data";
import Link from "next/link";

const sentimentColors: Record<string, string> = {
  positive: "bg-positive/10 text-positive",
  neutral: "bg-amber/10 text-warning",
  negative: "bg-danger/10 text-danger",
  mixed: "bg-stone-100 text-stone-600",
};

async function loadDashboardData() {
  const session = await auth();
  const userId = session?.user?.id;
  const userName = session?.user?.name ?? mockUser.name;

  if (!userId) {
    return {
      userName,
      engagementHistory: mockHistory,
      currentScore: 87,
      scoreDelta: 5,
      streak: mockUser.streak,
      interactionsThisWeek: 3,
      recentFeedback: mockFeedback,
      valuesScores: mockValuesScores,
      oneOnOneSessions: mockOneOnOneSessions as (OneOnOneSession & { agendaItems: unknown[]; actionItems: unknown[] })[],
      hasManager: true,
    };
  }

  try {
    const [engResult, fbResult, orgResult, meResult] = await Promise.allSettled([
      getEngagementScores(userId),
      getFeedback(userId),
      getOrgConfig(),
      getCurrentUser(),
    ]);

    // Engagement data
    let engagementHistory = mockHistory;
    let currentScore = 87;
    let scoreDelta = 5;
    let streak = 0;
    let interactionsThisWeek = 3;

    if (engResult.status === "fulfilled" && engResult.value.data.length > 0) {
      const scores = engResult.value.data;
      engagementHistory = scores.slice(-6).map((s) => ({
        week: new Date(s.weekStarting).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        score: s.averageQualityScore,
        interactions: s.interactionsCompleted,
      }));
      const latest = scores[scores.length - 1];
      const prev = scores.length > 1 ? scores[scores.length - 2] : null;
      currentScore = latest.averageQualityScore;
      scoreDelta = prev ? latest.averageQualityScore - prev.averageQualityScore : 0;
      streak = latest.streak;
      interactionsThisWeek = latest.interactionsCompleted;
    }

    // Build values name lookup
    const valuesMap = new Map<string, string>();
    if (orgResult.status === "fulfilled") {
      orgResult.value.coreValues.forEach((v) => valuesMap.set(v.id, v.name));
    }

    // Feedback data
    type FeedbackItem = { id: string; fromName: string; date: string; summary: string; sentiment: string; engagementScore: number; values: string[] };
    let recentFeedback: FeedbackItem[] = mockFeedback;
    let valuesScores = mockValuesScores;

    if (fbResult.status === "fulfilled" && fbResult.value.data.length > 0) {
      const entries = fbResult.value.data.slice(0, 3);
      recentFeedback = entries.map((e) => ({
        id: e.id,
        fromName: "Peer", // Reviewer name not exposed for anonymity
        date: new Date(e.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        summary: e.aiSummary || "No summary available",
        sentiment: e.sentiment as "positive" | "neutral" | "negative" | "mixed",
        engagementScore: e.engagementScore,
        values: e.valueScores.map((vs) => valuesMap.get(vs.coreValueId) ?? "Unknown"),
      }));

      // Aggregate value scores from all feedback
      const scoresByValue = new Map<string, number[]>();
      fbResult.value.data.forEach((e) => {
        e.valueScores.forEach((vs) => {
          const name = valuesMap.get(vs.coreValueId) ?? "Unknown";
          const list = scoresByValue.get(name) ?? [];
          list.push(vs.score);
          scoresByValue.set(name, list);
        });
      });
      if (scoresByValue.size > 0) {
        valuesScores = Array.from(scoresByValue.entries()).map(([value, scores]) => ({
          value,
          score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        }));
      }
    }

    // 1:1 sessions — fetch if user has a manager
    let oneOnOneSessions: OneOnOneSession[] = mockOneOnOneSessions as (OneOnOneSession & { agendaItems: unknown[]; actionItems: unknown[] })[];
    let hasManager = true;
    const managerId = meResult.status === "fulfilled" ? meResult.value.managerId : null;
    if (!managerId) {
      hasManager = false;
      oneOnOneSessions = [];
    } else {
      try {
        const ooResult = await getOneOnOneSessions({ employeeId: userId });
        oneOnOneSessions = ooResult.data;
      } catch {
        // Keep mock fallback
      }
    }

    return {
      userName,
      engagementHistory,
      currentScore,
      scoreDelta,
      streak,
      interactionsThisWeek,
      recentFeedback,
      valuesScores,
      oneOnOneSessions,
      hasManager,
    };
  } catch {
    return {
      userName,
      engagementHistory: mockHistory,
      currentScore: 87,
      scoreDelta: 5,
      streak: mockUser.streak,
      interactionsThisWeek: 3,
      recentFeedback: mockFeedback,
      valuesScores: mockValuesScores,
      oneOnOneSessions: mockOneOnOneSessions as (OneOnOneSession & { agendaItems: unknown[]; actionItems: unknown[] })[],
      hasManager: true,
    };
  }
}

export default async function EmployeeDashboard() {
  const data = await loadDashboardData();

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Good morning,</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          {data.userName.split(" ")[0]}
        </h1>
      </div>

      {/* Top row: Engagement ring + stats + upcoming */}
      <div className="mb-8 grid gap-6 lg:grid-cols-12">
        {/* Engagement ring card */}
        <div
          className="card-enter flex flex-col items-center justify-center rounded-2xl border border-stone-200/60 bg-white p-8 lg:col-span-3"
          style={{ boxShadow: "var(--shadow-sm)" }}
        >
          <EngagementRing score={data.currentScore} />
          <div className="mt-4 flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
              data.scoreDelta >= 0 ? "bg-positive/10 text-positive" : "bg-danger/10 text-danger"
            }`}>
              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
                <path d={data.scoreDelta >= 0 ? "M6 2L10 8H2L6 2Z" : "M6 10L2 4H10L6 10Z"} />
              </svg>
              {data.scoreDelta >= 0 ? "+" : ""}{data.scoreDelta}
            </span>
            <span className="text-xs text-stone-400">vs last week</span>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-4 lg:col-span-4">
          {[
            { label: "Interactions", value: `${data.interactionsThisWeek} / 3`, sub: data.interactionsThisWeek >= 3 ? "This week — complete!" : "This week", color: "text-forest" },
            { label: "Streak", value: `${data.streak}w`, sub: "Consecutive weeks", color: "text-terracotta" },
            { label: "Avg Quality", value: data.currentScore.toString(), sub: "Across all feedback", color: "text-forest" },
            { label: "Response Rate", value: "100%", sub: "Always responsive", color: "text-forest" },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className="card-enter flex flex-col rounded-2xl border border-stone-200/60 bg-white p-5"
              style={{ animationDelay: `${i * 80 + 100}ms`, boxShadow: "var(--shadow-sm)" }}
            >
              <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">{stat.label}</span>
              <span className={`mt-1 font-display text-2xl font-semibold ${stat.color}`}>{stat.value}</span>
              <span className="mt-auto pt-2 text-xs text-stone-400">{stat.sub}</span>
            </div>
          ))}
        </div>

        {/* Upcoming interaction */}
        <div
          className="card-enter flex flex-col rounded-2xl border border-terracotta/15 bg-gradient-to-br from-terracotta/[0.04] to-transparent p-6 lg:col-span-5"
          style={{ animationDelay: "300ms", boxShadow: "var(--shadow-sm)" }}
        >
          <div className="flex items-start justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">Next Interaction</span>
            <span className="rounded-full bg-terracotta/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-terracotta">
              {upcomingInteraction.type.replace("_", " ")}
            </span>
          </div>
          <div className="mt-4">
            <p className="font-display text-lg font-semibold text-stone-900">Review of {upcomingInteraction.subjectName}</p>
            <p className="mt-1.5 text-sm text-stone-500">{upcomingInteraction.topic}</p>
          </div>
          <div className="mt-auto flex items-center gap-4 pt-5">
            <div className="flex items-center gap-2 text-sm text-stone-500">
              <span className="text-base">&#9201;</span>
              {upcomingInteraction.scheduledFor}
            </div>
            <div className="flex items-center gap-2 text-sm text-stone-500">
              <span className="text-base">&#128172;</span>
              via <span className="capitalize">{upcomingInteraction.platform}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="mb-8 grid gap-6 lg:grid-cols-12">
        <div
          className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6 lg:col-span-7"
          style={{ animationDelay: "400ms", boxShadow: "var(--shadow-sm)" }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-stone-800">Engagement Trend</h3>
            <span className="text-xs text-stone-400">Last 6 weeks</span>
          </div>
          <EngagementChart data={data.engagementHistory} />
        </div>

        <div
          className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6 lg:col-span-5"
          style={{ animationDelay: "500ms", boxShadow: "var(--shadow-sm)" }}
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-stone-800">Values Alignment</h3>
            <span className="text-xs text-stone-400">Avg scores</span>
          </div>
          <ValuesRadar data={data.valuesScores} />
        </div>
      </div>

      {/* 1:1 Sessions preview */}
      <div
        className="card-enter mb-8"
        style={{ animationDelay: "550ms" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-base font-semibold text-stone-800">1:1 Sessions</h3>
          <Link
            href="/dashboard/one-on-ones"
            className="text-xs font-medium text-forest hover:text-forest/80"
          >
            View all &rarr;
          </Link>
        </div>
        {!data.hasManager ? (
          <div
            className="rounded-2xl border border-stone-200/60 bg-white p-5 text-center"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            <p className="text-sm text-stone-400">No manager assigned.</p>
          </div>
        ) : data.oneOnOneSessions.length === 0 ? (
          <div
            className="rounded-2xl border border-stone-200/60 bg-white p-5 text-center"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            <p className="text-sm text-stone-400">No 1:1 sessions yet.</p>
          </div>
        ) : (() => {
          const nextSession = data.oneOnOneSessions.find((s) => s.status === "active" || s.status === "scheduled");
          const lastSession = [...data.oneOnOneSessions].reverse().find((s) => s.status === "completed");
          const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
            active: { bg: "bg-positive/10", text: "text-positive", label: "Live Now" },
            scheduled: { bg: "bg-sky-50", text: "text-sky-600", label: "Upcoming" },
            completed: { bg: "bg-stone-100", text: "text-stone-500", label: "Completed" },
          };

          return (
            <div className="space-y-3">
              {nextSession && (
                <Link
                  href={`/dashboard/one-on-ones/${nextSession.id}`}
                  className="block rounded-xl border border-stone-200/60 border-l-4 border-l-forest bg-white p-4 transition-all hover:shadow-md"
                  style={{ boxShadow: "var(--shadow-sm)" }}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusStyles[nextSession.status].bg} ${statusStyles[nextSession.status].text}`}>
                      {statusStyles[nextSession.status].label}
                    </span>
                    <span className="text-sm font-medium text-stone-800">
                      {new Date(nextSession.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <span className="text-xs text-stone-400">
                      {new Date(nextSession.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </div>
                  {nextSession.summary ? (
                    <p className="mt-2 line-clamp-2 text-sm text-stone-600">{nextSession.summary}</p>
                  ) : (
                    <p className="mt-2 text-sm text-stone-400 italic">
                      {nextSession.status === "active" ? "Session in progress..." : "Upcoming session"}
                    </p>
                  )}
                </Link>
              )}
              {lastSession && (
                <Link
                  href={`/dashboard/one-on-ones/${lastSession.id}`}
                  className="block rounded-xl border border-stone-200/60 bg-white p-4 transition-all hover:shadow-md"
                  style={{ boxShadow: "var(--shadow-sm)" }}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                      Last Session
                    </span>
                    <span className="text-sm font-medium text-stone-800">
                      {new Date(lastSession.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  {lastSession.summary && (
                    <p className="mt-2 line-clamp-2 text-sm text-stone-600">{lastSession.summary}</p>
                  )}
                </Link>
              )}
            </div>
          );
        })()}
      </div>

      {/* Recent feedback */}
      <div className="card-enter" style={{ animationDelay: "600ms" }}>
        <h3 className="mb-4 font-display text-base font-semibold text-stone-800">Recent Feedback</h3>
        <div className="space-y-3">
          {data.recentFeedback.map((fb) => (
            <div
              key={fb.id}
              className="group rounded-2xl border border-stone-200/60 bg-white p-6 transition-all hover:border-stone-300/60 hover:shadow-md"
              style={{ boxShadow: "var(--shadow-sm)" }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-xs font-medium text-stone-600">
                      {fb.fromName.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div>
                      <span className="text-sm font-medium text-stone-800">{fb.fromName}</span>
                      <span className="ml-2 text-xs text-stone-400">{fb.date}</span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-stone-600">{fb.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {fb.values.map((v) => (
                      <span key={v} className="rounded-full bg-forest/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-forest">{v}</span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${sentimentColors[fb.sentiment] ?? sentimentColors.neutral}`}>
                    {fb.sentiment}
                  </span>
                  <span className="text-xs tabular-nums text-stone-400">Score: {fb.engagementScore}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
