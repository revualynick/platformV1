import { coreValues, valuesScores } from "@/lib/mock-data";

export default function ValuesPage() {
  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Configuration</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Core Values
        </h1>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {[
          {
            label: "Active Values",
            value: coreValues.filter((v) => v.active).length.toString(),
            sub: "Currently tracked",
            color: "text-forest",
          },
          {
            label: "Avg Alignment",
            value: Math.round(
              valuesScores.reduce((sum, v) => sum + v.score, 0) /
                valuesScores.length,
            ).toString(),
            sub: "Across all feedback",
            color: "text-forest",
          },
          {
            label: "Top Value",
            value: valuesScores.sort((a, b) => b.score - a.score)[0].value,
            sub: `Score: ${valuesScores.sort((a, b) => b.score - a.score)[0].score}`,
            color: "text-stone-900",
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
        {/* Values list */}
        <div className="lg:col-span-7">
          <div
            className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6"
            style={{ animationDelay: "200ms", boxShadow: "var(--shadow-sm)" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-stone-800">
                Values
              </h3>
              <button className="rounded-xl bg-forest/[0.06] px-4 py-2 text-xs font-medium text-forest hover:bg-forest/10">
                + Add Value
              </button>
            </div>
            <div className="space-y-2">
              {coreValues.map((value, i) => {
                const score = valuesScores.find(
                  (v) => v.value === value.name,
                );
                return (
                  <div
                    key={value.id}
                    className="group flex items-center gap-4 rounded-xl px-4 py-4 transition-colors hover:bg-stone-50"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-forest/[0.06] text-sm font-bold text-forest">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-stone-800">
                          {value.name}
                        </p>
                        {value.active && (
                          <span className="rounded-full bg-positive/10 px-2 py-0.5 text-[10px] font-medium text-positive">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-stone-400">
                        {value.description}
                      </p>
                    </div>
                    {score && (
                      <div className="text-right">
                        <p
                          className={`font-display text-lg font-semibold tabular-nums ${
                            score.score >= 80
                              ? "text-forest"
                              : score.score >= 60
                                ? "text-warning"
                                : "text-danger"
                          }`}
                        >
                          {score.score}
                        </p>
                        <p className="text-[10px] text-stone-400">
                          avg score
                        </p>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
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
                      <button className="rounded-lg p-1.5 text-stone-400 hover:bg-danger/10 hover:text-danger">
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
                            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Score breakdown sidebar */}
        <div className="lg:col-span-5">
          <div
            className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6"
            style={{ animationDelay: "300ms", boxShadow: "var(--shadow-sm)" }}
          >
            <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
              Alignment Scores
            </h3>
            <div className="space-y-4">
              {valuesScores
                .sort((a, b) => b.score - a.score)
                .map((v) => (
                  <div key={v.value}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-stone-700">
                        {v.value}
                      </span>
                      <span
                        className={`text-sm font-semibold tabular-nums ${
                          v.score >= 80
                            ? "text-forest"
                            : v.score >= 60
                              ? "text-warning"
                              : "text-danger"
                        }`}
                      >
                        {v.score}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className={`h-full rounded-full transition-all ${
                          v.score >= 80
                            ? "bg-forest"
                            : v.score >= 60
                              ? "bg-warning"
                              : "bg-danger"
                        }`}
                        style={{ width: `${v.score}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Tips */}
          <div
            className="card-enter mt-6 rounded-2xl border border-forest/10 bg-forest/[0.03] p-6"
            style={{ animationDelay: "400ms" }}
          >
            <h4 className="font-display text-sm font-semibold text-forest">
              Value Configuration Tips
            </h4>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-stone-600">
              <li className="flex gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-forest/40" />
                Keep values concise and actionable — 3-7 values work best
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-forest/40" />
                Include a clear description to help AI map feedback accurately
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-forest/40" />
                Values below 60 alignment may need reinforcement in team comms
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
