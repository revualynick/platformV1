"use client";

import { useState, useCallback } from "react";
import { RelationshipGraph } from "@/components/relationship-graph";

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

interface OrgChartClientProps {
  nodes: OrgNode[];
  edges: OrgEdge[];
  uniqueTeams: string[];
}

export function OrgChartClient({ nodes, edges, uniqueTeams }: OrgChartClientProps) {
  const [filterTeam, setFilterTeam] = useState<string | null>(null);
  const [showReportsTo, setShowReportsTo] = useState(true);
  const [showThreads, setShowThreads] = useState(true);
  const [resetKey, setResetKey] = useState(0);

  const handleReset = useCallback(() => {
    setFilterTeam(null);
    setShowReportsTo(true);
    setShowThreads(true);
    setResetKey((k) => k + 1);
  }, []);

  return (
    <div
      className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      {/* Controls header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-base font-semibold text-stone-800">
          Relationship Web
        </h3>

        <div className="flex flex-wrap items-center gap-3">
          {/* Team filter */}
          <select
            value={filterTeam ?? ""}
            onChange={(e) => setFilterTeam(e.target.value || null)}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600 outline-none transition hover:border-stone-300 focus:border-forest focus:ring-1 focus:ring-forest/20"
          >
            <option value="">All teams</option>
            {uniqueTeams.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </select>

          {/* Edge type toggles */}
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-stone-600">
            <input
              type="checkbox"
              checked={showReportsTo}
              onChange={(e) => setShowReportsTo(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-stone-300 text-forest accent-forest"
            />
            Reports to
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-stone-600">
            <input
              type="checkbox"
              checked={showThreads}
              onChange={(e) => setShowThreads(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-stone-300 text-forest accent-forest"
            />
            Threads
          </label>

          {/* Reset button */}
          <button
            onClick={handleReset}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-500 transition hover:border-stone-300 hover:text-stone-700"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Graph */}
      <RelationshipGraph
        key={resetKey}
        nodes={nodes}
        edges={edges}
        filterTeam={filterTeam}
        showReportsTo={showReportsTo}
        showThreads={showThreads}
      />
    </div>
  );
}
