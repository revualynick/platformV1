import { InfoHint } from "@/components/info-hint";
import { GoalStatusBadge } from "./status-badge";
import { GoalProgressBar } from "./progress-bar";

export interface LadderTreeNode {
  goal: {
    id: string;
    level: string;
    title: string;
    status: string;
  };
  ownerName: string;
  effectiveProgress: number;
  alignmentPercent: number | null;
  children: LadderTreeNode[];
}

const LEVEL_LABELS: Record<string, string> = {
  org: "Org",
  team: "Team",
  individual: "Individual",
};

function LadderRow({ node, depth }: { node: LadderTreeNode; depth: number }) {
  return (
    <>
      <div
        className={`flex items-center gap-4 border-b border-stone-100 py-3 ${
          depth === 0 ? "" : ""
        }`}
        style={{ paddingLeft: `${depth * 28}px` }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {depth > 0 && <span className="text-stone-300">↳</span>}
            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-stone-400">
              {LEVEL_LABELS[node.goal.level] ?? node.goal.level}
            </span>
            <span
              className={`truncate ${
                depth === 0
                  ? "font-display text-sm font-semibold text-stone-900"
                  : "text-sm text-stone-700"
              }`}
            >
              {node.goal.title}
            </span>
            <GoalStatusBadge status={node.goal.status} />
          </div>
          <p className="mt-0.5 text-xs text-stone-400" style={{ paddingLeft: depth > 0 ? "20px" : 0 }}>
            {node.ownerName}
            {node.alignmentPercent !== null && (
              <span className="ml-2 text-forest-light">
                alignment {node.alignmentPercent}%
              </span>
            )}
          </p>
        </div>
        <div className="w-44 shrink-0">
          <GoalProgressBar
            percent={node.effectiveProgress}
            status={node.goal.status}
            alignmentPercent={node.alignmentPercent}
          />
        </div>
      </div>
      {node.children.map((child) => (
        <LadderRow key={child.goal.id} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

/** Indented org → team → individual alignment tree. Server-renderable. */
export function LadderTree({ nodes }: { nodes: LadderTreeNode[] }) {
  return (
    <div>
      <div className="flex items-center justify-end border-b border-stone-100 pb-2">
        <span className="inline-flex items-center text-[11px] font-medium uppercase tracking-wider text-stone-400">
          Alignment
          <InfoHint entry="alignment" />
        </span>
      </div>
      {nodes.map((node) => (
        <LadderRow key={node.goal.id} node={node} depth={0} />
      ))}
    </div>
  );
}
