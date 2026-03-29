import { auth } from "@/lib/auth";
import { isDemoSession } from "@/lib/session-utils";
import { orgPeople, orgThreads } from "@/lib/mock-data";
import type { OrgRole } from "@/lib/mock-data";
import { getDb } from "@/lib/db";
import { getFullOrgGraph } from "@revualy/db/queries";
import { TeamOrgChart } from "@/app/(manager)/team/org-chart/team-org-chart";

// Map DB/mock role strings to OrgRole values
function mapRole(role: string): OrgRole {
  switch (role) {
    case "super_admin": return "vp";
    case "admin": return "director";
    case "manager": return "manager";
    case "lead": return "lead";
    case "senior": return "senior";
    case "mid": return "mid";
    case "junior": return "junior";
    case "vp": return "vp";
    case "director": return "director";
    default: return "mid";
  }
}

export default async function AdminOrgChartPage() {
  const session = await auth();
  const isDemo = isDemoSession(session);

  type RawNode = { id: string; name: string; role: string; team: string | null; managerId: string | null };
  type RawEdge = { id: string; from: string; to: string; type: "reports_to" | "thread"; label: string; tags: string[]; strength: number; source: string };

  let nodes: RawNode[];
  let edges: RawEdge[];

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

  // Transform nodes → TeamPerson[]
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const people = nodes.map((n) => ({
    id: n.id,
    name: n.name,
    role: mapRole(n.role),
    title: n.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    team: n.team ?? "",
    reportsTo: n.managerId,
  }));

  // Transform thread edges → TeamThread[]
  const threads = edges
    .filter((e) => e.type === "thread")
    .map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      tags: e.tags,
      strength: e.strength,
      label: e.label,
    }));

  // Find root: person with no managerId in the node set, or first node
  const nodeIds = new Set(nodes.map((n) => n.id));
  const root =
    nodes.find((n) => !n.managerId || !nodeIds.has(n.managerId)) ??
    nodes[0];

  const teamSet = new Set(nodes.map((n) => n.team).filter(Boolean));
  const teams = [...teamSet].sort() as string[];
  const reportingLines = edges.filter((e) => e.type === "reports_to").length;
  const threadCount = threads.length;

  return (
    <div className="max-w-[1400px]">
      {/* Header */}
      <div className="mb-8">
        <p className="text-sm font-medium text-stone-400">Administration</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Organization Chart
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">
          Full company structure with reporting lines and relationship threads.
          Drag to reposition, click to highlight connections.
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

      {/* Chart */}
      {people.length > 0 && root ? (
        <TeamOrgChart
          people={people}
          threads={threads}
          managerId={root.id}
        />
      ) : (
        <div className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-12 text-center" style={{ animationDelay: "300ms" }}>
          <p className="text-sm text-stone-400">No organization data available.</p>
        </div>
      )}
    </div>
  );
}
