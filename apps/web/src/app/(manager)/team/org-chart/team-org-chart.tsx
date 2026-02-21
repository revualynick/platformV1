"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { threadTagColors } from "@/lib/mock-data";
import type { OrgRole } from "@/lib/mock-data";

// --- Types ---
interface TeamPerson {
  id: string;
  name: string;
  role: OrgRole;
  title: string;
  team: string;
  reportsTo: string | null;
}

interface TeamThread {
  id: string;
  from: string;
  to: string;
  tags: string[];
  strength: number;
  label: string;
}

interface TeamOrgChartProps {
  people: TeamPerson[];
  threads: TeamThread[];
  managerId: string;
}

// --- Layout constants ---
const CANVAS_W = 1100;
const MIN_CANVAS_H = 420;
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

// --- Auto-layout: manager centered at top, reports spread below ---
function computeAutoPositions(
  people: TeamPerson[],
  managerId: string,
): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  const reports = people.filter((p) => p.reportsTo === managerId);

  // Manager centered at top
  pos[managerId] = { x: CANVAS_W / 2 - NODE_W / 2, y: 40 };

  // Reports spread evenly below with staggered y
  const count = reports.length;
  if (count === 0) return pos;

  const spacing = Math.max(120, Math.min(170, (CANVAS_W - 100) / count));
  const totalWidth = (count - 1) * spacing;
  const startX = CANVAS_W / 2 - totalWidth / 2 - NODE_W / 2;
  const baseY = 200;

  reports
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach((person, i) => {
      pos[person.id] = {
        x: Math.max(10, Math.min(CANVAS_W - NODE_W - 10, startX + i * spacing)),
        y: baseY + (i % 2 === 1 ? 70 : 0),
      };
    });

  return pos;
}

// --- Geometry helpers (same as admin page) ---
function getEdgeAnchor(
  nodePos: { x: number; y: number },
  targetPos: { x: number; y: number },
): { x: number; y: number } {
  const nc = { x: nodePos.x + NODE_W / 2, y: nodePos.y + NODE_H / 2 };
  const tc = { x: targetPos.x + NODE_W / 2, y: targetPos.y + NODE_H / 2 };
  const dx = tc.x - nc.x;
  const dy = tc.y - nc.y;
  if (Math.abs(dx) * (NODE_H / NODE_W) > Math.abs(dy)) {
    if (dx > 0) return { x: nodePos.x + NODE_W, y: nodePos.y + NODE_H / 2 };
    return { x: nodePos.x, y: nodePos.y + NODE_H / 2 };
  }
  if (dy > 0) return { x: nodePos.x + NODE_W / 2, y: nodePos.y + NODE_H };
  return { x: nodePos.x + NODE_W / 2, y: nodePos.y };
}

function threadPath(x1: number, y1: number, x2: number, y2: number): string {
  const midY = (y1 + y2) / 2;
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  if (dy < 60) {
    const curveY = Math.min(y1, y2) - 30 - dx * 0.1;
    return `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${curveY}, ${x2} ${y2}`;
  }
  const cpOffset = dx * 0.15 + 20;
  return `M ${x1} ${y1} C ${x1 + cpOffset} ${midY}, ${x2 - cpOffset} ${midY}, ${x2} ${y2}`;
}

function reportingPath(x1: number, y1: number, x2: number, y2: number): string {
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

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

function rebalanceChildren(
  pos: Record<string, { x: number; y: number }>,
  parentId: string,
  people: TeamPerson[],
): Record<string, { x: number; y: number }> {
  const result = { ...pos };
  const children = people
    .filter((p) => p.reportsTo === parentId)
    .sort((a, b) => (result[a.id]?.x ?? 0) - (result[b.id]?.x ?? 0));
  if (children.length === 0) return result;

  const parentCenter = result[parentId].x + NODE_W / 2;
  const parentY = result[parentId].y;
  const spacing = Math.max(120, Math.min(170, (CANVAS_W - 100) / children.length));
  const totalWidth = (children.length - 1) * spacing;
  const startX = parentCenter - totalWidth / 2 - NODE_W / 2;
  const childBaseY = parentY + 160;

  children.forEach((child, i) => {
    result[child.id] = {
      x: Math.max(10, Math.min(CANVAS_W - NODE_W - 10, startX + i * spacing)),
      y: childBaseY + (i % 2 === 1 ? 70 : 0),
    };
  });

  return result;
}

// --- Component ---
export function TeamOrgChart({ people, threads, managerId }: TeamOrgChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const initialPositions = useMemo(
    () => computeAutoPositions(people, managerId),
    [people, managerId],
  );
  const [positions, setPositions] = useState(initialPositions);
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

  const canvasH = Math.max(
    MIN_CANVAS_H,
    Math.max(...Object.values(positions).map((p) => p.y)) + NODE_H + 40,
  );

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
    setPositions((prev) => rebalanceChildren(prev, drag.id, people));
    setDrag(null);
  }, [drag, people]);

  const activeThreads = highlightedPerson
    ? threads.filter(
        (t) => t.from === highlightedPerson || t.to === highlightedPerson,
      )
    : threads;

  const allTags = [...new Set(threads.flatMap((t) => t.tags))].sort();

  return (
    <>
      {/* Actions */}
      <div className="card-enter mb-4 flex flex-wrap items-center gap-3" style={{ animationDelay: "250ms" }}>
        <button
          onClick={() => setPositions(initialPositions)}
          className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
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
              : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50"
          }`}
        >
          {showThreads ? "Threads On" : "Threads Off"}
        </button>
        {(hoveredPerson || selectedPerson) && (
          <button
            onClick={() => {
              setHoveredPerson(null);
              setSelectedPerson(null);
              setEditingThread(null);
            }}
            className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-xs font-medium text-stone-500 hover:bg-stone-50"
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
              className="flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-medium text-stone-600"
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
        className="card-enter relative rounded-2xl border border-stone-200/60 bg-white"
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
            onClick={() => {
              if (!drag) {
                setSelectedPerson(null);
                setEditingThread(null);
              }
            }}
            onMouseMove={handleDragMove}
            onMouseUp={handleDragEnd}
            onMouseLeave={handleDragEnd}
          >
            {/* Reporting lines (solid black) with anchor dots */}
            {people
              .filter((p) => p.reportsTo && positions[p.reportsTo])
              .map((p) => {
                const from = positions[p.reportsTo!];
                const to = positions[p.id];
                if (!from || !to) return null;
                const dimmed =
                  highlightedPerson !== null &&
                  highlightedPerson !== p.id &&
                  highlightedPerson !== p.reportsTo;
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
                    <circle cx={x1} cy={y1} r={3} fill="white" stroke="#292524" strokeWidth={1.5} opacity={op} />
                    <circle cx={x2} cy={y2} r={3} fill="white" stroke="#292524" strokeWidth={1.5} opacity={op} />
                  </g>
                );
              })}

            {/* Thread lines (dashed, colored bezier curves with edge anchors + midpoint nodes) */}
            {showThreads && threads.map((thread) => {
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
                    onMouseEnter={() => {
                      if (!drag) setSelectedThread(thread.id);
                    }}
                    onMouseLeave={() => {
                      if (!drag) setSelectedThread(null);
                    }}
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
                    onMouseEnter={() => {
                      if (!drag) setSelectedThread(thread.id);
                    }}
                    onMouseLeave={() => {
                      if (!drag) setSelectedThread(null);
                    }}
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
                          ? thread.label.slice(0, 30) + "\u2026"
                          : thread.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Person nodes */}
            {people.map((person) => {
              const pos = positions[person.id];
              if (!pos) return null;

              const role = roleStyles[person.role];
              const personThreads = threads.filter(
                (t) => t.from === person.id || t.to === person.id,
              );
              const isHighlighted = highlightedPerson === person.id;
              const isDragging = drag?.id === person.id;
              const isDimmed =
                highlightedPerson !== null &&
                !isHighlighted &&
                !threads.some(
                  (t) =>
                    (t.from === highlightedPerson && t.to === person.id) ||
                    (t.to === highlightedPerson && t.from === person.id),
                ) &&
                person.reportsTo !== highlightedPerson &&
                !people.some(
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
                  onMouseEnter={() => {
                    if (!drag) setHoveredPerson(person.id);
                  }}
                  onMouseLeave={() => {
                    if (!drag) setHoveredPerson(null);
                  }}
                  onMouseDown={(e) => handleDragStart(person.id, e)}
                  onClick={(e) => {
                    if (drag) return;
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
                    opacity={
                      isDimmed
                        ? 0.3
                        : person.role === "senior" ||
                            person.role === "mid" ||
                            person.role === "junior"
                          ? 0.12
                          : 1
                    }
                  />
                  <text
                    x={pos.x + 22}
                    y={pos.y + NODE_H / 2 + 3.5}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={600}
                    fill={
                      person.role === "senior" ||
                      person.role === "mid" ||
                      person.role === "junior"
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
                  {showThreads && personThreads.length > 0 && (
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
                        {personThreads.length}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* HTML overlay: Person popover */}
        {selectedPerson &&
          !drag &&
          (() => {
            const person = people.find((p) => p.id === selectedPerson);
            if (!person) return null;
            const pos = positions[person.id];
            if (!pos) return null;
            const role = roleStyles[person.role];
            const personThreads = threads.filter(
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
                <div className="w-52 rounded-xl border border-stone-200 bg-white p-3.5 shadow-xl">
                  <div className="mb-2 flex items-center gap-2.5">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                      style={{ backgroundColor: role.fill }}
                    >
                      {person.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-stone-800">
                        {person.name}
                      </p>
                      <p className="text-[10px] text-stone-400">{person.title}</p>
                    </div>
                  </div>
                  <div className="mb-2.5 flex items-center gap-1.5 text-[10px] text-stone-400">
                    <span
                      className="rounded-full px-2 py-0.5 text-[9px] font-medium"
                      style={{
                        backgroundColor: role.fill + "14",
                        color: role.fill,
                      }}
                    >
                      {role.label}
                    </span>
                    <span>{person.team}</span>
                    <span>&middot;</span>
                    <span>{personThreads.length} threads</span>
                  </div>
                  {personThreads.length > 0 && (
                    <div className="space-y-1">
                      {personThreads.map((t) => {
                        const other = people.find(
                          (pp) =>
                            pp.id === (t.from === person.id ? t.to : t.from),
                        );
                        const color =
                          threadStrokeColors[t.tags[0]] ?? "#78716c";
                        return (
                          <div
                            key={t.id}
                            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[10px] text-stone-500 hover:bg-stone-50"
                          >
                            <span
                              className="inline-block h-px w-3"
                              style={{ borderTop: `2px dashed ${color}` }}
                            />
                            <span className="font-medium text-stone-600">
                              {other?.name.split(" ")[0]}
                            </span>
                            <span className="text-stone-300">&middot;</span>
                            <span>{t.tags[0]}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

        {/* HTML overlay: Thread edit panel */}
        {showThreads && editingThread &&
          !drag &&
          (() => {
            const thread = threads.find((t) => t.id === editingThread);
            if (!thread) return null;
            const { mid } = getThreadAnchors(
              thread.from,
              thread.to,
              positions,
            );
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
                <div
                  className="w-56 rounded-xl border bg-white p-3.5 shadow-xl"
                  style={{ borderColor: color + "40" }}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                      Thread Details
                    </span>
                    <button
                      onClick={() => setEditingThread(null)}
                      className="flex h-5 w-5 items-center justify-center rounded-md text-[10px] text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                    >
                      &#x2715;
                    </button>
                  </div>
                  <p className="mb-1.5 text-[11px] font-medium text-stone-700">
                    {people.find((p) => p.id === thread.from)?.name.split(" ")[0]}{" "}
                    &harr;{" "}
                    {people.find((p) => p.id === thread.to)?.name.split(" ")[0]}
                  </p>
                  <p className="mb-2 text-[10px] leading-relaxed text-stone-500">
                    {thread.label}
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
                  <div>
                    <span className="text-[9px] text-stone-400">Strength</span>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${thread.strength * 100}%`,
                            backgroundColor: color,
                          }}
                        />
                      </div>
                      <span className="text-[10px] tabular-nums text-stone-500">
                        {Math.round(thread.strength * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
      </div>

      {/* Thread list below canvas */}
      {showThreads && <div
        className="card-enter mt-6 rounded-2xl border border-stone-200/60 bg-white p-6"
        style={{ animationDelay: "500ms", boxShadow: "var(--shadow-sm)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-stone-800">
            {highlightedPerson
              ? `Threads \u2014 ${people.find((p) => p.id === highlightedPerson)?.name}`
              : "All Threads"}
          </h3>
          <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-medium text-stone-500">
            {activeThreads.length} connection{activeThreads.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="space-y-2.5">
          {activeThreads.map((thread) => {
            const fromPerson = people.find((p) => p.id === thread.from);
            const toPerson = people.find((p) => p.id === thread.to);
            if (!fromPerson || !toPerson) return null;
            const primaryColor = threadStrokeColors[thread.tags[0]] ?? "#78716c";

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
                    <svg
                      className="h-3 w-3 text-stone-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
                      />
                    </svg>
                    <span className="text-xs font-medium text-stone-700">
                      {toPerson.name.split(" ")[0]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">{thread.label}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {thread.tags.map((tag) => {
                      const tc = threadTagColors[tag] ?? {
                        bg: "bg-stone-100",
                        text: "text-stone-500",
                      };
                      return (
                        <span
                          key={tag}
                          className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${tc.bg} ${tc.text}`}
                        >
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
      </div>}
    </>
  );
}
