import { auth } from "@/lib/auth";
import { getFeedback, getOrgConfig } from "@/lib/api";
import {
  allFeedback as mockFeedback,
  valuesScores as mockValuesScores,
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
};

type ValueScore = { value: string; score: number };

async function loadFeedbackData() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { feedback: mockFeedback as FeedbackItem[], valuesScores: mockValuesScores };
  }

  try {
    const [fbResult, orgResult] = await Promise.allSettled([
      getFeedback(userId),
      getOrgConfig(),
    ]);

    const valuesMap = new Map<string, string>();
    if (orgResult.status === "fulfilled") {
      orgResult.value.coreValues.forEach((v) => valuesMap.set(v.id, v.name));
    }

    let feedback: FeedbackItem[] = mockFeedback;
    let valuesScores: ValueScore[] = mockValuesScores;

    if (fbResult.status === "fulfilled" && fbResult.value.data.length > 0) {
      feedback = fbResult.value.data.map((e) => ({
        id: e.id,
        fromName: "Peer",
        date: new Date(e.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        summary: e.aiSummary || "No summary available",
        sentiment: e.sentiment,
        engagementScore: e.engagementScore,
        values: e.valueScores.map((vs) => valuesMap.get(vs.coreValueId) ?? "Unknown"),
      }));

      // Aggregate value scores
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

    return { feedback, valuesScores };
  } catch {
    return { feedback: mockFeedback as FeedbackItem[], valuesScores: mockValuesScores };
  }
}

export default async function FeedbackPage() {
  const { feedback, valuesScores } = await loadFeedbackData();

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
        {/* Feedback list */}
        <div className="space-y-3 lg:col-span-8">
          {feedback.map((fb, i) => {
            const sentiment = sentimentColors[fb.sentiment] ?? sentimentColors.neutral;
            return (
              <div
                key={fb.id}
                className="card-enter group rounded-2xl border border-stone-200/60 bg-white p-6 transition-all hover:border-stone-300/60 hover:shadow-md"
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
            className="card-enter sticky top-8 rounded-2xl border border-stone-200/60 bg-white p-6"
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
    </div>
  );
}
