import { redirect } from "next/navigation";
import { PartialBadge } from "@/components/partial-badge";
import { InfoHint } from "@/components/info-hint";
import { DataUnavailable } from "@/components/data-unavailable";
import { logPageError } from "@/lib/page-errors";
import { auth } from "@/lib/auth";
import { isDemoSession } from "@/lib/session-utils";
import { getDb } from "@/lib/db";
import { getFeedbackForSubject, getActiveCoreValues, getCompletedThreeSixtyReviews } from "@revualy/db/queries";
import type { ThreeSixtyAggregation } from "@revualy/shared";
import {
  allFeedback as mockFeedback,
  valuesScores as mockValuesScores,
  threeSixtyReviews as mockThreeSixtyReviews,
} from "@/lib/mock-data";
import { sentimentColors } from "@/lib/style-constants";

type FeedbackItem = {
  id: string;
  fromName: string;
  date: string;
  summary: string;
  sentiment: string;
  engagementScore: number;
  values: string[];
  partial?: boolean;
};

type ValueScore = { value: string; score: number };

// subjectId/subjectName live on the review row itself, not inside aggregatedData
type ThreeSixtyAggData = Omit<ThreeSixtyAggregation, "subjectId" | "subjectName">;

type ThreeSixtyReviewItem = {
  id: string;
  status: string;
  completedAt: string;
  completedReviewerCount: number;
  targetReviewerCount: number;
  aggregatedData: ThreeSixtyAggData | null;
};

async function loadFeedbackData(session: Awaited<ReturnType<typeof auth>>, isDemo: boolean) {
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  try {
    const [fbResult, orgResult, tsrResult] = await Promise.allSettled([
      getFeedbackForSubject(getDb(), userId),
      getActiveCoreValues(getDb()),
      getCompletedThreeSixtyReviews(getDb(), userId),
    ]);
    if (fbResult.status === "rejected") logPageError("feedback", fbResult.reason);
    if (orgResult.status === "rejected") logPageError("feedback", orgResult.reason);
    if (tsrResult.status === "rejected") logPageError("feedback:360", tsrResult.reason);

    const valuesMap = new Map<string, string>();
    if (orgResult.status === "fulfilled") {
      orgResult.value.forEach((v) => valuesMap.set(v.id, v.name));
    }

    let feedback: FeedbackItem[] = isDemo ? mockFeedback : [];
    let valuesScores: ValueScore[] = isDemo ? mockValuesScores : [];

    if (fbResult.status === "fulfilled" && fbResult.value.length > 0) {
      feedback = fbResult.value.map((e) => ({
        id: e.id,
        fromName: "Peer", // intentional anonymity — reviewer identity is never shown to subject
        date: new Date(e.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        summary: e.aiSummary || "No summary available",
        sentiment: e.sentiment,
        engagementScore: e.engagementScore,
        values: e.valueScores.map((vs) => valuesMap.get(vs.coreValueId) ?? "Unknown"),
        partial: e.isPartial,
      }));

      // Aggregate value scores
      const scoresByValue = new Map<string, number[]>();
      fbResult.value.forEach((e) => {
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

    // 360 reviews — use real data when available, fall through to mock in demo mode
    let threeSixtyReviews: ThreeSixtyReviewItem[] = isDemo
      ? (mockThreeSixtyReviews as ThreeSixtyReviewItem[])
      : [];
    if (tsrResult.status === "fulfilled" && tsrResult.value.length > 0) {
      threeSixtyReviews = tsrResult.value.map((r) => ({
        id: r.id,
        status: r.status,
        completedAt: r.completedAt
          ? new Date(r.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : "—",
        completedReviewerCount: r.completedReviewerCount ?? 0,
        targetReviewerCount: r.targetReviewerCount,
        aggregatedData: r.aggregatedData as ThreeSixtyAggData | null,
      }));
    }

    return { feedback, valuesScores, threeSixtyReviews, loadFailed: fbResult.status === "rejected" };
  } catch (err) {
    logPageError("feedback", err);
    return {
      feedback: isDemo ? (mockFeedback as FeedbackItem[]) : [],
      valuesScores: isDemo ? mockValuesScores : [],
      threeSixtyReviews: isDemo ? (mockThreeSixtyReviews as ThreeSixtyReviewItem[]) : [],
      loadFailed: true,
    };
  }
}

export default async function FeedbackPage() {
  const session = await auth();
  const isDemo = isDemoSession(session);
  const { feedback, valuesScores, threeSixtyReviews, loadFailed } = await loadFeedbackData(session, isDemo);

  if (loadFailed && !isDemo) {
    return (
      <div className="max-w-5xl">
        <div className="mb-10">
          <p className="text-sm font-medium text-stone-400">Your feedback</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
            Feedback History
          </h1>
        </div>
        <DataUnavailable what="your feedback history" />
      </div>
    );
  }

  const positive = feedback.filter((f) => f.sentiment === "positive").length;
  const neutral = feedback.filter((f) => f.sentiment === "neutral").length;
  const avgScore = feedback.length > 0
    ? Math.round(feedback.reduce((sum, f) => sum + f.engagementScore, 0) / feedback.length)
    : 0;

  // Count value mentions across all feedback
  const valueMentions: Record<string, number> = {};
  feedback.forEach((f) =>
    f.values.forEach((v) => {
      valueMentions[v] = (valueMentions[v] || 0) + 1;
    }),
  );

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Your feedback</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Feedback History
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Insights from your team's feedback conversations in chat — new
          items arrive as colleagues complete them.
        </p>
      </div>

      {/* Stats row */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "Total Received",
            value: feedback.length.toString(),
            sub: "All time",
            color: "text-stone-900",
          },
          {
            label: "Positive",
            value: positive.toString(),
            sub: feedback.length > 0 ? `${Math.round((positive / feedback.length) * 100)}% of total` : "—",
            color: "text-positive",
          },
          {
            label: "Constructive",
            value: neutral.toString(),
            sub: "Growth opportunities",
            color: "text-warning",
          },
          {
            label: "Avg Quality",
            value: avgScore.toString(),
            sub: "Engagement score",
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
        {/* Feedback list */}
        <div className="space-y-3 lg:col-span-8">
          {feedback.map((fb, i) => {
            const sentiment = sentimentColors[fb.sentiment] ?? sentimentColors.neutral;
            return (
              <div
                key={fb.id}
                className="card-enter group rounded-2xl border border-stone-200/60 bg-surface p-6 transition-all hover:border-stone-300/60 hover:shadow-md"
                style={{
                  animationDelay: `${300 + i * 60}ms`,
                  boxShadow: "var(--shadow-sm)",
                }}
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
                        {fb.partial && <PartialBadge />}
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
                      {fb.values.length === 0 && (
                        <span className="text-[11px] italic text-stone-300">
                          No values mapped
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${sentiment.bg} ${sentiment.text}`}
                    >
                      {sentiment.label}
                    </span>
                    <span className="text-xs tabular-nums text-stone-400">
                      Score: {fb.engagementScore}
                      <InfoHint entry="engagementScore" />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Sidebar: Value breakdown */}
        <div className="lg:col-span-4">
          <div
            className="card-enter sticky top-8 rounded-2xl border border-stone-200/60 bg-surface p-6"
            style={{ animationDelay: "300ms", boxShadow: "var(--shadow-sm)" }}
          >
            <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
              Value Mentions
            </h3>
            <div className="space-y-3">
              {valuesScores.map((v) => {
                const count = valueMentions[v.value] || 0;
                const maxCount = Math.max(...Object.values(valueMentions), 1);
                return (
                  <div key={v.value}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-stone-700">
                        {v.value}
                      </span>
                      <span className="text-xs tabular-nums text-stone-400">
                        {count} mention{count !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className="h-full rounded-full bg-forest transition-all"
                        style={{
                          width: `${(count / maxCount) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 360 Reviews */}
      <div className="mt-10">
        <div className="mb-6 flex items-center gap-3">
          <h2 className="font-display text-xl font-semibold text-stone-900">
            360 Reviews
          </h2>
          <span className="rounded-full bg-forest/[0.08] px-2.5 py-0.5 text-[11px] font-medium text-forest">
            {threeSixtyReviews.length} completed
          </span>
        </div>

        {threeSixtyReviews.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-200 p-10 text-center">
            <p className="text-sm text-stone-400">No 360 reviews yet.</p>
            <p className="mt-1 text-xs text-stone-300">
              When a manager initiates a 360 for you and enough reviewers respond, your aggregated results will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {threeSixtyReviews.map((review, i) => {
              const agg = review.aggregatedData;
              return (
                <div
                  key={review.id}
                  className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6"
                  style={{ animationDelay: `${i * 80}ms`, boxShadow: "var(--shadow-sm)" }}
                >
                  {/* Review header */}
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-forest/[0.08] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-forest">
                        Completed
                      </span>
                      <span className="text-sm text-stone-500">{review.completedAt}</span>
                    </div>
                    <span className="text-xs text-stone-400">
                      {review.completedReviewerCount} of {review.targetReviewerCount} reviewers responded
                    </span>
                  </div>

                  {agg ? (
                    <div className="space-y-6">
                      {/* Summary */}
                      <p className="text-sm leading-relaxed text-stone-600">{agg.overallSummary}</p>

                      <div className="grid gap-6 lg:grid-cols-2">
                        {/* Strengths */}
                        {agg.strengths.length > 0 && (
                          <div>
                            <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-forest">
                              Strengths
                            </h4>
                            <ul className="space-y-2">
                              {agg.strengths.map((s, idx) => (
                                <li key={idx} className="flex gap-2.5 text-sm text-stone-700">
                                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-forest/50" />
                                  {s}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Growth areas */}
                        {agg.growthAreas.length > 0 && (
                          <div>
                            <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-terracotta">
                              Growth Areas
                            </h4>
                            <ul className="space-y-2">
                              {agg.growthAreas.map((g, idx) => (
                                <li key={idx} className="flex gap-2.5 text-sm text-stone-700">
                                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta/50" />
                                  {g}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Value scores */}
                      {agg.valueScores.length > 0 && (
                        <div>
                          <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                            Values Alignment
                          </h4>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {agg.valueScores.map((vs) => {
                              const pct = Math.min(Math.round(vs.avgScore), 100);
                              return (
                                <div key={vs.valueName}>
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-stone-700">{vs.valueName}</span>
                                    <span className="text-xs tabular-nums text-stone-400">{pct}</span>
                                  </div>
                                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                                    <div
                                      className="h-full rounded-full bg-forest/70 transition-all"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-stone-400">Aggregated data not yet available for this review.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
