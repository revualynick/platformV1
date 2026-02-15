import { teamFeedbackAll, teamMembers } from "@/lib/mock-data";

const sentimentColors = {
  positive: { bg: "bg-positive/10", text: "text-positive", label: "Positive" },
  neutral: { bg: "bg-amber/10", text: "text-warning", label: "Neutral" },
  negative: { bg: "bg-danger/10", text: "text-danger", label: "Negative" },
  mixed: { bg: "bg-stone-100", text: "text-stone-600", label: "Mixed" },
};

export default function TeamFeedbackPage() {
  const avgScore = Math.round(
    teamFeedbackAll.reduce((sum, f) => sum + f.score, 0) /
      teamFeedbackAll.length,
  );
  const highQuality = teamFeedbackAll.filter((f) => f.score >= 80).length;
  const lowQuality = teamFeedbackAll.filter((f) => f.score < 50).length;

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Team feedback</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          All Feedback
        </h1>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "Total Entries",
            value: teamFeedbackAll.length.toString(),
            sub: "This period",
            color: "text-stone-900",
          },
          {
            label: "Avg Quality",
            value: avgScore.toString(),
            sub: "Engagement score",
            color: "text-forest",
          },
          {
            label: "High Quality",
            value: highQuality.toString(),
            sub: "Score ≥ 80",
            color: "text-positive",
          },
          {
            label: "Low Quality",
            value: lowQuality.toString(),
            sub: "Score < 50",
            color: lowQuality > 0 ? "text-terracotta" : "text-forest",
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
          {teamFeedbackAll.map((fb, i) => {
            const sentiment = sentimentColors[fb.sentiment];
            return (
              <div
                key={fb.id}
                className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6 transition-all hover:border-stone-300/60 hover:shadow-md"
                style={{
                  animationDelay: `${300 + i * 60}ms`,
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    {/* Reviewer → Subject */}
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-100 text-[10px] font-medium text-stone-600">
                        {fb.reviewer
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </div>
                      <span className="text-sm font-medium text-stone-800">
                        {fb.reviewer}
                      </span>
                      <svg
                        className="h-3 w-3 text-stone-300"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                        />
                      </svg>
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-forest/[0.06] text-[10px] font-medium text-forest">
                        {fb.subject
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </div>
                      <span className="text-sm font-medium text-stone-800">
                        {fb.subject}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-stone-600">
                      {fb.summary}
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="text-xs text-stone-400">{fb.date}</span>
                      <span className="text-xs text-stone-300">&middot;</span>
                      <span className="text-xs capitalize text-stone-400">
                        {fb.interactionType.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${sentiment.bg} ${sentiment.text}`}
                    >
                      {sentiment.label}
                    </span>
                    <span
                      className={`font-display text-lg font-semibold tabular-nums ${
                        fb.score >= 80
                          ? "text-forest"
                          : fb.score >= 50
                            ? "text-warning"
                            : "text-danger"
                      }`}
                    >
                      {fb.score}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Per-member summary sidebar */}
        <div className="lg:col-span-4">
          <div
            className="card-enter sticky top-8 rounded-2xl border border-stone-200/60 bg-white p-6"
            style={{ animationDelay: "300ms", boxShadow: "var(--shadow-sm)" }}
          >
            <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
              Per Member
            </h3>
            <div className="space-y-3">
              {teamMembers.map((member) => {
                const memberFeedback = teamFeedbackAll.filter(
                  (f) =>
                    f.subject === member.name || f.reviewer === member.name,
                );
                const given = teamFeedbackAll.filter(
                  (f) => f.reviewer === member.name,
                ).length;
                const received = teamFeedbackAll.filter(
                  (f) => f.subject === member.name,
                ).length;
                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-stone-50"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-xs font-medium text-stone-600">
                      {member.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-stone-800">
                        {member.name}
                      </p>
                      <p className="text-[11px] text-stone-400">
                        {given} given &middot; {received} received
                      </p>
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
