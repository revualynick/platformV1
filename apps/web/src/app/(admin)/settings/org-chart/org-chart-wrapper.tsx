"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
const RelationshipGraph = dynamic(
  () => import("@/components/relationship-graph").then((m) => m.RelationshipGraph),
  { ssr: false, loading: () => <div className="h-[520px] animate-pulse rounded-xl bg-stone-50/50" /> },
);

interface GraphNode {
  id: string;
  name: string;
  role: string;
  team: string | null;
  managerId: string | null;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: "reports_to" | "thread";
  label: string;
  tags: string[];
  strength: number;
  source: string;
}

interface OrgChartWrapperProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  teams: string[];
}

export function OrgChartWrapper({ nodes, edges, teams }: OrgChartWrapperProps) {
  const [filterTeam, setFilterTeam] = useState<string | null>(null);
  const [showReportsTo, setShowReportsTo] = useState(true);
  const [showThreads, setShowThreads] = useState(true);

  return (
    <div>
      {/* Controls */}
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
            Filter by team
          </span>
          <select
            value={filterTeam ?? ""}
            onChange={(e) => setFilterTeam(e.target.value || null)}
            className="rounded-lg border border-stone-200 bg-surface px-3 py-1.5 text-sm text-stone-700 outline-none focus:border-forest/40 focus:ring-1 focus:ring-forest/20"
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={showReportsTo}
              onChange={(e) => setShowReportsTo(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-stone-300 text-forest accent-forest"
            />
            Reporting lines
          </label>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={showThreads}
              onChange={(e) => setShowThreads(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-stone-300 text-forest accent-forest"
            />
            Relationship threads
          </label>
        </div>
      </div>

      {/* Graph */}
      <RelationshipGraph
        nodes={nodes}
        edges={edges}
        filterTeam={filterTeam}
        showReportsTo={showReportsTo}
        showThreads={showThreads}
      />
    </div>
  );
}
