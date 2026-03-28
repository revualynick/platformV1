import { eq, and, or, desc, inArray } from "drizzle-orm";
import {
  notificationPreferences,
  kudos,
  users,
  conversations,
  conversationMessages,
  escalations,
  escalationNotes,
  campaigns,
  questionnaires,
  questionnaireThemes,
} from "../schema/tenant.js";
import type { TenantDb } from "../tenant.js";

// ── Notification Preferences ────────────────────────

const NOTIFICATION_TYPES = [
  "weekly_digest",
  "flag_alert",
  "nudge",
  "leaderboard_update",
] as const;

export async function getNotificationPreferences(
  db: TenantDb,
  userId: string,
) {
  const prefs = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));

  const prefMap = new Map(prefs.map((p) => [p.type, p]));
  return NOTIFICATION_TYPES.map((type) => {
    const existing = prefMap.get(type);
    return (
      existing ?? {
        id: null,
        userId,
        type,
        enabled: true,
        channel: "email",
        createdAt: null,
        updatedAt: null,
      }
    );
  });
}

// ── Kudos ──────────────────────────────────────────

export async function getKudosForUser(db: TenantDb, userId: string) {
  const rows = await db
    .select()
    .from(kudos)
    .where(or(eq(kudos.giverId, userId), eq(kudos.receiverId, userId)))
    .orderBy(desc(kudos.createdAt))
    .limit(100);

  const userIds = new Set<string>();
  rows.forEach((k) => {
    userIds.add(k.giverId);
    userIds.add(k.receiverId);
  });

  const nameMap = new Map<string, string>();
  if (userIds.size > 0) {
    const userRows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, [...userIds]));
    userRows.forEach((u) => nameMap.set(u.id, u.name));
  }

  return rows.map((k) => ({
    ...k,
    giverName: nameMap.get(k.giverId) ?? "Unknown",
    receiverName: nameMap.get(k.receiverId) ?? "Unknown",
  }));
}

// ── Conversations ──────────────────────────────────

export async function getConversations(
  db: TenantDb,
  opts?: { status?: string; limit?: number },
) {
  const safeLimit = Math.min(opts?.limit ?? 20, 200);
  let query = db.select().from(conversations);

  if (opts?.status) {
    query = query.where(eq(conversations.status, opts.status)) as typeof query;
  }

  return query
    .orderBy(desc(conversations.createdAt))
    .limit(safeLimit);
}

export async function getConversationWithMessages(
  db: TenantDb,
  id: string,
) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));

  if (!conversation) return null;

  const messages = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, id))
    .orderBy(conversationMessages.createdAt);

  return { ...conversation, messages };
}

// ── Escalations ────────────────────────────────────

export async function getEscalations(
  db: TenantDb,
  opts?: { status?: string; severity?: string },
) {
  const conditions = [];
  if (opts?.status) conditions.push(eq(escalations.status, opts.status));
  if (opts?.severity) conditions.push(eq(escalations.severity, opts.severity));

  // Alias users table for two separate joins (reporter + subject)
  const reporterUsers = db
    .select({ id: users.id, name: users.name })
    .from(users)
    .as("reporter_users");
  const subjectUsers = db
    .select({ id: users.id, name: users.name })
    .from(users)
    .as("subject_users");

  const rows = await db
    .select({
      escalation: escalations,
      reporterName: reporterUsers.name,
      subjectName: subjectUsers.name,
    })
    .from(escalations)
    .leftJoin(reporterUsers, eq(escalations.reporterId, reporterUsers.id))
    .leftJoin(subjectUsers, eq(escalations.subjectId, subjectUsers.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(escalations.createdAt))
    .limit(100);

  return rows.map((r) => ({
    ...r.escalation,
    reporterName: r.reporterName,
    subjectName: r.subjectName,
  }));
}

export async function getEscalationDetail(db: TenantDb, id: string) {
  const [row] = await db
    .select()
    .from(escalations)
    .where(eq(escalations.id, id));

  if (!row) return null;

  const notes = await db
    .select()
    .from(escalationNotes)
    .where(eq(escalationNotes.escalationId, id))
    .orderBy(escalationNotes.createdAt);

  return { ...row, notes };
}

// ── Campaigns ──────────────────────────────────────

export async function getCampaigns(db: TenantDb) {
  const allCampaigns = await db.select().from(campaigns).limit(100);

  if (allCampaigns.length === 0) return [];

  const questionnaireIds = [
    ...new Set(
      allCampaigns
        .map((c) => c.questionnaireId)
        .filter((id): id is string => id !== null),
    ),
  ];

  const questionnairesMap = new Map<string, { id: string; name: string }>();
  let allThemes: Array<typeof questionnaireThemes.$inferSelect> = [];

  if (questionnaireIds.length > 0) {
    const qRows = await db
      .select({ id: questionnaires.id, name: questionnaires.name })
      .from(questionnaires)
      .where(inArray(questionnaires.id, questionnaireIds));

    for (const q of qRows) {
      questionnairesMap.set(q.id, q);
    }

    allThemes = await db
      .select()
      .from(questionnaireThemes)
      .where(inArray(questionnaireThemes.questionnaireId, questionnaireIds))
      .orderBy(questionnaireThemes.sortOrder);
  }

  const themesMap = new Map<string, typeof allThemes>();
  for (const t of allThemes) {
    const list = themesMap.get(t.questionnaireId) ?? [];
    list.push(t);
    themesMap.set(t.questionnaireId, list);
  }

  return allCampaigns.map((c) => ({
    ...c,
    questionnaire:
      c.questionnaireId && questionnairesMap.has(c.questionnaireId)
        ? {
            ...questionnairesMap.get(c.questionnaireId)!,
            themes: themesMap.get(c.questionnaireId) ?? [],
          }
        : null,
  }));
}

export async function getCampaignById(db: TenantDb, id: string) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, id));

  if (!campaign) return null;

  let questionnaire = null;
  if (campaign.questionnaireId) {
    const [q] = await db
      .select()
      .from(questionnaires)
      .where(eq(questionnaires.id, campaign.questionnaireId));

    if (q) {
      const themes = await db
        .select()
        .from(questionnaireThemes)
        .where(eq(questionnaireThemes.questionnaireId, q.id))
        .orderBy(questionnaireThemes.sortOrder);

      questionnaire = { ...q, themes };
    }
  }

  return { ...campaign, questionnaire };
}

// ── Questionnaires (admin) ─────────────────────────

export async function getQuestionnairesWithThemes(db: TenantDb) {
  const allQ = await db.select().from(questionnaires);
  const allThemes = await db
    .select()
    .from(questionnaireThemes)
    .orderBy(questionnaireThemes.sortOrder);

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

// ── Org graph (admin full, user-centered) ──────────

export async function getFullOrgGraph(db: TenantDb) {
  const { users: usersTable, teams: teamsTable, userRelationships: relsTable } = await import("../schema/tenant.js");

  const [allUsers, allTeams, allRelationships] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.isActive, true)),
    db.select().from(teamsTable),
    db
      .select()
      .from(relsTable)
      .where(eq(relsTable.isActive, true)),
  ]);

  const teamMap = new Map(allTeams.map((t) => [t.id, t.name]));

  const nodes = allUsers.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    team: u.teamId ? teamMap.get(u.teamId) ?? null : null,
    managerId: u.managerId,
  }));

  const reportingEdges = allUsers
    .filter((u) => u.managerId)
    .map((u) => ({
      id: `report-${u.managerId}-${u.id}`,
      from: u.managerId!,
      to: u.id,
      type: "reports_to" as const,
      label: "Reports to",
      tags: [] as string[],
      strength: 1,
      source: "manual" as const,
    }));

  const threadEdges = allRelationships.map((r) => ({
    id: r.id,
    from: r.fromUserId,
    to: r.toUserId,
    type: "thread" as const,
    label: r.label,
    tags: r.tags,
    strength: r.strength,
    source: r.source as "manual" | "calendar" | "chat",
  }));

  return {
    nodes,
    edges: [...reportingEdges, ...threadEdges],
  };
}
