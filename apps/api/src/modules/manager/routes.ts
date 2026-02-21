import type { FastifyPluginAsync } from "fastify";
import { eq, and, or, isNull, inArray } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import {
  users,
  questionnaires,
  questionnaireThemes,
  userRelationships,
  teams,
  managerNotes,
  feedbackEntries,
  feedbackDigests,
  feedbackValueScores,
  coreValues,
} from "@revualy/db";
import { requireRole, getAuthenticatedUserId } from "../../lib/rbac.js";
import {
  parseBody,
  idParamSchema,
  monthParamSchema,
  createQuestionnaireSchema,
  updateQuestionnaireSchema,
  createRelationshipSchema,
  createManagerNoteSchema,
  updateManagerNoteSchema,
  managerNoteQuerySchema,
} from "../../lib/validation.js";

/**
 * BFS from a manager through users.managerId to find all direct/indirect reports.
 * Loads all active users once and traverses in memory to avoid N+1 queries.
 */
async function getReportingTree(
  db: TenantDb,
  managerId: string,
): Promise<Set<string>> {
  // Single query: load all active users' id + managerId
  const allUsers = await db
    .select({ id: users.id, managerId: users.managerId })
    .from(users)
    .where(eq(users.isActive, true));

  // Build adjacency list: managerId → [reportIds]
  const childrenOf = new Map<string, string[]>();
  for (const u of allUsers) {
    if (u.managerId) {
      const list = childrenOf.get(u.managerId) ?? [];
      list.push(u.id);
      childrenOf.set(u.managerId, list);
    }
  }

  // BFS in memory
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

export const managerRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireRole("manager"));

  // ═══════════════════════════════════════════════════════
  // Manager questionnaires (question bank)
  // ═══════════════════════════════════════════════════════

  // GET /manager/questionnaires — My team's + org-wide questionnaires
  app.get("/questionnaires", async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);

    // Get manager's team
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const teamId = user?.teamId;

    // Fetch questionnaires: owned by this manager, scoped to their team, or org-wide
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

    // Fetch all themes for these questionnaires
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

    const result = allQ.map((q) => ({
      ...q,
      themes: themesByQ.get(q.id) ?? [],
    }));

    return reply.send({ data: result });
  });

  // POST /manager/questionnaires — Create a team-scoped questionnaire
  app.post("/questionnaires", async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const body = parseBody(createQuestionnaireSchema, request.body);

    // Get manager's team for scope
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    const [created] = await db
      .insert(questionnaires)
      .values({
        name: body.name,
        category: body.category,
        source: body.source ?? "custom",
        verbatim: body.verbatim ?? false,
        createdByUserId: userId,
        teamScope: user?.teamId ?? null,
      })
      .returning();

    // Insert themes if provided
    if (body.themes?.length) {
      await db.insert(questionnaireThemes).values(
        body.themes.map((t, i) => ({
          questionnaireId: created.id,
          intent: t.intent,
          dataGoal: t.dataGoal,
          examplePhrasings: t.examplePhrasings ?? [],
          coreValueId: t.coreValueId ?? null,
          sortOrder: i,
        })),
      );
    }

    const themes = await db
      .select()
      .from(questionnaireThemes)
      .where(eq(questionnaireThemes.questionnaireId, created.id))
      .orderBy(questionnaireThemes.sortOrder);

    return reply.code(201).send({ ...created, themes });
  });

  // PATCH /manager/questionnaires/:id — Update (only if owned by this manager)
  app.patch("/questionnaires/:id", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const body = parseBody(updateQuestionnaireSchema, request.body);

    // Ownership check
    const [existing] = await db
      .select()
      .from(questionnaires)
      .where(eq(questionnaires.id, id));

    if (!existing) return reply.code(404).send({ error: "Questionnaire not found" });
    if (existing.createdByUserId !== userId) {
      return reply.code(403).send({ error: "You can only edit questionnaires you created" });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.category !== undefined) updates.category = body.category;
    if (body.verbatim !== undefined) updates.verbatim = body.verbatim;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    const [updated] = await db
      .update(questionnaires)
      .set(updates)
      .where(eq(questionnaires.id, id))
      .returning();

    return reply.send(updated);
  });

  // ═══════════════════════════════════════════════════════
  // Org chart (reporting tree scoped to this manager)
  // ═══════════════════════════════════════════════════════

  // GET /manager/org-chart — Scoped reporting tree + relationships
  app.get("/org-chart", async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);

    // Get full reporting tree
    const tree = await getReportingTree(db, userId);

    // Fetch user details for tree members
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

    // Fetch team names
    const teamIds = [...new Set(treeUsers.map((u) => u.teamId).filter(Boolean))] as string[];
    let teamMap = new Map<string, string>();
    if (teamIds.length > 0) {
      const teamRows = await db
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(inArray(teams.id, teamIds));
      teamMap = new Map(teamRows.map((t) => [t.id, t.name]));
    }

    // Build nodes
    const nodes = treeUsers.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      team: u.teamId ? teamMap.get(u.teamId) ?? null : null,
      managerId: u.managerId,
    }));

    // Build edges: reporting lines + relationship threads within tree
    const edges: Array<{
      id: string;
      from: string;
      to: string;
      type: "reports_to" | "thread";
      label: string;
      tags: string[];
      strength: number;
      source: string;
    }> = [];

    // Reporting edges
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

    // Thread edges (only between tree members)
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

    return reply.send({ nodes, edges });
  });

  // ═══════════════════════════════════════════════════════
  // Manager-scoped relationships
  // ═══════════════════════════════════════════════════════

  // POST /manager/relationships — Create (both users must be in reporting tree)
  app.post("/relationships", async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const body = parseBody(createRelationshipSchema, request.body);

    const tree = await getReportingTree(db, userId);

    if (!tree.has(body.fromUserId) || !tree.has(body.toUserId)) {
      return reply.code(403).send({
        error: "Both users must be in your reporting tree",
      });
    }

    const [created] = await db
      .insert(userRelationships)
      .values({
        fromUserId: body.fromUserId,
        toUserId: body.toUserId,
        label: body.label ?? "",
        tags: body.tags ?? [],
        strength: body.strength ?? 0.5,
        source: body.source ?? "manual",
      })
      .returning();

    return reply.code(201).send(created);
  });

  // ═══════════════════════════════════════════════════════
  // Manager notes (private per-employee observations)
  // ═══════════════════════════════════════════════════════

  // GET /manager/notes?subjectId=X — List notes for an employee
  app.get("/notes", async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const query = parseBody(managerNoteQuerySchema, request.query);

    const notes = await db
      .select()
      .from(managerNotes)
      .where(
        and(
          eq(managerNotes.managerId, userId),
          eq(managerNotes.subjectId, query.subjectId),
        ),
      )
      .orderBy(managerNotes.createdAt);

    return reply.send({ data: notes });
  });

  // POST /manager/notes — Create a note (subject must be in reporting tree)
  app.post("/notes", async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const body = parseBody(createManagerNoteSchema, request.body);

    const tree = await getReportingTree(db, userId);
    if (!tree.has(body.subjectId)) {
      return reply.code(403).send({ error: "Employee is not in your reporting tree" });
    }

    const [created] = await db
      .insert(managerNotes)
      .values({
        managerId: userId,
        subjectId: body.subjectId,
        content: body.content,
      })
      .returning();

    return reply.code(201).send(created);
  });

  // PATCH /manager/notes/:id — Update note content (ownership check)
  app.patch("/notes/:id", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const body = parseBody(updateManagerNoteSchema, request.body);

    const [existing] = await db
      .select()
      .from(managerNotes)
      .where(eq(managerNotes.id, id));

    if (!existing) return reply.code(404).send({ error: "Note not found" });
    if (existing.managerId !== userId) {
      return reply.code(403).send({ error: "You can only edit your own notes" });
    }

    const [updated] = await db
      .update(managerNotes)
      .set({ content: body.content, updatedAt: new Date() })
      .where(eq(managerNotes.id, id))
      .returning();

    return reply.send(updated);
  });

  // DELETE /manager/notes/:id — Delete note (ownership check)
  app.delete("/notes/:id", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);

    const [existing] = await db
      .select()
      .from(managerNotes)
      .where(eq(managerNotes.id, id));

    if (!existing) return reply.code(404).send({ error: "Note not found" });
    if (existing.managerId !== userId) {
      return reply.code(403).send({ error: "You can only delete your own notes" });
    }

    await db.delete(managerNotes).where(eq(managerNotes.id, id));

    return reply.send({ id, deleted: true });
  });

  // ═══════════════════════════════════════════════════════
  // Team Insights (aggregated feedback digests)
  // ═══════════════════════════════════════════════════════

  // GET /manager/team-insights — List monthly digests
  app.get("/team-insights", async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);

    const digests = await db
      .select()
      .from(feedbackDigests)
      .where(eq(feedbackDigests.managerId, userId))
      .orderBy(feedbackDigests.monthStarting);

    return reply.send({ data: digests });
  });

  // GET /manager/team-insights/:month — Single month digest (YYYY-MM)
  app.get("/team-insights/:month", async (request, reply) => {
    const { month } = parseBody(monthParamSchema, request.params);
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);

    const monthStarting = `${month}-01`;

    const [digest] = await db
      .select()
      .from(feedbackDigests)
      .where(
        and(
          eq(feedbackDigests.managerId, userId),
          eq(feedbackDigests.monthStarting, monthStarting),
        ),
      );

    if (!digest) return reply.code(404).send({ error: "No digest found for this month" });
    return reply.send(digest);
  });

  // POST /manager/team-insights/generate — Aggregate feedback for direct reports
  app.post("/team-insights/generate", async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);

    // Get direct reports
    const directReports = await db
      .select({ id: users.id, name: users.name, teamId: users.teamId })
      .from(users)
      .where(and(eq(users.managerId, userId), eq(users.isActive, true)));

    if (directReports.length === 0) {
      return reply.code(400).send({ error: "No direct reports found" });
    }

    const reportIds = directReports.map((r) => r.id);

    // Get current month boundaries
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthStarting = monthStart.toISOString().split("T")[0];

    // Fetch feedback entries for direct reports this month (as subjects)
    const entries = await db
      .select()
      .from(feedbackEntries)
      .where(inArray(feedbackEntries.subjectId, reportIds));

    // Filter to this month in JS (Drizzle date comparison is cleaner this way)
    const monthEntries = entries.filter((e) => {
      const created = new Date(e.createdAt);
      return created >= monthStart && created < monthEnd;
    });

    // Get value scores for these entries
    const entryIds = monthEntries.map((e) => e.id);
    let valueScores: Array<typeof feedbackValueScores.$inferSelect> = [];
    if (entryIds.length > 0) {
      valueScores = await db
        .select()
        .from(feedbackValueScores)
        .where(inArray(feedbackValueScores.feedbackEntryId, entryIds));
    }

    // Get core values for theme names
    const allValues = await db
      .select()
      .from(coreValues)
      .where(eq(coreValues.isActive, true));
    const valueNameMap = new Map(allValues.map((v) => [v.id, v.name]));

    // Build per-employee summaries
    const memberSummaries = directReports.map((report) => {
      const reportEntries = monthEntries.filter((e) => e.subjectId === report.id);
      const feedbackCount = reportEntries.length;

      // Average sentiment: positive=1, neutral=0.5, negative=0, mixed=0.5
      const sentimentScores: number[] = reportEntries.map((e) => {
        if (e.sentiment === "positive") return 1;
        if (e.sentiment === "negative") return 0;
        return 0.5;
      });
      const avgSentiment =
        feedbackCount > 0
          ? sentimentScores.reduce((a, b) => a + b, 0) / feedbackCount
          : 0.5;

      // Top themes from value scores
      const reportEntryIds = new Set(reportEntries.map((e) => e.id));
      const reportValueScores = valueScores.filter((vs) =>
        reportEntryIds.has(vs.feedbackEntryId),
      );
      const themeCount = new Map<string, number>();
      for (const vs of reportValueScores) {
        const name = valueNameMap.get(vs.coreValueId) ?? "Unknown";
        themeCount.set(name, (themeCount.get(name) ?? 0) + 1);
      }
      const topThemes = [...themeCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name]) => name);

      // Language quality: % with specific examples
      const languageQuality =
        feedbackCount > 0
          ? reportEntries.filter((e) => e.hasSpecificExamples).length / feedbackCount
          : 0;

      return {
        userId: report.id,
        name: report.name,
        feedbackCount,
        avgSentiment: Math.round(avgSentiment * 100) / 100,
        sentimentTrend: "stable" as const, // TODO: compare with previous month
        topThemes,
        languageQuality: Math.round(languageQuality * 100) / 100,
      };
    });

    // Team-level aggregation
    const allMonthSentiments: number[] = monthEntries.map((e) => {
      if (e.sentiment === "positive") return 1;
      if (e.sentiment === "negative") return 0;
      return 0.5;
    });
    const overallSentiment =
      allMonthSentiments.length > 0
        ? allMonthSentiments.reduce((a, b) => a + b, 0) / allMonthSentiments.length
        : 0.5;

    const reportsWithFeedback = memberSummaries.filter((m) => m.feedbackCount > 0).length;
    const participationRate =
      directReports.length > 0
        ? reportsWithFeedback / directReports.length
        : 0;

    // Theme frequency across entire team
    const themeFrequency: Record<string, number> = {};
    for (const vs of valueScores) {
      const name = valueNameMap.get(vs.coreValueId) ?? "Unknown";
      themeFrequency[name] = (themeFrequency[name] ?? 0) + 1;
    }

    const topValues = Object.entries(themeFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    // Language patterns
    const constructiveCount = monthEntries.filter((e) => e.hasSpecificExamples).length;
    const vague = monthEntries.length - constructiveCount;

    const teamId = directReports[0]?.teamId ?? null;

    const data = {
      memberSummaries,
      teamHealth: {
        overallSentiment: Math.round(overallSentiment * 100) / 100,
        participationRate: Math.round(participationRate * 100) / 100,
        topValues,
        themeFrequency,
        languagePatterns: {
          constructive: constructiveCount,
          vague,
        },
      },
      feedbackEntryIds: monthEntries.map((e) => e.id),
    };

    // Upsert digest
    const existing = await db
      .select()
      .from(feedbackDigests)
      .where(
        and(
          eq(feedbackDigests.managerId, userId),
          eq(feedbackDigests.monthStarting, monthStarting),
        ),
      );

    if (existing.length > 0) {
      const [updated] = await db
        .update(feedbackDigests)
        .set({ data, updatedAt: new Date() })
        .where(eq(feedbackDigests.id, existing[0].id))
        .returning();
      return reply.send(updated);
    }

    const [created] = await db
      .insert(feedbackDigests)
      .values({
        teamId,
        managerId: userId,
        monthStarting,
        data,
      })
      .returning();

    return reply.code(201).send(created);
  });
};
