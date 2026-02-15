import { questionBank } from "@/lib/mock-data";

const categoryStyles: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  peer_review: {
    bg: "bg-forest/10",
    text: "text-forest",
    label: "Peer Review",
  },
  self_reflection: {
    bg: "bg-violet-100",
    text: "text-violet-700",
    label: "Self Reflection",
  },
  three_sixty: {
    bg: "bg-sky-100",
    text: "text-sky-700",
    label: "360 Review",
  },
  pulse_check: {
    bg: "bg-amber/10",
    text: "text-warning",
    label: "Pulse Check",
  },
};

export default function QuestionsPage() {
  const activeCount = questionBank.filter((q) => q.active).length;
  const systemCount = questionBank.filter((q) => q.isSystem).length;
  const customCount = questionBank.filter((q) => !q.isSystem).length;

  const categories = Object.entries(
    questionBank.reduce(
      (acc, q) => {
        acc[q.category] = (acc[q.category] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  );

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Configuration</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Question Bank
        </h1>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "Total Questions",
            value: questionBank.length.toString(),
            sub: "In bank",
            color: "text-stone-900",
          },
          {
            label: "Active",
            value: activeCount.toString(),
            sub: "Currently in rotation",
            color: "text-forest",
          },
          {
            label: "System",
            value: systemCount.toString(),
            sub: "Built-in questions",
            color: "text-stone-600",
          },
          {
            label: "Custom",
            value: customCount.toString(),
            sub: "Org-specific",
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
        {/* Questions list */}
        <div className="lg:col-span-8">
          <div
            className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6"
            style={{ animationDelay: "300ms", boxShadow: "var(--shadow-sm)" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-stone-800">
                Questions
              </h3>
              <button className="rounded-xl bg-forest/[0.06] px-4 py-2 text-xs font-medium text-forest hover:bg-forest/10">
                + Add Question
              </button>
            </div>
            <div className="space-y-2">
              {questionBank.map((question) => {
                const cat = categoryStyles[question.category];
                return (
                  <div
                    key={question.id}
                    className={`group flex items-start gap-4 rounded-xl px-4 py-4 transition-colors hover:bg-stone-50 ${
                      !question.active ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex-1">
                      <p className="text-sm leading-relaxed text-stone-700">
                        {question.text}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${cat.bg} ${cat.text}`}
                        >
                          {cat.label}
                        </span>
                        {question.coreValue && (
                          <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-medium text-stone-500">
                            {question.coreValue}
                          </span>
                        )}
                        {question.isSystem && (
                          <span className="text-[10px] text-stone-300">
                            System
                          </span>
                        )}
                        {!question.isSystem && (
                          <span className="text-[10px] text-terracotta/60">
                            Custom
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!question.active && (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-400">
                          Inactive
                        </span>
                      )}
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600">
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Category breakdown sidebar */}
        <div className="lg:col-span-4">
          <div
            className="card-enter sticky top-8 rounded-2xl border border-stone-200/60 bg-white p-6"
            style={{ animationDelay: "400ms", boxShadow: "var(--shadow-sm)" }}
          >
            <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
              By Category
            </h3>
            <div className="space-y-3">
              {categories.map(([category, count]) => {
                const cat = categoryStyles[category];
                return (
                  <div
                    key={category}
                    className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-stone-50"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${cat.bg} ${cat.text}`}
                      >
                        {cat.label}
                      </span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-stone-600">
                      {count}
                    </span>
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
