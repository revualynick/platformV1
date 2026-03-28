import { auth } from "@/lib/auth";
import { isDemoSession } from "@/lib/session-utils";
import { orgPeople, orgThreads } from "@/lib/mock-data";
import { getDb } from "@/lib/db";
import { getFullOrgGraph } from "@revualy/db/queries";
import { OrgChartWrapper } from "./org-chart-wrapper";

export default async function AdminOrgChartPage() {
  const session = await auth();
  const isDemo = isDemoSession(session);

  let nodes: { id: string; name: string; role: string; team: string | null; managerId: string | null }[];
  let edges: { id: string; from: string; to: string; type: "reports_to" | "thread"; label: string; tags: string[]; strength: number; source: string }[];

  if (isDemo) {
    nodes = orgPeople.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      team: p.team,
      managerId: p.reportsTo,
    }));
    edges = [
      ...orgPeople
        .filter((p) => p.reportsTo)
        .map((p) => ({
          id: `reporting-${p.id}`,
          from: p.reportsTo!,
          to: p.id,
          type: "reports_to" as const,
          label: "Reports to",
          tags: [] as string[],
          strength: 1,
          source: "org",
        })),
      ...orgThreads.map((t) => ({
        id: t.id,
        from: t.from,
        to: t.to,
        type: "thread" as const,
        label: t.label,
        tags: t.tags,
        strength: t.strength,
        source: "thread",
      })),
    ];
  } else {
    try {
      const graph = await getFullOrgGraph(getDb());
      nodes = graph.nodes;
      edges = graph.edges;
    } catch {
      nodes = [];
      edges = [];
    }
  }

  const teamSet = new Set(nodes.map((n) => n.team).filter(Boolean));
  const teams = [...teamSet].sort() as string[];
  const reportingLines = edges.filter((e) => e.type === "reports_to").length;
  const threadCount = edges.filter((e) => e.type === "thread").length;

  return (
    <div className="max-w-[1200px]">
      {/* Header */}
      <div className="mb-8">
        <p className="text-sm font-medium text-stone-400">Administration</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Organization Chart
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">
          Full company structure with reporting lines and relationship threads.
          Drag to reposition, scroll to zoom, click to highlight connections.
        </p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "People", value: nodes.length.toString(), color: "text-forest" },
          { label: "Teams", value: teams.length.toString(), color: "text-stone-900" },
          { label: "Reporting Lines", value: reportingLines.toString(), color: "text-stone-900" },
          { label: "Relationship Threads", value: threadCount.toString(), color: "text-terracotta" },
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
              <p className={`mt-1 font-display text-2xl font-semibold ${stat.color}`}>
                {stat.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* Graph */}
      <div
        className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6"
        style={{ animationDelay: "300ms", boxShadow: "var(--shadow-sm)" }}
      >
        <OrgChartWrapper nodes={nodes} edges={edges} teams={teams} />
      </div>
    </div>
  );
}
