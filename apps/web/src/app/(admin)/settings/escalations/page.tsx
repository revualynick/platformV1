import { escalationDetails } from "@/lib/mock-data";
import { severityStyles, escalationStatusStyles as statusStyles } from "@/lib/style-constants";

export default function EscalationsPage() {
  const openCount = escalationDetails.filter(
    (e) => e.status === "open",
  ).length;
  const resolvedCount = escalationDetails.filter(
    (e) => e.status === "resolved",
  ).length;

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">HR Review</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Escalations
        </h1>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "Total",
            value: escalationDetails.length.toString(),
            sub: "All time",
            color: "text-stone-900",
          },
          {
            label: "Open",
            value: openCount.toString(),
            sub: "Require review",
            color: openCount > 0 ? "text-terracotta" : "text-forest",
          },
          {
            label: "Resolved",
            value: resolvedCount.toString(),
            sub: "Closed cases",
            color: "text-positive",
          },
          {
            label: "Avg Resolution",
            value: "2.1d",
            sub: "Average time to close",
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

      {/* Escalation detail cards */}
      <div className="space-y-6">
        {escalationDetails.map((esc, i) => {
          const severity = severityStyles[esc.severity];
          const status = statusStyles[esc.status];
          const isResolved = esc.status === "resolved";

          return (
            <div
              key={esc.id}
              className={`card-enter rounded-2xl border bg-white transition-all ${
                isResolved
                  ? "border-stone-100 opacity-75"
                  : "border-stone-200/60"
              }`}
              style={{
                animationDelay: `${300 + i * 100}ms`,
                boxShadow: isResolved ? undefined : "var(--shadow-sm)",
              }}
            >
              {/* Header */}
              <div className="flex items-start justify-between border-b border-stone-100 p-6">
                <div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        isResolved ? "bg-stone-300" : severity.dot
                      }`}
                    />
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider ${
                        isResolved ? "text-stone-400" : severity.text
                      }`}
                    >
                      {severity.label}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${status.bg} ${status.text}`}
                    >
                      {status.label}
                    </span>
                  </div>
                  <h3
                    className={`mt-2 font-display text-lg font-semibold ${
                      isResolved ? "text-stone-500" : "text-stone-900"
                    }`}
                  >
                    {esc.subjectName}
                  </h3>
                  <p
                    className={`mt-1 text-sm ${
                      isResolved ? "text-stone-400" : "text-stone-600"
                    }`}
                  >
                    {esc.reason}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-stone-400">{esc.createdAt}</p>
                  <p className="mt-1 text-xs text-stone-400">
                    {esc.feedbackCount} related
                  </p>
                </div>
              </div>

              <div className="grid gap-0 lg:grid-cols-2">
                {/* Audit trail */}
                <div className="border-b border-stone-100 p-6 lg:border-b-0 lg:border-r">
                  <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                    Audit Trail
                  </h4>
                  <div className="space-y-0">
                    {esc.auditTrail.map((entry, j) => (
                      <div key={j} className="flex gap-3">
                        {/* Timeline dot + line */}
                        <div className="flex flex-col items-center">
                          <div
                            className={`mt-1.5 h-2 w-2 rounded-full ${
                              isResolved ? "bg-stone-300" : "bg-forest"
                            }`}
                          />
                          {j < esc.auditTrail.length - 1 && (
                            <div className="w-px flex-1 bg-stone-100" />
                          )}
                        </div>
                        <div className="pb-4">
                          <p className="text-sm font-medium text-stone-700">
                            {entry.action}
                          </p>
                          <p className="mt-0.5 text-xs text-stone-400">
                            {entry.by} &middot; {entry.date}
                          </p>
                          {entry.notes && (
                            <p className="mt-1 text-xs leading-relaxed text-stone-500">
                              {entry.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Related feedback */}
                <div className="p-6">
                  <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                    Related Feedback
                  </h4>
                  <div className="space-y-2">
                    {esc.relatedFeedback.map((fb) => (
                      <div
                        key={fb.id}
                        className={`rounded-lg p-3 ${
                          isResolved ? "bg-stone-50" : severity.bg
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-stone-400">
                            {fb.date}
                          </span>
                          {fb.score > 0 && (
                            <span
                              className={`text-xs font-semibold tabular-nums ${
                                fb.score >= 50
                                  ? "text-stone-500"
                                  : "text-danger"
                              }`}
                            >
                              Score: {fb.score}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs italic leading-relaxed text-stone-600">
                          {fb.excerpt}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Actions */}
              {!isResolved && (
                <div className="flex items-center gap-3 border-t border-stone-100 px-6 py-4">
                  <button className="rounded-xl bg-forest px-4 py-2 text-xs font-medium text-white hover:bg-forest-light">
                    Begin Investigation
                  </button>
                  <button className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50">
                    Assign to HR
                  </button>
                  <button className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50">
                    Mark Resolved
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
