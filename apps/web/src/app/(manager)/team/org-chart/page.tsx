import { getManagerOrgChart } from "@/lib/api";
import {
  orgPeople as mockPeople,
  orgThreads as mockThreads,
  threadTagColors,
} from "@/lib/mock-data";

interface OrgNode {
  id: string;
  name: string;
  role: string;
  team: string | null;
  managerId: string | null;
}

interface OrgEdge {
  id: string;
  from: string;
  to: string;
  type: "reports_to" | "thread";
  label: string;
  tags: string[];
  strength: number;
  source: string;
}

async function loadOrgChart(): Promise<{ nodes: OrgNode[]; edges: OrgEdge[] }> {
  try {
    const result = await getManagerOrgChart();
    if (result.nodes.length > 0) {
      return result;
    }
  } catch {
    // fall through
  }

  // Mock fallback
  const nodes: OrgNode[] = mockPeople.slice(1, 9).map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    team: p.team,
    managerId: p.reportsTo,
  }));

  const edges: OrgEdge[] = [
    ...mockPeople.slice(1, 9)
      .filter((p) => p.reportsTo && nodes.find((n) => n.id === p.reportsTo))
      .map((p) => ({
        id: `report-${p.id}`,
        from: p.id,
        to: p.reportsTo!,
        type: "reports_to" as const,
        label: "Reports to",
        tags: [],
        strength: 1,
        source: "hierarchy",
      })),
    ...mockThreads
      .filter((t) => nodes.find((n) => n.id === t.from) && nodes.find((n) => n.id === t.to))
      .map((t) => ({
        id: t.id,
        from: t.from,
        to: t.to,
        type: "thread" as const,
        label: t.label,
        tags: t.tags,
        strength: t.strength,
        source: "manual",
      })),
  ];

  return { nodes, edges };
}

function buildTree(nodes: OrgNode[], edges: OrgEdge[]) {
  // Find root (node with managerId not in the set)
  const nodeIds = new Set(nodes.map((n) => n.id));
  const root = nodes.find((n) => !n.managerId || !nodeIds.has(n.managerId));
  if (!root) return null;

  // Build children map
  const childrenMap = new Map<string, OrgNode[]>();
  for (const node of nodes) {
    if (node.managerId && nodeIds.has(node.managerId)) {
      const children = childrenMap.get(node.managerId) ?? [];
      children.push(node);
      childrenMap.set(node.managerId, children);
    }
  }

  return { root, childrenMap };
}

const roleColors: Record<string, string> = {
  admin: "bg-terracotta/10 text-terracotta",
  manager: "bg-forest/10 text-forest",
  director: "bg-forest/10 text-forest",
  lead: "bg-sky-100 text-sky-700",
  employee: "bg-stone-100 text-stone-600",
  senior: "bg-violet-100 text-violet-700",
  mid: "bg-stone-100 text-stone-600",
  junior: "bg-amber-100 text-amber-700",
};

function TreeNode({
  node,
  childrenMap,
  threads,
}: {
  node: OrgNode;
  childrenMap: Map<string, OrgNode[]>;
  threads: OrgEdge[];
}) {
  const children = childrenMap.get(node.id) ?? [];
  const nodeThreads = threads.filter(
    (t) => t.from === node.id || t.to === node.id,
  );

  return (
    <div className="flex flex-col items-center">
      {/* Node card */}
      <div className="w-44 rounded-xl border border-stone-200/60 bg-white p-3 text-center" style={{ boxShadow: "var(--shadow-sm)" }}>
        <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-xs font-medium text-stone-600">
          {node.name.split(" ").map((n) => n[0]).join("")}
        </div>
        <p className="text-sm font-medium text-stone-800 leading-tight">{node.name}</p>
        <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${roleColors[node.role] ?? "bg-stone-100 text-stone-600"}`}>
          {node.role}
        </span>
        {node.team && (
          <p className="mt-1 text-[10px] text-stone-400">{node.team}</p>
        )}
        {nodeThreads.length > 0 && (
          <div className="mt-2 flex flex-wrap justify-center gap-1">
            {nodeThreads.slice(0, 2).map((t) => (
              <span
                key={t.id}
                className="rounded-full bg-stone-50 px-1.5 py-0.5 text-[9px] text-stone-400"
                title={t.label}
              >
                {t.tags[0] ?? "thread"}
              </span>
            ))}
            {nodeThreads.length > 2 && (
              <span className="text-[9px] text-stone-300">+{nodeThreads.length - 2}</span>
            )}
          </div>
        )}
      </div>

      {/* Connector line */}
      {children.length > 0 && (
        <div className="h-6 w-px bg-stone-200" />
      )}

      {/* Children */}
      {children.length > 0 && (
        <div className="flex gap-4">
          {/* Horizontal connector bar */}
          {children.length > 1 && (
            <div className="absolute" />
          )}
          {children.map((child) => (
            <div key={child.id} className="flex flex-col items-center">
              <div className="h-4 w-px bg-stone-200" />
              <TreeNode
                node={child}
                childrenMap={childrenMap}
                threads={threads}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function OrgChartPage() {
  const { nodes, edges } = await loadOrgChart();
  const threads = edges.filter((e) => e.type === "thread");
  const tree = buildTree(nodes, edges);

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Organization</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Org Chart
        </h1>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        {[
          { label: "Team Members", value: nodes.length.toString(), color: "text-forest" },
          { label: "Reporting Lines", value: edges.filter((e) => e.type === "reports_to").length.toString(), color: "text-stone-900" },
          { label: "Threads", value: threads.length.toString(), color: "text-terracotta" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="card-enter rounded-2xl border border-stone-200/60 bg-white p-5"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
              {stat.label}
            </span>
            <p className={`mt-1 font-display text-2xl font-semibold ${stat.color}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Tree View */}
      <div
        className="card-enter overflow-x-auto rounded-2xl border border-stone-200/60 bg-white p-8"
        style={{ animationDelay: "200ms", boxShadow: "var(--shadow-sm)" }}
      >
        {tree ? (
          <div className="flex justify-center">
            <TreeNode
              node={tree.root}
              childrenMap={tree.childrenMap}
              threads={threads}
            />
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-stone-400">
            No org chart data available
          </p>
        )}
      </div>

      {/* Thread List */}
      {threads.length > 0 && (
        <div
          className="card-enter mt-6 rounded-2xl border border-stone-200/60 bg-white p-6"
          style={{ animationDelay: "300ms", boxShadow: "var(--shadow-sm)" }}
        >
          <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
            Relationship Threads
          </h3>
          <div className="space-y-3">
            {threads.map((t) => {
              const fromNode = nodes.find((n) => n.id === t.from);
              const toNode = nodes.find((n) => n.id === t.to);
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-xl border border-stone-100 p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-stone-700">
                      {fromNode?.name ?? "—"}
                    </span>
                    <span className="text-xs text-stone-300">↔</span>
                    <span className="text-sm font-medium text-stone-700">
                      {toNode?.name ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.tags.slice(0, 3).map((tag) => {
                      const colors = threadTagColors[tag] ?? { bg: "bg-stone-100", text: "text-stone-500" };
                      return (
                        <span
                          key={tag}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${colors.bg} ${colors.text}`}
                        >
                          {tag}
                        </span>
                      );
                    })}
                    <span className="text-xs text-stone-400">
                      {Math.round(t.strength * 100)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
