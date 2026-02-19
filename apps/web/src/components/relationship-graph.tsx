"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import * as d3 from "d3";

// ── Types ────────────────────────────────────────────────

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

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  role: string;
  team: string | null;
  managerId: string | null;
  connectionCount: number;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  id: string;
  type: "reports_to" | "thread";
  label: string;
  tags: string[];
  strength: number;
  edgeSource: string;
}

interface RelationshipGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  filterTeam: string | null;
  showReportsTo: boolean;
  showThreads: boolean;
}

// ── Team color palette (warm earth tones) ────────────────

const TEAM_COLORS: Record<string, string> = {
  Engineering: "#064E3B",
  "Core Platform": "#059669",
  "Data & ML": "#EA580C",
  Infrastructure: "#D97706",
  Product: "#9333EA",
  Design: "#0891B2",
  Marketing: "#E11D48",
  Sales: "#7C3AED",
  HR: "#2563EB",
  Finance: "#65A30D",
};

const DEFAULT_COLORS = [
  "#064E3B", "#059669", "#EA580C", "#D97706", "#9333EA",
  "#0891B2", "#E11D48", "#7C3AED", "#2563EB", "#65A30D",
  "#0D9488", "#F59E0B", "#DC2626", "#6366F1", "#14B8A6",
];

function getTeamColor(team: string | null, teamIndex: Map<string, number>): string {
  if (!team) return "#78716C";
  if (TEAM_COLORS[team]) return TEAM_COLORS[team];
  const idx = teamIndex.get(team) ?? 0;
  return DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ── Component ────────────────────────────────────────────

export function RelationshipGraph({
  nodes,
  edges,
  filterTeam,
  showReportsTo,
  showThreads,
}: RelationshipGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    node: SimNode;
  } | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Track mounted state
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Build team index for color assignment
  const teamIndex = useMemo(() => {
    const uniqueTeams = [...new Set(nodes.map((n) => n.team).filter(Boolean))] as string[];
    return new Map(uniqueTeams.map((t, i) => [t, i]));
  }, [nodes]);

  // Filtered data
  const { filteredNodes, filteredEdges } = useMemo(() => {
    let fn = nodes;
    if (filterTeam) {
      fn = nodes.filter((n) => n.team === filterTeam);
    }
    const nodeIds = new Set(fn.map((n) => n.id));

    let fe = edges.filter(
      (e) => nodeIds.has(e.from) && nodeIds.has(e.to),
    );
    if (!showReportsTo) {
      fe = fe.filter((e) => e.type !== "reports_to");
    }
    if (!showThreads) {
      fe = fe.filter((e) => e.type !== "thread");
    }

    return { filteredNodes: fn, filteredEdges: fe };
  }, [nodes, edges, filterTeam, showReportsTo, showThreads]);

  // Observe container resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // D3 rendering
  useEffect(() => {
    if (!svgRef.current || filteredNodes.length === 0) return;

    const { width, height } = dimensions;
    const svg = d3.select(svgRef.current);

    // Clear previous
    svg.selectAll("*").remove();

    // Connection count per node
    const connectionCount = new Map<string, number>();
    filteredEdges.forEach((e) => {
      connectionCount.set(e.from, (connectionCount.get(e.from) ?? 0) + 1);
      connectionCount.set(e.to, (connectionCount.get(e.to) ?? 0) + 1);
    });

    // Build simulation data
    const simNodes: SimNode[] = filteredNodes.map((n) => ({
      ...n,
      connectionCount: connectionCount.get(n.id) ?? 0,
    }));

    const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

    const simLinks: SimLink[] = filteredEdges
      .filter((e) => nodeMap.has(e.from) && nodeMap.has(e.to))
      .map((e) => ({
        source: nodeMap.get(e.from)!,
        target: nodeMap.get(e.to)!,
        id: e.id,
        type: e.type,
        label: e.label,
        tags: e.tags,
        strength: e.strength,
        edgeSource: e.source,
      }));

    // Zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        zoomGroup.attr("transform", event.transform.toString());
      });

    svg.call(zoom);

    // Double-click to reset zoom
    svg.on("dblclick.zoom", null);

    const zoomGroup = svg.append("g").attr("class", "zoom-group");

    // Arrow marker definitions
    const defs = svg.append("defs");
    defs
      .append("marker")
      .attr("id", "arrow-reports")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 28)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#A8A29E");

    // Edges group
    const edgesGroup = zoomGroup.append("g").attr("class", "edges");

    const linkElements = edgesGroup
      .selectAll<SVGLineElement, SimLink>("line")
      .data(simLinks)
      .join("line")
      .attr("stroke", (d) => (d.type === "reports_to" ? "#A8A29E" : "#D6D3D1"))
      .attr("stroke-width", (d) =>
        d.type === "reports_to" ? 1.5 : Math.max(1, d.strength * 3),
      )
      .attr("stroke-dasharray", (d) =>
        d.type === "thread" ? "5,3" : "none",
      )
      .attr("marker-end", (d) =>
        d.type === "reports_to" ? "url(#arrow-reports)" : "",
      )
      .attr("opacity", 0.7);

    // Nodes group
    const nodesGroup = zoomGroup.append("g").attr("class", "nodes");

    const nodeRadius = (d: SimNode) =>
      Math.max(18, Math.min(30, 18 + d.connectionCount * 2));

    const nodeGroups = nodesGroup
      .selectAll<SVGGElement, SimNode>("g")
      .data(simNodes)
      .join("g")
      .attr("cursor", "pointer")
      .call(
        d3
          .drag<SVGGElement, SimNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );

    // Node circles
    nodeGroups
      .append("circle")
      .attr("r", nodeRadius)
      .attr("fill", (d) => getTeamColor(d.team, teamIndex))
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .attr("opacity", 0.9);

    // Initials text inside circles
    nodeGroups
      .append("text")
      .text((d) => getInitials(d.name))
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("fill", "#fff")
      .attr("font-size", (d) => (nodeRadius(d) > 22 ? "11px" : "9px"))
      .attr("font-family", "Outfit, sans-serif")
      .attr("font-weight", "600")
      .attr("pointer-events", "none");

    // Name labels below nodes
    nodeGroups
      .append("text")
      .text((d) => d.name.split(" ")[0])
      .attr("text-anchor", "middle")
      .attr("y", (d) => nodeRadius(d) + 14)
      .attr("fill", "#44403C")
      .attr("font-size", "10px")
      .attr("font-family", "Outfit, sans-serif")
      .attr("font-weight", "500")
      .attr("pointer-events", "none");

    // Hover and click interactions
    nodeGroups
      .on("mouseenter", function (event, d) {
        if (!mountedRef.current) return;

        // Get SVG-relative coordinates for tooltip
        const svgElement = svgRef.current;
        if (!svgElement) return;
        const rect = svgElement.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        setTooltip({ x, y, node: d });

        // Highlight node
        d3.select(this).select("circle").attr("stroke", "#1C1917").attr("stroke-width", 3);
      })
      .on("mouseleave", function () {
        if (!mountedRef.current) return;
        setTooltip(null);
        d3.select(this).select("circle").attr("stroke", "#fff").attr("stroke-width", 2);
      })
      .on("click", (_event, d) => {
        if (!mountedRef.current) return;

        setSelectedNodeId((prev) => (prev === d.id ? null : d.id));
      });

    // Force simulation
    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((d) => (d.type === "reports_to" ? 100 : 140))
          .strength((d) => (d.type === "reports_to" ? 0.8 : d.strength * 0.4)),
      )
      .force("charge", d3.forceManyBody().strength(-300).distanceMax(400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<SimNode>().radius((d) => nodeRadius(d) + 10))
      .force("x", d3.forceX(width / 2).strength(0.05))
      .force("y", d3.forceY(height / 2).strength(0.05));

    simulation.on("tick", () => {
      linkElements
        .attr("x1", (d) => (d.source as SimNode).x ?? 0)
        .attr("y1", (d) => (d.source as SimNode).y ?? 0)
        .attr("x2", (d) => (d.target as SimNode).x ?? 0)
        .attr("y2", (d) => (d.target as SimNode).y ?? 0);

      nodeGroups.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    // Initial fit-to-view after simulation settles
    simulation.on("end", () => {
      if (!mountedRef.current) return;

      // Calculate bounding box of all nodes
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      simNodes.forEach((n) => {
        const r = nodeRadius(n);
        if ((n.x ?? 0) - r < minX) minX = (n.x ?? 0) - r;
        if ((n.y ?? 0) - r < minY) minY = (n.y ?? 0) - r;
        if ((n.x ?? 0) + r > maxX) maxX = (n.x ?? 0) + r;
        if ((n.y ?? 0) + r > maxY) maxY = (n.y ?? 0) + r;
      });

      const padding = 60;
      const bw = maxX - minX + padding * 2;
      const bh = maxY - minY + padding * 2;
      const scale = Math.min(width / bw, height / bh, 1.2);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;

      const transform = d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(scale)
        .translate(-cx, -cy);

      svg
        .transition()
        .duration(800)
        .call(zoom.transform as never, transform);
    });

    return () => {
      simulation.stop();
    };
  }, [filteredNodes, filteredEdges, dimensions, teamIndex]);

  // Selection highlight effect
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);

    if (!selectedNodeId) {
      svg.selectAll(".nodes g").attr("opacity", 1);
      svg.selectAll(".edges line").attr("opacity", 0.7);
      return;
    }

    // Find connected node IDs
    const connectedIds = new Set<string>([selectedNodeId]);
    filteredEdges.forEach((e) => {
      if (e.from === selectedNodeId) connectedIds.add(e.to);
      if (e.to === selectedNodeId) connectedIds.add(e.from);
    });

    svg.selectAll<SVGGElement, SimNode>(".nodes g").attr("opacity", (d) =>
      connectedIds.has(d.id) ? 1 : 0.15,
    );

    svg.selectAll<SVGLineElement, SimLink>(".edges line").attr("opacity", (d) => {
      const sourceId = typeof d.source === "object" ? (d.source as SimNode).id : d.source;
      const targetId = typeof d.target === "object" ? (d.target as SimNode).id : d.target;
      return sourceId === selectedNodeId || targetId === selectedNodeId
        ? 1
        : 0.08;
    });
  }, [selectedNodeId, filteredEdges]);

  // Clear selection on click outside
  const handleSvgClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as Element).tagName === "svg") {
        setSelectedNodeId(null);
      }
    },
    [],
  );

  // Unique teams for legend
  const uniqueTeams = useMemo(
    () => [...new Set(nodes.map((n) => n.team).filter(Boolean))] as string[],
    [nodes],
  );

  return (
    <div className="relative">
      {/* Graph container */}
      <div
        ref={containerRef}
        className="relative h-[520px] w-full overflow-hidden rounded-xl bg-stone-50/50"
      >
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          onClick={handleSvgClick}
          className="block"
        />

        {/* Tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
            style={{
              left: tooltip.x + 12,
              top: tooltip.y - 12,
              boxShadow:
                "0 8px 24px rgba(28, 25, 23, 0.08), 0 2px 8px rgba(28, 25, 23, 0.04)",
              fontFamily: "Outfit, sans-serif",
            }}
          >
            <p className="font-medium text-stone-800">{tooltip.node.name}</p>
            <p className="mt-0.5 text-xs text-stone-500">{tooltip.node.role}</p>
            {tooltip.node.team && (
              <div className="mt-1 flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: getTeamColor(
                      tooltip.node.team,
                      teamIndex,
                    ),
                  }}
                />
                <span className="text-xs text-stone-400">
                  {tooltip.node.team}
                </span>
              </div>
            )}
            <p className="mt-1 text-[10px] text-stone-400">
              {tooltip.node.connectionCount} connection
              {tooltip.node.connectionCount !== 1 ? "s" : ""}
            </p>
          </div>
        )}

        {/* Empty state */}
        {filteredNodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-stone-400">
              No nodes to display with current filters
            </p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {/* Edge types */}
        <div className="flex items-center gap-4 border-r border-stone-200 pr-5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-stone-400">
            Edges
          </span>
          <div className="flex items-center gap-1.5">
            <svg width="24" height="2">
              <line
                x1="0"
                y1="1"
                x2="24"
                y2="1"
                stroke="#A8A29E"
                strokeWidth="1.5"
              />
            </svg>
            <span className="text-[11px] text-stone-500">Reports to</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="24" height="2">
              <line
                x1="0"
                y1="1"
                x2="24"
                y2="1"
                stroke="#D6D3D1"
                strokeWidth="2"
                strokeDasharray="5,3"
              />
            </svg>
            <span className="text-[11px] text-stone-500">Works with</span>
          </div>
        </div>

        {/* Team colors */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-medium uppercase tracking-wider text-stone-400">
            Teams
          </span>
          {uniqueTeams.map((team) => (
            <div key={team} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: getTeamColor(team, teamIndex) }}
              />
              <span className="text-[11px] text-stone-500">{team}</span>
            </div>
          ))}
          {nodes.some((n) => !n.team) && (
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: "#78716C" }}
              />
              <span className="text-[11px] text-stone-500">No team</span>
            </div>
          )}
        </div>
      </div>

      {/* Interaction hint */}
      <p className="mt-3 text-[10px] text-stone-400">
        Drag nodes to reposition. Scroll to zoom. Click a node to highlight
        connections. Click empty space to deselect.
      </p>
    </div>
  );
}
