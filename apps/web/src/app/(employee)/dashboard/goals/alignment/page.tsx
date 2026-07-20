import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getGoalLadder, getCurrentCycle } from "@revualy/db/queries";
import { isDemoSession } from "@/lib/session-utils";
import { mockGoalLadder, mockGoalCycle } from "@/lib/mock-data";
import { LadderTree, type LadderTreeNode } from "@/components/goals/ladder-tree";
import { EmptyState } from "@/components/empty-state";
import { DataUnavailable } from "@/components/data-unavailable";
import { logPageError } from "@/lib/page-errors";

export const dynamic = "force-dynamic";

async function AlignmentContent({ isDemo }: { isDemo: boolean }) {
  let nodes: LadderTreeNode[] = isDemo ? (mockGoalLadder as LadderTreeNode[]) : [];
  let cycleName = isDemo ? mockGoalCycle.name : null;
  let loadFailed = false;

  if (!isDemo) {
    try {
      const db = getDb();
      const cycle = await getCurrentCycle(db);
      if (cycle) {
        cycleName = cycle.name;
        nodes = (await getGoalLadder(db, cycle.id)) as LadderTreeNode[];
      }
    } catch (err) {
      logPageError("goals-alignment", err);
      loadFailed = true;
    }
  }

  if (loadFailed && !isDemo) {
    return <DataUnavailable what="the goal ladder" />;
  }

  if (nodes.length === 0) {
    return (
      <EmptyState
        icon="◍"
        title="Nothing to align yet"
        description="Once org and team goals exist for the current cycle, the full ladder shows up here."
      />
    );
  }

  return (
    <div
      className="rounded-2xl border border-stone-200/60 bg-surface p-6"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      {cycleName && (
        <p className="mb-4 text-xs font-medium uppercase tracking-wider text-stone-400">
          {cycleName}
        </p>
      )}
      <LadderTree nodes={nodes} />
    </div>
  );
}

export default async function AlignmentPage() {
  const session = await auth();
  const isDemo = process.env.DEMO_MODE === "true" && (!session || isDemoSession(session));
  if (!session?.user?.id && !isDemo) redirect("/login");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-stone-900">
            Goal Alignment
          </h1>
          <p className="text-sm text-stone-500">
            How individual work ladders up to team and org goals. Personal goals
            never appear here.
          </p>
        </div>
        <Link
          href="/dashboard/goals"
          className="text-sm font-medium text-forest hover:text-forest-light"
        >
          ← My goals
        </Link>
      </div>
      <Suspense
        fallback={
          <div className="h-64 animate-pulse rounded-2xl border border-stone-200/60 bg-stone-100" />
        }
      >
        <AlignmentContent isDemo={isDemo} />
      </Suspense>
    </div>
  );
}
