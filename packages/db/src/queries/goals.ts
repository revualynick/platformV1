import { eq, and, or, desc, inArray } from "drizzle-orm";
import {
  computeEffectiveProgress,
  computeAlignment,
  type GoalStatus,
} from "@revualy/shared";
import {
  goals,
  goalCycles,
  goalUpdates,
  goalUpdateSuggestions,
  checkInMeetings,
  users,
  teams,
} from "../schema/tenant.js";
import type { TenantDb } from "../tenant.js";
import { getReportingTree } from "./manager.js";

type GoalRow = typeof goals.$inferSelect;

/** Drizzle types status as string; the CHECK constraint guarantees GoalStatus. */
function asStatused(rows: GoalRow[]) {
  return rows.map((r) => ({ ...r, status: r.status as GoalStatus }));
}

export async function getGoalCycles(db: TenantDb) {
  return db.select().from(goalCycles).orderBy(desc(goalCycles.startDate));
}

/**
 * The cycle containing today (latest startDate wins on overlap),
 * falling back to the most recent cycle. No isActive flag to maintain.
 */
export async function getCurrentCycle(db: TenantDb, today?: string) {
  const cycles = await getGoalCycles(db);
  if (cycles.length === 0) return null;
  const now = today ?? new Date().toISOString().slice(0, 10);
  const containing = cycles.find((c) => c.startDate <= now && c.endDate >= now);
  return containing ?? cycles[0];
}

async function getOwnerNames(db: TenantDb, ownerIds: string[]) {
  if (ownerIds.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, [...new Set(ownerIds)]));
  return new Map(rows.map((r) => [r.id, r.name]));
}

export interface LadderNode {
  goal: GoalRow;
  ownerName: string;
  effectiveProgress: number;
  alignmentPercent: number | null;
  children: LadderNode[];
}

/**
 * Org → team → individual tree for one cycle with informational
 * alignment aggregates. Personal goals are excluded in SQL, never
 * filtered in memory, so they cannot leak into the ladder.
 */
export async function getGoalLadder(
  db: TenantDb,
  cycleId: string,
): Promise<LadderNode[]> {
  const rows = await db
    .select()
    .from(goals)
    .where(
      and(
        eq(goals.cycleId, cycleId),
        inArray(goals.level, ["org", "team", "individual"]),
      ),
    )
    .orderBy(goals.createdAt);

  const names = await getOwnerNames(db, rows.map((g) => g.ownerId));

  const nodes = new Map<string, LadderNode>(
    rows.map((g) => [
      g.id,
      {
        goal: g,
        ownerName: names.get(g.ownerId) ?? "Unknown",
        effectiveProgress: computeEffectiveProgress(g),
        alignmentPercent: null,
        children: [],
      },
    ]),
  );

  const roots: LadderNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.goal.parentGoalId
      ? nodes.get(node.goal.parentGoalId)
      : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  for (const node of nodes.values()) {
    if (node.children.length > 0) {
      node.alignmentPercent = computeAlignment(
        asStatused(node.children.map((c) => c.goal)),
      );
    }
  }

  return roots;
}

/** A user's own goals: individual (optionally per cycle) + all personal. */
export async function getMyGoals(
  db: TenantDb,
  userId: string,
  cycleId?: string,
) {
  const individualConditions = [
    eq(goals.level, "individual"),
    eq(goals.ownerId, userId),
  ];
  if (cycleId) individualConditions.push(eq(goals.cycleId, cycleId));

  const rows = await db
    .select()
    .from(goals)
    .where(
      or(
        and(...individualConditions),
        and(eq(goals.level, "personal"), eq(goals.ownerId, userId)),
      ),
    )
    .orderBy(desc(goals.createdAt));

  const parentIds = rows
    .map((g) => g.parentGoalId)
    .filter((id): id is string => id !== null);
  const parentTitles = new Map<string, string>();
  if (parentIds.length > 0) {
    const parents = await db
      .select({ id: goals.id, title: goals.title })
      .from(goals)
      .where(inArray(goals.id, parentIds));
    for (const p of parents) parentTitles.set(p.id, p.title);
  }

  return rows.map((g) => ({
    ...g,
    effectiveProgress: computeEffectiveProgress(g),
    parentTitle: g.parentGoalId
      ? (parentTitles.get(g.parentGoalId) ?? null)
      : null,
  }));
}

/**
 * Everything a manager's team-goals page needs:
 * - team goals for teams they manage
 * - reports' individual goals (grouped by the caller)
 * - reports' personal goals ONLY where shareWithManager — the sharing
 *   filter lives here in SQL so unshared personal goals never leave
 *   the database for this view.
 */
export async function getManagerGoalView(db: TenantDb, managerId: string) {
  const ownedTeams = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.managerId, managerId));

  const tree = await getReportingTree(db, managerId);
  const reportIds = [...tree].filter((id) => id !== managerId);

  const [teamGoals, individualGoals, sharedPersonalGoals] = await Promise.all([
    ownedTeams.length > 0
      ? db
          .select()
          .from(goals)
          .where(
            and(
              eq(goals.level, "team"),
              inArray(
                goals.teamId,
                ownedTeams.map((t) => t.id),
              ),
            ),
          )
          .orderBy(desc(goals.createdAt))
      : Promise.resolve([] as GoalRow[]),
    reportIds.length > 0
      ? db
          .select()
          .from(goals)
          .where(
            and(
              eq(goals.level, "individual"),
              inArray(goals.ownerId, reportIds),
            ),
          )
          .orderBy(desc(goals.createdAt))
      : Promise.resolve([] as GoalRow[]),
    reportIds.length > 0
      ? db
          .select()
          .from(goals)
          .where(
            and(
              eq(goals.level, "personal"),
              inArray(goals.ownerId, reportIds),
              eq(goals.shareWithManager, true),
            ),
          )
          .orderBy(desc(goals.createdAt))
      : Promise.resolve([] as GoalRow[]),
  ]);

  const names = await getOwnerNames(db, [
    ...individualGoals.map((g) => g.ownerId),
    ...sharedPersonalGoals.map((g) => g.ownerId),
  ]);

  const withProgress = (g: GoalRow) => ({
    ...g,
    effectiveProgress: computeEffectiveProgress(g),
    ownerName: names.get(g.ownerId) ?? "Unknown",
  });

  return {
    ownedTeams,
    teamGoals: teamGoals.map((g) => ({
      ...withProgress(g),
      alignmentPercent: computeAlignment(
        asStatused(individualGoals.filter((c) => c.parentGoalId === g.id)),
      ),
    })),
    individualGoals: individualGoals.map(withProgress),
    sharedPersonalGoals: sharedPersonalGoals.map(withProgress),
  };
}

/** Org goals for a cycle with team-goal children and alignment. */
export async function getOrgGoalsWithAlignment(db: TenantDb, cycleId: string) {
  const orgGoals = await db
    .select()
    .from(goals)
    .where(and(eq(goals.level, "org"), eq(goals.cycleId, cycleId)))
    .orderBy(goals.createdAt);

  const childTeamGoals =
    orgGoals.length > 0
      ? await db
          .select()
          .from(goals)
          .where(
            and(
              eq(goals.level, "team"),
              inArray(
                goals.parentGoalId,
                orgGoals.map((g) => g.id),
              ),
            ),
          )
      : [];

  return orgGoals.map((g) => ({
    ...g,
    effectiveProgress: computeEffectiveProgress(g),
    alignmentPercent: computeAlignment(
      asStatused(childTeamGoals.filter((c) => c.parentGoalId === g.id)),
    ),
    childTeamGoals: childTeamGoals
      .filter((c) => c.parentGoalId === g.id)
      .map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        effectiveProgress: computeEffectiveProgress(c),
      })),
  }));
}

/**
 * Goal detail with children and recent updates. Personal goals the
 * viewer cannot see return null — the privacy check lives here because
 * web server components call this directly, bypassing the API.
 */
export async function getGoalDetails(
  db: TenantDb,
  goalId: string,
  viewerId: string,
) {
  const [goal] = await db.select().from(goals).where(eq(goals.id, goalId));
  if (!goal) return null;

  if (goal.level === "personal" && goal.ownerId !== viewerId) {
    if (!goal.shareWithManager) return null;
    const tree = await getReportingTree(db, viewerId);
    if (!tree.has(goal.ownerId)) return null;
  }

  const [children, updates] = await Promise.all([
    db
      .select()
      .from(goals)
      .where(eq(goals.parentGoalId, goalId))
      .orderBy(goals.createdAt),
    db
      .select()
      .from(goalUpdates)
      .where(eq(goalUpdates.goalId, goalId))
      .orderBy(desc(goalUpdates.createdAt))
      .limit(10),
  ]);

  return {
    ...goal,
    effectiveProgress: computeEffectiveProgress(goal),
    alignmentPercent: computeAlignment(asStatused(children)),
    children: children.map((c) => ({
      ...c,
      effectiveProgress: computeEffectiveProgress(c),
    })),
    updates,
  };
}

/** Team goals available to ladder an individual goal to. */
export async function getTeamGoalsForCycle(
  db: TenantDb,
  cycleId: string,
  teamId?: string | null,
) {
  const conditions = [eq(goals.level, "team"), eq(goals.cycleId, cycleId)];
  if (teamId) conditions.push(eq(goals.teamId, teamId));
  return db
    .select({ id: goals.id, title: goals.title, teamId: goals.teamId })
    .from(goals)
    .where(and(...conditions))
    .orderBy(goals.createdAt);
}

/** Org goals available to ladder a team goal to. */
export async function getOrgGoalsForCycle(db: TenantDb, cycleId: string) {
  return db
    .select({ id: goals.id, title: goals.title })
    .from(goals)
    .where(and(eq(goals.level, "org"), eq(goals.cycleId, cycleId)))
    .orderBy(goals.createdAt);
}

/**
 * Pending transcript suggestions for a set of goals the caller has
 * already privacy-filtered (pages fetch goals first, then decorate
 * with suggestions). Includes meeting title/date for the review UI.
 */
export async function getPendingSuggestionsForGoals(
  db: TenantDb,
  goalIds: string[],
) {
  if (goalIds.length === 0)
    return new Map<
      string,
      Array<{
        id: string;
        goalId: string;
        suggestedProgressPercent: number | null;
        suggestedStatus: string | null;
        suggestedMetricCurrentValue: number | null;
        suggestedNote: string;
        evidenceQuote: string;
        meetingTitle: string;
        meetingDate: Date;
      }>
    >();

  const rows = await db
    .select({
      id: goalUpdateSuggestions.id,
      goalId: goalUpdateSuggestions.goalId,
      suggestedProgressPercent: goalUpdateSuggestions.suggestedProgressPercent,
      suggestedStatus: goalUpdateSuggestions.suggestedStatus,
      suggestedMetricCurrentValue:
        goalUpdateSuggestions.suggestedMetricCurrentValue,
      suggestedNote: goalUpdateSuggestions.suggestedNote,
      evidenceQuote: goalUpdateSuggestions.evidenceQuote,
      meetingTitle: checkInMeetings.title,
      meetingDate: checkInMeetings.eventStart,
    })
    .from(goalUpdateSuggestions)
    .innerJoin(
      checkInMeetings,
      eq(goalUpdateSuggestions.meetingId, checkInMeetings.id),
    )
    .where(
      and(
        inArray(goalUpdateSuggestions.goalId, goalIds),
        eq(goalUpdateSuggestions.status, "pending"),
      ),
    )
    .orderBy(desc(goalUpdateSuggestions.createdAt));

  const byGoal = new Map<string, typeof rows>();
  for (const row of rows) {
    byGoal.set(row.goalId, [...(byGoal.get(row.goalId) ?? []), row]);
  }
  return byGoal;
}
