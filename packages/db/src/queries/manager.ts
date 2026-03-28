import { eq, and, or, isNull, inArray } from "drizzle-orm";
import {
  users,
  teams,
  questionnaires,
  questionnaireThemes,
  userRelationships,
  managerNotes,
  feedbackDigests,
} from "../schema/tenant.js";
import type { TenantDb } from "../tenant.js";

/**
 * BFS from a manager through users.managerId to find all direct/indirect reports.
 */
export async function getReportingTree(
  db: TenantDb,
  managerId: string,
): Promise<Set<string>> {
  const allUsers = await db
    .select({ id: users.id, managerId: users.managerId })
    .from(users)
    .where(eq(users.isActive, true));

  const childrenOf = new Map<string, string[]>();
  for (const u of allUsers) {
    if (u.managerId) {
      const list = childrenOf.get(u.managerId) ?? [];
      list.push(u.id);
      childrenOf.set(u.managerId, list);
    }
  }

  const tree = new Set<string>([managerId]);
  const queue = [managerId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const reports = childrenOf.get(current) ?? [];
    for (const reportId of reports) {
      if (!tree.has(reportId)) {
        tree.add(reportId);
        queue.push(reportId);
      }
    }
  }

  return tree;
}

export async function getManagerQuestionnaires(
  db: TenantDb,
  userId: string,
  teamId: string | null,
) {
  const allQ = await db
    .select()
    .from(questionnaires)
    .where(
      or(
        eq(questionnaires.createdByUserId, userId),
        teamId ? eq(questionnaires.teamScope, teamId) : undefined,
        isNull(questionnaires.teamScope),
      ),
    );

  const qIds = allQ.map((q) => q.id);
  let allThemes: Array<typeof questionnaireThemes.$inferSelect> = [];
  if (qIds.length > 0) {
    allThemes = await db
      .select()
      .from(questionnaireThemes)
      .where(inArray(questionnaireThemes.questionnaireId, qIds))
      .orderBy(questionnaireThemes.sortOrder);
  }

  const themesByQ = new Map<string, typeof allThemes>();
  allThemes.forEach((t) => {
    const list = themesByQ.get(t.questionnaireId) ?? [];
    list.push(t);
    themesByQ.set(t.questionnaireId, list);
  });

  return allQ.map((q) => ({
    ...q,
    themes: themesByQ.get(q.id) ?? [],
  }));
}

export async function getManagerNotes(
  db: TenantDb,
  managerId: string,
  subjectId: string,
) {
  return db
    .select()
    .from(managerNotes)
    .where(
      and(
        eq(managerNotes.managerId, managerId),
        eq(managerNotes.subjectId, subjectId),
      ),
    )
    .orderBy(managerNotes.createdAt);
}

export async function getTeamInsightDigests(
  db: TenantDb,
  managerId: string,
) {
  return db
    .select()
    .from(feedbackDigests)
    .where(eq(feedbackDigests.managerId, managerId))
    .orderBy(feedbackDigests.monthStarting);
}

export async function getTeamInsightMonth(
  db: TenantDb,
  managerId: string,
  monthStarting: string,
) {
  const [digest] = await db
    .select()
    .from(feedbackDigests)
    .where(
      and(
        eq(feedbackDigests.managerId, managerId),
        eq(feedbackDigests.monthStarting, monthStarting),
      ),
    );
  return digest ?? null;
}

export async function getOrgChartForManager(
  db: TenantDb,
  managerId: string,
) {
  const tree = await getReportingTree(db, managerId);

  const treeUsers = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      teamId: users.teamId,
      managerId: users.managerId,
    })
    .from(users)
    .where(inArray(users.id, [...tree]));

  const teamIds = [
    ...new Set(treeUsers.map((u) => u.teamId).filter(Boolean)),
  ] as string[];
  let teamMap = new Map<string, string>();
  if (teamIds.length > 0) {
    const teamRows = await db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(inArray(teams.id, teamIds));
    teamMap = new Map(teamRows.map((t) => [t.id, t.name]));
  }

  const nodes = treeUsers.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    team: u.teamId ? teamMap.get(u.teamId) ?? null : null,
    managerId: u.managerId,
  }));

  type Edge = {
    id: string;
    from: string;
    to: string;
    type: "reports_to" | "thread";
    label: string;
    tags: string[];
    strength: number;
    source: string;
  };

  const edges: Edge[] = [];

  for (const u of treeUsers) {
    if (u.managerId && tree.has(u.managerId)) {
      edges.push({
        id: `report-${u.id}`,
        from: u.id,
        to: u.managerId,
        type: "reports_to",
        label: "Reports to",
        tags: [],
        strength: 1,
        source: "hierarchy",
      });
    }
  }

  const rels = await db
    .select()
    .from(userRelationships)
    .where(eq(userRelationships.isActive, true));

  for (const rel of rels) {
    if (tree.has(rel.fromUserId) && tree.has(rel.toUserId)) {
      edges.push({
        id: rel.id,
        from: rel.fromUserId,
        to: rel.toUserId,
        type: "thread",
        label: rel.label,
        tags: rel.tags as string[],
        strength: rel.strength,
        source: rel.source,
      });
    }
  }

  return { nodes, edges };
}
