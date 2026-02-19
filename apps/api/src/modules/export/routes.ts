import type { FastifyPluginAsync } from "fastify";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import {
  feedbackEntries,
  feedbackValueScores,
  coreValues,
  engagementScores,
  escalations,
  users,
  teams,
} from "@revualy/db";
import { requireRole } from "../../lib/rbac.js";
import {
  parseBody,
  exportQuerySchema,
  exportUsersQuerySchema,
} from "../../lib/validation.js";
import { toCSV, type CSVColumn } from "../../lib/csv-export.js";

// ── Helpers ─────────────────────────────────────────────

function sendCSV(reply: import("fastify").FastifyReply, csv: string, filenamePrefix: string) {
  const dateStamp = new Date().toISOString().slice(0, 10);
  return reply
    .header("Content-Type", "text/csv; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="${filenamePrefix}-${dateStamp}.csv"`)
    .send(csv);
}

/**
 * Build a stable anonymous label map for blind mode.
 * Each unique reviewer ID maps to "Reviewer 1", "Reviewer 2", etc.
 * Consistent within a single export but not identifiable across exports.
 */
function buildBlindMap(ids: (string | null)[]): Map<string, string> {
  const map = new Map<string, string>();
  let counter = 0;
  for (const id of ids) {
    if (id && !map.has(id)) {
      counter++;
      map.set(id, `Reviewer ${counter}`);
    }
  }
  return map;
}

/**
 * Strip potentially identifying info from evidence text.
 * Removes @ mentions, email addresses, and quoted names.
 */
function sanitizeEvidence(text: string): string {
  return text
    .replace(/@\w+/g, "@[redacted]")
    .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, "[email redacted]")
    .replace(/"[A-Z][a-z]+ [A-Z][a-z]+"/g, '"[name redacted]"');
}

// ── Routes ──────────────────────────────────────────────

export const exportRoutes: FastifyPluginAsync = async (app) => {
  // All export routes are admin-only
  app.addHook("preHandler", requireRole("admin"));

  // GET /feedback — Export feedback entries with value scores
  app.get("/feedback", async (request, reply) => {
    const { db } = request.tenant;
    const query = parseBody(exportQuerySchema, request.query);

    const conditions = [];
    if (query.from) conditions.push(gte(feedbackEntries.createdAt, new Date(query.from)));
    if (query.to) conditions.push(lte(feedbackEntries.createdAt, new Date(query.to)));

    const entries = await db
      .select({
        id: feedbackEntries.id,
        createdAt: feedbackEntries.createdAt,
        reviewerId: feedbackEntries.reviewerId,
        subjectId: feedbackEntries.subjectId,
        interactionType: feedbackEntries.interactionType,
        rawContent: feedbackEntries.rawContent,
        aiSummary: feedbackEntries.aiSummary,
        sentiment: feedbackEntries.sentiment,
        engagementScore: feedbackEntries.engagementScore,
        wordCount: feedbackEntries.wordCount,
        hasSpecificExamples: feedbackEntries.hasSpecificExamples,
      })
      .from(feedbackEntries)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(feedbackEntries.createdAt));

    // Resolve user names for reviewer/subject
    const userIds = new Set<string>();
    for (const e of entries) {
      userIds.add(e.reviewerId);
      userIds.add(e.subjectId);
    }

    const userMap = new Map<string, string>();
    if (userIds.size > 0) {
      const allUsers = await db
        .select({ id: users.id, name: users.name })
        .from(users);
      for (const u of allUsers) userMap.set(u.id, u.name);
    }

    // Fetch value scores + core value names
    const entryIds = entries.map((e) => e.id);
    let valueScoreMap = new Map<string, string>();
    if (entryIds.length > 0) {
      const scores = await db
        .select({
          feedbackEntryId: feedbackValueScores.feedbackEntryId,
          coreValueName: coreValues.name,
          score: feedbackValueScores.score,
          evidence: feedbackValueScores.evidence,
        })
        .from(feedbackValueScores)
        .innerJoin(coreValues, eq(feedbackValueScores.coreValueId, coreValues.id));

      // Group by feedbackEntryId: "Value1: 0.8, Value2: 0.6"
      const grouped = new Map<string, { name: string; score: number; evidence: string }[]>();
      for (const s of scores) {
        const list = grouped.get(s.feedbackEntryId) ?? [];
        list.push({ name: s.coreValueName, score: s.score, evidence: s.evidence });
        grouped.set(s.feedbackEntryId, list);
      }

      for (const [entryId, vals] of grouped) {
        const summary = vals
          .map((v) => {
            const evidence = query.blind ? sanitizeEvidence(v.evidence) : v.evidence;
            return `${v.name}: ${v.score.toFixed(2)}${evidence ? ` (${evidence})` : ""}`;
          })
          .join("; ");
        valueScoreMap.set(entryId, summary);
      }
    }

    // Build blind map if needed
    const blindMap = query.blind
      ? buildBlindMap(entries.map((e) => e.reviewerId))
      : null;

    const rows = entries.map((e) => ({
      date: e.createdAt.toISOString(),
      reviewer: blindMap ? blindMap.get(e.reviewerId) ?? "Anonymous" : (userMap.get(e.reviewerId) ?? "Unknown"),
      subject: userMap.get(e.subjectId) ?? "Unknown",
      interactionType: e.interactionType,
      sentiment: e.sentiment,
      engagementScore: e.engagementScore,
      aiSummary: e.aiSummary,
      coreValueScores: valueScoreMap.get(e.id) ?? "",
      // In blind mode, omit raw content
      ...(query.blind ? {} : { rawContent: e.rawContent }),
    }));

    if (query.format === "csv") {
      const columns: CSVColumn[] = [
        { key: "date", header: "Date" },
        { key: "reviewer", header: "Reviewer" },
        { key: "subject", header: "Subject" },
        { key: "interactionType", header: "Interaction Type" },
        { key: "sentiment", header: "Sentiment" },
        { key: "engagementScore", header: "Engagement Score" },
        { key: "aiSummary", header: "AI Summary" },
        { key: "coreValueScores", header: "Core Value Scores" },
      ];
      if (!query.blind) {
        columns.push({ key: "rawContent", header: "Raw Content" });
      }
      return sendCSV(reply, toCSV(rows, columns), "feedback-export");
    }

    return reply.send({ data: rows, exportedAt: new Date().toISOString() });
  });

  // GET /engagement — Export engagement scores
  app.get("/engagement", async (request, reply) => {
    const { db } = request.tenant;
    const query = parseBody(exportQuerySchema, request.query);

    const conditions = [];
    if (query.from) conditions.push(gte(engagementScores.weekStarting, query.from.slice(0, 10)));
    if (query.to) conditions.push(lte(engagementScores.weekStarting, query.to.slice(0, 10)));

    const rows = await db
      .select({
        weekStarting: engagementScores.weekStarting,
        userName: users.name,
        teamName: teams.name,
        interactionsCompleted: engagementScores.interactionsCompleted,
        interactionsTarget: engagementScores.interactionsTarget,
        averageQualityScore: engagementScores.averageQualityScore,
        responseRate: engagementScores.responseRate,
        streak: engagementScores.streak,
      })
      .from(engagementScores)
      .innerJoin(users, eq(engagementScores.userId, users.id))
      .leftJoin(teams, eq(users.teamId, teams.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(engagementScores.weekStarting));

    const data = rows.map((r) => ({
      week: r.weekStarting,
      userName: r.userName,
      team: r.teamName ?? "",
      interactionsCompleted: r.interactionsCompleted,
      interactionsTarget: r.interactionsTarget,
      averageQualityScore: r.averageQualityScore,
      responseRate: r.responseRate,
      streak: r.streak,
    }));

    if (query.format === "csv") {
      const columns: CSVColumn[] = [
        { key: "week", header: "Week" },
        { key: "userName", header: "User Name" },
        { key: "team", header: "Team" },
        { key: "interactionsCompleted", header: "Interactions Completed" },
        { key: "interactionsTarget", header: "Interactions Target" },
        { key: "averageQualityScore", header: "Avg Quality Score" },
        { key: "responseRate", header: "Response Rate" },
        { key: "streak", header: "Streak" },
      ];
      return sendCSV(reply, toCSV(data, columns), "engagement-export");
    }

    return reply.send({ data, exportedAt: new Date().toISOString() });
  });

  // GET /escalations — Export escalations
  app.get("/escalations", async (request, reply) => {
    const { db } = request.tenant;
    const query = parseBody(exportQuerySchema, request.query);

    const conditions = [];
    if (query.from) conditions.push(gte(escalations.createdAt, new Date(query.from)));
    if (query.to) conditions.push(lte(escalations.createdAt, new Date(query.to)));

    // Alias tables for reporter and subject
    const rows = await db
      .select({
        createdAt: escalations.createdAt,
        reporterId: escalations.reporterId,
        subjectId: escalations.subjectId,
        type: escalations.type,
        severity: escalations.severity,
        status: escalations.status,
        reason: escalations.reason,
      })
      .from(escalations)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(escalations.createdAt));

    // Resolve names
    const allUsers = await db
      .select({ id: users.id, name: users.name })
      .from(users);
    const userMap = new Map<string, string>();
    for (const u of allUsers) userMap.set(u.id, u.name);

    // Build blind map for reporters if needed
    const blindMap = query.blind
      ? buildBlindMap(rows.map((r) => r.reporterId))
      : null;

    const data = rows.map((r) => ({
      date: r.createdAt.toISOString(),
      reporter: blindMap
        ? (r.reporterId ? blindMap.get(r.reporterId) ?? "Anonymous" : "Anonymous")
        : (r.reporterId ? userMap.get(r.reporterId) ?? "Unknown" : "Unknown"),
      subject: r.subjectId ? userMap.get(r.subjectId) ?? "Unknown" : "",
      type: r.type,
      severity: r.severity,
      status: r.status,
      reason: r.reason,
    }));

    if (query.format === "csv") {
      const columns: CSVColumn[] = [
        { key: "date", header: "Date" },
        { key: "reporter", header: "Reporter" },
        { key: "subject", header: "Subject" },
        { key: "type", header: "Type" },
        { key: "severity", header: "Severity" },
        { key: "status", header: "Status" },
        { key: "reason", header: "Reason" },
      ];
      return sendCSV(reply, toCSV(data, columns), "escalations-export");
    }

    return reply.send({ data, exportedAt: new Date().toISOString() });
  });

  // GET /users — Export user roster
  app.get("/users", async (request, reply) => {
    const { db } = request.tenant;
    const query = parseBody(exportUsersQuerySchema, request.query);

    const rows = await db
      .select({
        name: users.name,
        email: users.email,
        role: users.role,
        teamName: teams.name,
        managerId: users.managerId,
        isActive: users.isActive,
        onboardingCompleted: users.onboardingCompleted,
      })
      .from(users)
      .leftJoin(teams, eq(users.teamId, teams.id))
      .orderBy(users.name);

    // Resolve manager names
    const allUsers = await db
      .select({ id: users.id, name: users.name })
      .from(users);
    const userMap = new Map<string, string>();
    for (const u of allUsers) userMap.set(u.id, u.name);

    const data = rows.map((r) => ({
      name: r.name,
      email: r.email,
      role: r.role,
      team: r.teamName ?? "",
      manager: r.managerId ? userMap.get(r.managerId) ?? "" : "",
      isActive: r.isActive ? "Yes" : "No",
      onboardingCompleted: r.onboardingCompleted ? "Yes" : "No",
    }));

    if (query.format === "csv") {
      const columns: CSVColumn[] = [
        { key: "name", header: "Name" },
        { key: "email", header: "Email" },
        { key: "role", header: "Role" },
        { key: "team", header: "Team" },
        { key: "manager", header: "Manager" },
        { key: "isActive", header: "Active" },
        { key: "onboardingCompleted", header: "Onboarding Completed" },
      ];
      return sendCSV(reply, toCSV(data, columns), "users-export");
    }

    return reply.send({ data, exportedAt: new Date().toISOString() });
  });
};
