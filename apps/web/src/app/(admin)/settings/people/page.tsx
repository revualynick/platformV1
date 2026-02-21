"use client";

import { useState, useRef, useCallback } from "react";
import {
  orgPeople,
  orgThreads,
  threadTagColors,
} from "@/lib/mock-data";
import type { OrgRole } from "@/lib/mock-data";

// --- Layout constants ---
const CANVAS_W = 1100;
const MIN_CANVAS_H = 580;
const NODE_W = 130;
const NODE_H = 56;

const roleStyles: Record<OrgRole, { fill: string; label: string }> = {
  vp: { fill: "#292524", label: "VP" },
  director: { fill: "#44403c", label: "Dir" },
  manager: { fill: "#C4654A", label: "Mgr" },
  lead: { fill: "#2D5A3D", label: "Lead" },
  senior: { fill: "#2D5A3D", label: "Sr" },
  mid: { fill: "#0284c7", label: "Mid" },
  junior: { fill: "#7c3aed", label: "Jr" },
};

const threadStrokeColors: Record<string, string> = {
  "pair-programming": "#2D5A3D",
  "code-review": "#0284c7",
  mentorship: "#7c3aed",
  "cross-team": "#C4654A",
  security: "#dc2626",
  architecture: "#d97706",
  onboarding: "#16a34a",
  planning: "#78716c",
  data: "#0284c7",
  deployment: "#57534e",
  infra: "#57534e",
};

// --- Compute initial positions for each person in tree tiers ---
function computePositions(): Record<string, { x: number; y: number }> {
  const p: Record<string, { x: number; y: number }> = {};
  p["p0"] = { x: 550, y: 40 };
  p["p1"] = { x: 550, y: 160 };
  p["p2"] = { x: 270, y: 290 };
  p["p9"] = { x: 680, y: 290 };
  p["p12"] = { x: 970, y: 290 };
  p["p3"] = { x: 50, y: 440 };
  p["p4"] = { x: 140, y: 510 };
  p["p5"] = { x: 250, y: 440 };
  p["p6"] = { x: 340, y: 510 };
  p["p7"] = { x: 430, y: 440 };
  p["p8"] = { x: 510, y: 510 };
  p["p10"] = { x: 640, y: 440 };
  p["p11"] = { x: 740, y: 510 };
  p["p13"] = { x: 970, y: 440 };
  return p;
}

// Get edge anchor point on a node facing toward a target node
function getEdgeAnchor(
  nodePos: { x: number; y: number },
  targetPos: { x: number; y: number },
): { x: number; y: number } {
  const nc = { x: nodePos.x + NODE_W / 2, y: nodePos.y + NODE_H / 2 };
  const tc = { x: targetPos.x + NODE_W / 2, y: targetPos.y + NODE_H / 2 };
  const dx = tc.x - nc.x;
  const dy = tc.y - nc.y;
  // Compare with aspect-ratio-adjusted threshold to pick best edge
  if (Math.abs(dx) * (NODE_H / NODE_W) > Math.abs(dy)) {
    // Exit from left or right
    if (dx > 0) return { x: nodePos.x + NODE_W, y: nodePos.y + NODE_H / 2 };
    return { x: nodePos.x, y: nodePos.y + NODE_H / 2 };
  }
  // Exit from top or bottom
  if (dy > 0) return { x: nodePos.x + NODE_W / 2, y: nodePos.y + NODE_H };
  return { x: nodePos.x + NODE_W / 2, y: nodePos.y };
}

// Build a bezier curve path between two anchor points
function threadPath(x1: number, y1: number, x2: number, y2: number): string {
  const midY = (y1 + y2) / 2;
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  if (dy < 60) {
    // Same tier — arc above
    const curveY = Math.min(y1, y2) - 30 - dx * 0.1;
    return `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${curveY}, ${x2} ${y2}`;
  }
  // Different tiers — S-curve
  const cpOffset = dx * 0.15 + 20;
  return `M ${x1} ${y1} C ${x1 + cpOffset} ${midY}, ${x2 - cpOffset} ${midY}, ${x2} ${y2}`;
}

// Reporting line: smooth curve from bottom of parent to top of child
function reportingPath(x1: number, y1: number, x2: number, y2: number): string {
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

// Approximate midpoint of a bezier thread curve
function getCurveMidpoint(x1: number, y1: number, x2: number, y2: number) {
  const dy = Math.abs(y2 - y1);
  const dx = Math.abs(x2 - x1);
  if (dy < 60) {
    const midX = (x1 + x2) / 2;
    const curveY = Math.min(y1, y2) - 30 - dx * 0.1;
    return { x: midX, y: 0.25 * y1 + 0.5 * curveY + 0.25 * y2 };
  }
  const cpOffset = dx * 0.15 + 20;
  const midYBase = (y1 + y2) / 2;
  return {
    x: 0.125 * x1 + 0.375 * (x1 + cpOffset) + 0.375 * (x2 - cpOffset) + 0.125 * x2,
    y: 0.125 * y1 + 0.375 * midYBase + 0.375 * midYBase + 0.125 * y2,
  };
}

// Helper: get thread anchor points and midpoint from positions
function getThreadAnchors(
  fromId: string,
  toId: string,
  pos: Record<string, { x: number; y: number }>,
) {
  const from = pos[fromId];
  const to = pos[toId];
  if (!from || !to) return { a1: { x: 0, y: 0 }, a2: { x: 0, y: 0 }, mid: { x: 0, y: 0 } };
  const a1 = getEdgeAnchor(from, to);
  const a2 = getEdgeAnchor(to, from);
  const mid = getCurveMidpoint(a1.x, a1.y, a2.x, a2.y);
  return { a1, a2, mid };
}

// Rebalance direct children of a node below it, and recurse
function rebalanceChildren(
  pos: Record<string, { x: number; y: number }>,
  parentId: string,
): Record<string, { x: number; y: number }> {
  const result = { ...pos };
  const children = orgPeople
    .filter((p) => p.reportsTo === parentId)
    .sort((a, b) => result[a.id].x - result[b.id].x);
  if (children.length === 0) return result;

  const parentCenter = result[parentId].x + NODE_W / 2;
  const parentY = result[parentId].y;
  const spacing = Math.max(110, 500 / children.length);
  const totalWidth = (children.length - 1) * spacing;
  const startX = parentCenter - totalWidth / 2 - NODE_W / 2;
  const childBaseY = parentY + 140;

  children.forEach((child, i) => {
    result[child.id] = {
      x: Math.max(10, Math.min(CANVAS_W - NODE_W - 10, startX + i * spacing)),
      y: childBaseY + (i % 2 === 1 ? 70 : 0),
    };
  });

  // Recurse for grandchildren
  children.forEach((child) => {
    const gc = orgPeople.filter((p) => p.reportsTo === child.id);
    if (gc.length > 0) {
      const updated = rebalanceChildren(result, child.id);
      Object.assign(result, updated);
    }
  });

  return result;
}

export default function PeoplePage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [positions, setPositions] = useState(computePositions);
  const [hoveredPerson, setHoveredPerson] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [editingThread, setEditingThread] = useState<string | null>(null);
  const [showThreads, setShowThreads] = useState(true);
  const [drag, setDrag] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const highlightedPerson = drag ? drag.id : (hoveredPerson ?? selectedPerson);

  // Dynamic canvas height based on node positions
  const canvasH = Math.max(
    MIN_CANVAS_H,
    Math.max(...Object.values(positions).map((p) => p.y)) + NODE_H + 40,
  );

  // Convert screen coordinates to SVG viewBox coordinates
  const screenToSVG = useCallback(
    (e: React.MouseEvent): { x: number; y: number } => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM()?.inverse();
      if (!ctm) return { x: 0, y: 0 };
      const transformed = pt.matrixTransform(ctm);
      return { x: transformed.x, y: transformed.y };
    },
    [],
  );

  // Convert SVG coords to % for HTML overlays
  function svgToPercent(x: number, y: number) {
    return {
      left: `${(x / CANVAS_W) * 100}%`,
      top: `${(y / canvasH) * 100}%`,
    };
  }

  const handleDragStart = useCallback(
    (personId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const svgPt = screenToSVG(e);
      const pos = positions[personId];
      if (!pos) return;
      setDrag({
        id: personId,
        offsetX: svgPt.x - pos.x,
        offsetY: svgPt.y - pos.y,
      });
      setSelectedPerson(null);
      setEditingThread(null);
    },
    [screenToSVG, positions],
  );

  const handleDragMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drag) return;
      const svgPt = screenToSVG(e);
      setPositions((prev) => ({
        ...prev,
        [drag.id]: {
          x: Math.max(0, Math.min(CANVAS_W - NODE_W, svgPt.x - drag.offsetX)),
          y: Math.max(0, svgPt.y - drag.offsetY),
        },
      }));
    },
    [drag, screenToSVG],
  );

  const handleDragEnd = useCallback(() => {
    if (!drag) return;
    // Rebalance children of the dragged node below its new position
    setPositions((prev) => rebalanceChildren(prev, drag.id));
    setDrag(null);
  }, [drag]);

  const activeThreads = highlightedPerson
    ? orgThreads.filter(
        (t) => t.from === highlightedPerson || t.to === highlightedPerson,
      )
    : orgThreads;

  const teams = [...new Set(orgPeople.map((p) => p.team))];
  const allTags = [...new Set(orgThreads.flatMap((t) => t.tags))].sort();

  return (
    <div className="max-w-[1200px]">
      {/* Header */}
      <div className="mb-8">
        <p className="text-sm font-medium text-stone-400">Organization</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          People & Structure
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">
          Reporting structure with organic relationship threads. Drag people to
          rearrange — their reports will rebalance automatically.
        </p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "People",
            value: orgPeople.length.toString(),
            sub: `${teams.length} teams`,
            color: "text-stone-900",
          },
          {
            label: "Threads",
            value: orgThreads.length.toString(),
            sub: "Relationship links",
            color: "text-terracotta",
          },
          {
            label: "Cross-team",
            value: orgThreads
              .filter((t) => t.tags.includes("cross-team"))
              .length.toString(),
            sub: "Bridging connections",
            color: "text-forest",
          },
          {
            label: "Avg Strength",
            value:
              Math.round(
                (orgThreads.reduce((s, t) => s + t.strength, 0) /
                  orgThreads.length) *
                  100,
              ).toString() + "%",
            sub: "Connection health",
            color: "text-forest",
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
            <p className={`mt-1 font-display text-2xl font-semibold ${stat.color}`}>
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-stone-400">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="card-enter mb-4 flex flex-wrap items-center gap-3" style={{ animationDelay: "250ms" }}>
        <button className="rounded-xl bg-forest shadow-[0_8px_20px_rgba(61,24,55,0.25)] px-4 py-2.5 text-xs font-medium text-white hover:bg-forest-light">
          + Add Person
        </button>
        <button className="rounded-xl border border-stone-200 bg-surface px-4 py-2.5 text-xs font-medium text-stone-600 hover:bg-stone-50">
          + Draw Thread
        </button>
        <button className="rounded-xl border border-stone-200 bg-surface px-4 py-2.5 text-xs font-medium text-stone-600 hover:bg-stone-50">
          <span className="mr-1.5">↑</span>
          Import CSV
        </button>
        <button
          onClick={() => setPositions(computePositions)}
          className="rounded-xl border border-stone-200 bg-surface px-4 py-2.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
        >
          Reset Layout
        </button>
        <button
          onClick={() => {
            setShowThreads((v) => !v);
            setSelectedThread(null);
            setEditingThread(null);
          }}
          className={`rounded-xl border px-4 py-2.5 text-xs font-medium transition-colors ${
            showThreads
              ? "border-forest/20 bg-forest/[0.06] text-forest hover:bg-forest/10"
              : "border-stone-200 bg-surface text-stone-500 hover:bg-stone-50"
          }`}
        >
          {showThreads ? "Threads On" : "Threads Off"}
        </button>
        {(hoveredPerson || selectedPerson) && (
          <button
            onClick={() => { setHoveredPerson(null); setSelectedPerson(null); setEditingThread(null); }}
            className="ml-auto rounded-xl border border-stone-200 bg-surface px-4 py-2.5 text-xs font-medium text-stone-500 hover:bg-stone-50"
          >
            Clear selection
          </button>
        )}
      </div>

      {/* Tag legend */}
      <div className={`card-enter mb-4 flex flex-wrap items-center gap-1.5 transition-opacity duration-200 ${showThreads ? "opacity-100" : "pointer-events-none opacity-0"}`} style={{ animationDelay: "300ms" }}>
        <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-stone-400">
          Threads:
        </span>
        {allTags.map((tag) => {
          const color = threadStrokeColors[tag] ?? "#78716c";
          return (
            <span
              key={tag}
              className="flex items-center gap-1.5 rounded-full bg-surface/80 px-2.5 py-1 text-[10px] font-medium text-stone-600"
            >
              <span
                className="inline-block h-px w-4"
                style={{ borderTop: `2px dashed ${color}` }}
              />
              {tag}
            </span>
          );
        })}
        <span className="ml-3 flex items-center gap-1.5 text-[10px] text-stone-400">
          <span className="inline-block h-px w-6 border-t-2 border-stone-800" />
          reports to
        </span>
      </div>

      {/* Canvas */}
      <div
        className="card-enter relative rounded-2xl border border-stone-200/60 bg-surface"
        style={{ animationDelay: "350ms", boxShadow: "var(--shadow-sm)" }}
      >
        <div className="overflow-x-auto">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CANVAS_W} ${canvasH}`}
            className="w-full"
            style={{
              minWidth: 900,
              cursor: drag ? "grabbing" : undefined,
            }}
            onClick={() => { if (!drag) { setSelectedPerson(null); setEditingThread(null); } }}
            onMouseMove={handleDragMove}
            onMouseUp={handleDragEnd}
            onMouseLeave={handleDragEnd}
          >
            {/* Reporting lines (solid black) with anchor dots */}
            {orgPeople
              .filter((p) => p.reportsTo)
              .map((p) => {
                const from = positions[p.reportsTo!];
                const to = positions[p.id];
                if (!from || !to) return null;
                const dimmed =
                  highlightedPerson !== null &&
                  highlightedPerson !== p.id &&
                  highlightedPerson !== p.reportsTo;
                // Bottom center of parent → top center of child
                const x1 = from.x + NODE_W / 2;
                const y1 = from.y + NODE_H;
                const x2 = to.x + NODE_W / 2;
                const y2 = to.y;
                const op = dimmed ? 0.08 : 0.35;
                return (
                  <g key={`report-${p.id}`} className="transition-opacity duration-200">
                    <path
                      d={reportingPath(x1, y1, x2, y2)}
                      fill="none"
                      stroke="#292524"
                      strokeWidth={1.5}
                      opacity={op}
                    />
                    {/* Anchor dot on parent (bottom) */}
                    <circle cx={x1} cy={y1} r={3} fill="white" stroke="#292524" strokeWidth={1.5} opacity={op} />
                    {/* Anchor dot on child (top) */}
                    <circle cx={x2} cy={y2} r={3} fill="white" stroke="#292524" strokeWidth={1.5} opacity={op} />
                  </g>
                );
              })}

            {/* Thread lines (dashed, colored bezier curves with edge anchors + midpoint nodes) */}
            {showThreads && orgThreads.map((thread) => {
              const from = positions[thread.from];
              const to = positions[thread.to];
              if (!from || !to) return null;

              const primaryTag = thread.tags[0];
              const color = threadStrokeColors[primaryTag] ?? "#78716c";
              const width = 1.5 + thread.strength * 3;
              const dashSize = 4 + thread.strength * 4;

              const isActive =
                highlightedPerson === null ||
                highlightedPerson === thread.from ||
                highlightedPerson === thread.to;
              const isSelected = selectedThread === thread.id;
              const isEditing = editingThread === thread.id;

              // Edge anchor points
              const { a1, a2, mid } = getThreadAnchors(thread.from, thread.to, positions);
              const nodeRadius = isSelected || isEditing ? 7 : 5;
              const lineOp = isActive ? (isSelected || isEditing ? 0.85 : 0.5) : 0.08;

              return (
                <g key={`thread-${thread.id}`}>
                  {/* Hit area */}
                  <path
                    d={threadPath(a1.x, a1.y, a2.x, a2.y)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12}
                    className="cursor-pointer"
                    onMouseEnter={() => { if (!drag) setSelectedThread(thread.id); }}
                    onMouseLeave={() => { if (!drag) setSelectedThread(null); }}
                  />
                  {/* Visible dashed path */}
                  <path
                    d={threadPath(a1.x, a1.y, a2.x, a2.y)}
                    fill="none"
                    stroke={color}
                    strokeWidth={isSelected || isEditing ? width + 1 : width}
                    strokeLinecap="round"
                    strokeDasharray={`${dashSize} ${dashSize * 0.7}`}
                    opacity={lineOp}
                    className="pointer-events-none transition-all duration-200"
                  />
                  {/* Edge anchor dots */}
                  <circle cx={a1.x} cy={a1.y} r={3.5} fill="white" stroke={color} strokeWidth={1.5} opacity={lineOp} className="pointer-events-none" />
                  <circle cx={a2.x} cy={a2.y} r={3.5} fill="white" stroke={color} strokeWidth={1.5} opacity={lineOp} className="pointer-events-none" />
                  {/* Midpoint node */}
                  <circle
                    cx={mid.x}
                    cy={mid.y}
                    r={nodeRadius + 5}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => { if (!drag) setSelectedThread(thread.id); }}
                    onMouseLeave={() => { if (!drag) setSelectedThread(null); }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingThread(editingThread === thread.id ? null : thread.id);
                      setSelectedPerson(null);
                    }}
                  />
                  <circle
                    cx={mid.x}
                    cy={mid.y}
                    r={nodeRadius}
                    fill="white"
                    stroke={color}
                    strokeWidth={isSelected || isEditing ? 2.5 : 1.5}
                    opacity={isActive ? (isSelected || isEditing ? 1 : 0.7) : 0.1}
                    className="pointer-events-none transition-all duration-200"
                  />
                  <circle
                    cx={mid.x}
                    cy={mid.y}
                    r={Math.max(nodeRadius - 2.5, 1.5)}
                    fill={color}
                    opacity={isActive ? (isSelected || isEditing ? 0.8 : 0.4) : 0.08}
                    className="pointer-events-none transition-all duration-200"
                  />
                  {/* Thread label tooltip on hover */}
                  {isSelected && !editingThread && !drag && (
                    <g>
                      <rect
                        x={mid.x - 80}
                        y={mid.y - nodeRadius - 26}
                        width={160}
                        height={22}
                        rx={8}
                        fill="white"
                        stroke={color}
                        strokeWidth={1}
                        opacity={0.95}
                      />
                      <text
                        x={mid.x}
                        y={mid.y - nodeRadius - 11}
                        textAnchor="middle"
                        fontSize={9}
                        fill="#57534e"
                        fontFamily="var(--font-body)"
                      >
                        {thread.label.length > 30
                          ? thread.label.slice(0, 30) + "…"
                          : thread.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Person nodes */}
            {orgPeople.map((person) => {
              const pos = positions[person.id];
              if (!pos) return null;

              const role = roleStyles[person.role];
              const threads = orgThreads.filter(
                (t) => t.from === person.id || t.to === person.id,
              );
              const isHighlighted = highlightedPerson === person.id;
              const isDragging = drag?.id === person.id;
              const isDimmed =
                highlightedPerson !== null && !isHighlighted &&
                !orgThreads.some(
                  (t) =>
                    (t.from === highlightedPerson && t.to === person.id) ||
                    (t.to === highlightedPerson && t.from === person.id),
                ) &&
                person.reportsTo !== highlightedPerson &&
                !orgPeople.some(
                  (p) => p.id === highlightedPerson && p.reportsTo === person.id,
                );

              const firstName = person.name.split(" ")[0];
              const initials = person.name
                .split(" ")
                .map((n) => n[0])
                .join("");

              return (
                <g
                  key={person.id}
                  style={{ cursor: isDragging ? "grabbing" : "grab" }}
                  onMouseEnter={() => { if (!drag) setHoveredPerson(person.id); }}
                  onMouseLeave={() => { if (!drag) setHoveredPerson(null); }}
                  onMouseDown={(e) => handleDragStart(person.id, e)}
                  onClick={(e) => {
                    if (drag) return; // don't select on drag end
                    e.stopPropagation();
                    setSelectedPerson(selectedPerson === person.id ? null : person.id);
                    setEditingThread(null);
                  }}
                >
                  {/* Drop shadow while dragging */}
                  {isDragging && (
                    <rect
                      x={pos.x + 3}
                      y={pos.y + 4}
                      width={NODE_W}
                      height={NODE_H}
                      rx={14}
                      fill="#292524"
                      opacity={0.08}
                    />
                  )}
                  {/* Card bg */}
                  <rect
                    x={pos.x}
                    y={pos.y}
                    width={NODE_W}
                    height={NODE_H}
                    rx={14}
                    fill="white"
                    stroke={isDragging ? "#2D5A3D" : isHighlighted ? role.fill : "#e7e5e4"}
                    strokeWidth={isDragging ? 2 : isHighlighted ? 2 : 1}
                    opacity={isDimmed ? 0.3 : 1}
                    className="transition-all duration-200"
                  />
                  {/* Avatar circle */}
                  <circle
                    cx={pos.x + 22}
                    cy={pos.y + NODE_H / 2}
                    r={14}
                    fill={role.fill}
                    opacity={isDimmed ? 0.3 : person.role === "senior" || person.role === "mid" || person.role === "junior" ? 0.12 : 1}
                  />
                  <text
                    x={pos.x + 22}
                    y={pos.y + NODE_H / 2 + 3.5}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={600}
                    fill={
                      person.role === "senior" || person.role === "mid" || person.role === "junior"
                        ? role.fill
                        : "white"
                    }
                    opacity={isDimmed ? 0.3 : 1}
                    className="transition-opacity duration-200"
                  >
                    {initials}
                  </text>
                  {/* Name */}
                  <text
                    x={pos.x + 42}
                    y={pos.y + 22}
                    fontSize={11}
                    fontWeight={600}
                    fill="#292524"
                    opacity={isDimmed ? 0.25 : 1}
                    className="transition-opacity duration-200"
                    fontFamily="var(--font-body)"
                  >
                    {firstName}
                  </text>
                  {/* Role badge */}
                  <rect
                    x={pos.x + 42}
                    y={pos.y + 30}
                    width={28}
                    height={14}
                    rx={7}
                    fill={role.fill}
                    opacity={isDimmed ? 0.15 : 0.12}
                  />
                  <text
                    x={pos.x + 56}
                    y={pos.y + 40}
                    textAnchor="middle"
                    fontSize={8}
                    fontWeight={700}
                    fill={role.fill}
                    opacity={isDimmed ? 0.2 : 0.7}
                    fontFamily="var(--font-body)"
                  >
                    {role.label}
                  </text>
                  {/* Thread count dot */}
                  {showThreads && threads.length > 0 && (
                    <g opacity={isDimmed ? 0.2 : 1} className="transition-opacity duration-200">
                      <circle
                        cx={pos.x + NODE_W - 14}
                        cy={pos.y + 14}
                        r={8}
                        fill="#2D5A3D"
                        opacity={0.1}
                      />
                      <text
                        x={pos.x + NODE_W - 14}
                        y={pos.y + 17.5}
                        textAnchor="middle"
                        fontSize={8}
                        fontWeight={700}
                        fill="#2D5A3D"
                        fontFamily="var(--font-body)"
                      >
                        {threads.length}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* HTML overlay: Person action popover */}
        {selectedPerson && !drag && (() => {
          const person = orgPeople.find((p) => p.id === selectedPerson);
          if (!person) return null;
          const pos = positions[person.id];
          if (!pos) return null;
          const role = roleStyles[person.role];
          const personThreads = orgThreads.filter(
            (t) => t.from === person.id || t.to === person.id,
          );
          const openAbove = pos.y + NODE_H / 2 > canvasH / 2;
          const anchor = openAbove
            ? svgToPercent(pos.x + NODE_W / 2, pos.y)
            : svgToPercent(pos.x + NODE_W / 2, pos.y + NODE_H);
          return (
            <div
              className={`absolute z-20 -translate-x-1/2 ${openAbove ? "-translate-y-full" : ""}`}
              style={{
                left: anchor.left,
                top: anchor.top,
                ...(openAbove ? { marginTop: -8 } : { marginTop: 8 }),
              }}
            >
              <div className="w-52 rounded-xl border border-stone-200 bg-surface p-3.5 shadow-xl">
                <div className="mb-2 flex items-center gap-2.5">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                    style={{ backgroundColor: role.fill }}
                  >
                    {person.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-stone-800">{person.name}</p>
                    <p className="text-[10px] text-stone-400">{person.title}</p>
                  </div>
                </div>
                <div className="mb-2.5 flex items-center gap-1.5 text-[10px] text-stone-400">
                  <span className="rounded-full px-2 py-0.5 text-[9px] font-medium" style={{ backgroundColor: role.fill + "14", color: role.fill }}>
                    {role.label}
                  </span>
                  <span>{person.team}</span>
                  <span>·</span>
                  <span>{personThreads.length} threads</span>
                </div>
                <div className="space-y-1">
                  <button className="flex w-full items-center gap-2 rounded-lg bg-forest/8 px-3 py-2 text-[11px] font-medium text-forest hover:bg-forest/15">
                    <span className="text-sm">+</span>
                    Add Thread
                  </button>
                  <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium text-stone-600 hover:bg-stone-50">
                    <span className="text-sm">✎</span>
                    Edit Role
                  </button>
                  <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium text-stone-600 hover:bg-stone-50">
                    <span className="text-sm">↗</span>
                    Change Reports To
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* HTML overlay: Thread edit panel */}
        {showThreads && editingThread && !drag && (() => {
          const thread = orgThreads.find((t) => t.id === editingThread);
          if (!thread) return null;
          const { mid } = getThreadAnchors(thread.from, thread.to, positions);
          const primaryTag = thread.tags[0];
          const color = threadStrokeColors[primaryTag] ?? "#78716c";
          const pct = svgToPercent(mid.x, mid.y);
          const openAbove = mid.y > canvasH / 2;
          return (
            <div
              className={`absolute z-20 -translate-x-1/2 ${openAbove ? "-translate-y-full" : ""}`}
              style={{
                left: pct.left,
                top: pct.top,
                ...(openAbove ? { marginTop: -12 } : { marginTop: 12 }),
              }}
            >
              <div className="w-56 rounded-xl border bg-surface p-3.5 shadow-xl" style={{ borderColor: color + "40" }}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                    Edit Thread
                  </span>
                  <button
                    onClick={() => setEditingThread(null)}
                    className="flex h-5 w-5 items-center justify-center rounded-md text-[10px] text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                  >
                    ✕
                  </button>
                </div>
                <p className="mb-1.5 text-[11px] font-medium text-stone-700">
                  {orgPeople.find((p) => p.id === thread.from)?.name.split(" ")[0]} ↔{" "}
                  {orgPeople.find((p) => p.id === thread.to)?.name.split(" ")[0]}
                </p>
                <div className="mb-2 flex flex-wrap gap-1">
                  {thread.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full px-2 py-0.5 text-[8px] font-medium"
                      style={{ backgroundColor: color + "18", color }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mb-2.5">
                  <span className="text-[9px] text-stone-400">Strength</span>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${thread.strength * 100}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums text-stone-500">
                      {Math.round(thread.strength * 100)}%
                    </span>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button className="flex-1 rounded-lg bg-stone-100 py-1.5 text-[10px] font-medium text-stone-600 hover:bg-stone-200">
                    Edit Tags
                  </button>
                  <button className="flex-1 rounded-lg bg-danger/10 py-1.5 text-[10px] font-medium text-danger hover:bg-danger/20">
                    Remove
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Thread detail panel below canvas */}
      {showThreads && <div className="mt-6 grid gap-6 lg:grid-cols-12">
        {/* Thread list */}
        <div className="lg:col-span-7">
          <div
            className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6"
            style={{ animationDelay: "500ms", boxShadow: "var(--shadow-sm)" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-stone-800">
                {highlightedPerson
                  ? `Threads — ${orgPeople.find((p) => p.id === highlightedPerson)?.name}`
                  : "All Threads"}
              </h3>
              <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-medium text-stone-500">
                {activeThreads.length} connection{activeThreads.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="space-y-2.5">
              {activeThreads.map((thread) => {
                const fromPerson = orgPeople.find((p) => p.id === thread.from);
                const toPerson = orgPeople.find((p) => p.id === thread.to);
                if (!fromPerson || !toPerson) return null;
                const primaryColor =
                  threadStrokeColors[thread.tags[0]] ?? "#78716c";

                return (
                  <div
                    key={thread.id}
                    className="group flex items-start gap-3 rounded-xl border border-stone-100 p-3.5 transition-colors hover:border-stone-200 hover:bg-stone-50/50"
                    style={{ borderLeftColor: primaryColor, borderLeftWidth: 3 }}
                    onMouseEnter={() => setSelectedThread(thread.id)}
                    onMouseLeave={() => setSelectedThread(null)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-stone-700">
                          {fromPerson.name.split(" ")[0]}
                        </span>
                        <svg className="h-3 w-3 text-stone-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                        </svg>
                        <span className="text-xs font-medium text-stone-700">
                          {toPerson.name.split(" ")[0]}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-stone-500">{thread.label}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {thread.tags.map((tag) => {
                          const tc = threadTagColors[tag] ?? { bg: "bg-stone-100", text: "text-stone-500" };
                          return (
                            <span key={tag} className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${tc.bg} ${tc.text}`}>
                              {tag}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-stone-100">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${thread.strength * 100}%`,
                              backgroundColor: primaryColor,
                              opacity: 0.6,
                            }}
                          />
                        </div>
                        <span className="text-[10px] tabular-nums text-stone-400">
                          {Math.round(thread.strength * 100)}%
                        </span>
                      </div>
                      <span className="text-[9px] text-stone-300">strength</span>
                    </div>
                  </div>
                );
              })}
              {activeThreads.length === 0 && (
                <p className="py-4 text-center text-xs text-stone-400">
                  No threads for this person yet
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Teams summary */}
        <div className="lg:col-span-5">
          <div
            className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6"
            style={{ animationDelay: "600ms", boxShadow: "var(--shadow-sm)" }}
          >
            <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
              Teams
            </h3>
            <div className="space-y-3">
              {teams.map((team) => {
                const members = orgPeople.filter((p) => p.team === team);
                const crossTeam = orgThreads.filter(
                  (t) =>
                    (members.some((m) => m.id === t.from) || members.some((m) => m.id === t.to)) &&
                    !(members.some((m) => m.id === t.from) && members.some((m) => m.id === t.to)),
                );
                return (
                  <div key={team} className="flex items-center justify-between rounded-xl px-3 py-3 transition-colors hover:bg-stone-50">
                    <div>
                      <p className="text-sm font-medium text-stone-800">{team}</p>
                      <p className="text-[11px] text-stone-400">
                        {members.length} people
                        {crossTeam.length > 0 && ` · ${crossTeam.length} cross-team threads`}
                      </p>
                    </div>
                    <div className="flex -space-x-1.5">
                      {members.slice(0, 5).map((m) => (
                        <div
                          key={m.id}
                          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-stone-100 text-[8px] font-medium text-stone-500"
                          title={m.name}
                        >
                          {m.name.split(" ").map((n) => n[0]).join("")}
                        </div>
                      ))}
                      {members.length > 5 && (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-stone-200 text-[8px] font-medium text-stone-500">
                          +{members.length - 5}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Explanation */}
          <div
            className="card-enter mt-6 rounded-2xl border border-forest/10 bg-forest/[0.02] p-6"
            style={{ animationDelay: "700ms" }}
          >
            <h4 className="font-display text-sm font-semibold text-forest">
              How Threads Work
            </h4>
            <div className="mt-3 space-y-2.5">
              {[
                {
                  title: "Manual creation",
                  desc: "Managers and HR can draw threads between people to capture known working relationships.",
                },
                {
                  title: "Auto-discovery",
                  desc: "Threads are automatically created from chat interactions, code reviews, calendar overlap, and feedback exchanges.",
                },
                {
                  title: "Organic strength",
                  desc: "Thread strength updates over time — active collaboration strengthens connections, inactivity lets them fade.",
                },
              ].map((item, i) => (
                <div key={i} className="flex gap-2.5">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-forest/40" />
                  <div>
                    <p className="text-xs font-medium text-stone-700">{item.title}</p>
                    <p className="text-xs leading-relaxed text-stone-500">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>}
    </div>
  );
}
