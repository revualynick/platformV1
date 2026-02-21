import { getOrgConfig, type CoreValueRow } from "@/lib/api";
import {
  coreValues as mockCoreValues,
  valuesScores,
} from "@/lib/mock-data";
import { ValuesList } from "./values-list";

async function loadValues(): Promise<
  Array<{ id: string; name: string; description: string; active: boolean }>
> {
  try {
    const { coreValues } = await getOrgConfig();
    return coreValues.map((v) => ({
      id: v.id,
      name: v.name,
      description: v.description,
      active: v.isActive,
    }));
  } catch {
    return mockCoreValues;
  }
}

export default async function ValuesPage() {
  const coreValues = await loadValues();
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
            className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-5"
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
            className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6"
            style={{ animationDelay: "200ms", boxShadow: "var(--shadow-sm)" }}
          >
            <ValuesList values={coreValues} scores={valuesScores} />
          </div>
        </div>

        {/* Score breakdown sidebar */}
        <div className="lg:col-span-5">
          <div
            className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6"
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
