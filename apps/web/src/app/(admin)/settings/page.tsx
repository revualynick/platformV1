import { getOrgConfig } from "@/lib/api";
import {
  coreValues as mockCoreValues,
  integrations,
  escalations,
} from "@/lib/mock-data";
import { ValuesCard } from "./values-card";
import {
  severityStyles,
  integrationStatusStyles as statusStyles,
  platformIcons,
} from "@/lib/style-constants";

async function loadValues() {
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

export default async function AdminSettings() {
  const coreValues = await loadValues();
  const openEscalations = escalations.filter((e) => e.status === "open");

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Administration</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Acme Corp
        </h1>
      </div>

      {/* Top stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "Core Values",
            value: coreValues.length.toString(),
            sub: "Active",
            color: "text-forest",
          },
          {
            label: "Integrations",
            value: integrations
              .filter((i) => i.status === "connected")
              .length.toString(),
            sub: `of ${integrations.length} configured`,
            color: "text-forest",
          },
          {
            label: "Open Escalations",
            value: openEscalations.length.toString(),
            sub: "Require review",
            color:
              openEscalations.length > 0 ? "text-terracotta" : "text-forest",
          },
          {
            label: "Region",
            value: "US-E",
            sub: "us-east-1",
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
        {/* Left column: Values + Integrations */}
        <div className="space-y-6 lg:col-span-7">
          {/* Core Values */}
          <div
            className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6"
            style={{ animationDelay: "300ms", boxShadow: "var(--shadow-sm)" }}
          >
            <ValuesCard values={coreValues} />
          </div>

          {/* Integrations */}
          <div
            className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6"
            style={{ animationDelay: "400ms", boxShadow: "var(--shadow-sm)" }}
          >
            <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
              Integrations
            </h3>
            <div className="space-y-3">
              {integrations.map((integration) => {
                const status = statusStyles[integration.status];
                return (
                  <div
                    key={integration.id}
                    className="flex items-center gap-4 rounded-xl border border-stone-100 p-4 transition-colors hover:border-stone-200"
                  >
                    <span className="text-2xl">
                      {platformIcons[integration.platform] ?? "🔗"}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-stone-800">
                        {integration.name}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${status.dot}`}
                        />
                        <span className={`text-xs ${status.text}`}>
                          {status.label}
                        </span>
                        {integration.workspace && (
                          <span className="text-xs text-stone-400">
                            &middot; {integration.workspace}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      className={`rounded-xl px-4 py-2 text-xs font-medium transition-colors ${
                        integration.status === "connected"
                          ? "border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                          : "bg-forest text-white hover:bg-forest-light"
                      }`}
                    >
                      {integration.status === "connected"
                        ? "Configure"
                        : "Connect"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right column: Escalations */}
        <div className="lg:col-span-5">
          <div
            className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6"
            style={{ animationDelay: "500ms", boxShadow: "var(--shadow-sm)" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-stone-800">
                Escalations
              </h3>
              <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-medium text-stone-500">
                {escalations.length} total
              </span>
            </div>
            <div className="space-y-3">
              {escalations.map((esc) => {
                const style = severityStyles[esc.severity];
                const isResolved = esc.status === "resolved";
                return (
                  <div
                    key={esc.id}
                    className={`rounded-xl border p-4 ${
                      isResolved
                        ? "border-stone-100 bg-stone-50/50 opacity-60"
                        : `${style.bg} border-transparent`
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            isResolved ? "bg-stone-300" : style.dot
                          }`}
                        />
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wider ${
                            isResolved ? "text-stone-400" : style.text
                          }`}
                        >
                          {style.label}
                        </span>
                      </div>
                      <span className="text-[10px] text-stone-400">
                        {esc.createdAt}
                      </span>
                    </div>
                    <p
                      className={`mt-2 text-sm font-medium ${
                        isResolved ? "text-stone-500" : "text-stone-800"
                      }`}
                    >
                      {esc.subjectName}
                    </p>
                    <p
                      className={`mt-1 text-xs leading-relaxed ${
                        isResolved ? "text-stone-400" : "text-stone-600"
                      }`}
                    >
                      {esc.reason}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[10px] text-stone-400">
                        {esc.feedbackCount} related feedback{esc.feedbackCount !== 1 ? "s" : ""}
                      </span>
                      {!isResolved && (
                        <button className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-medium text-stone-600 shadow-sm hover:shadow-md">
                          Investigate
                        </button>
                      )}
                      {isResolved && (
                        <span className="rounded-full bg-positive/10 px-2 py-0.5 text-[10px] font-medium text-positive">
                          Resolved
                        </span>
                      )}
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
