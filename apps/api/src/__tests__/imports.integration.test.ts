import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { LLMCompletionRequest, LLMGateway } from "@revualy/ai-core";
import {
  getTenantDb,
  users,
  teams,
  goals,
  importRuns,
  importRows,
  importedFeedback,
  feedbackEntries,
  engagementScores,
} from "@revualy/db";
import { buildApp } from "../server.js";
import { recomputeWeeklyEngagement } from "../lib/engagement-aggregation.js";
import { tenantReviewerRef } from "../lib/pseudonym.js";

/**
 * Data imports end to end against a real Postgres, with a fake LLM:
 * upload -> mapping -> dry run -> approve -> commit for people, goals,
 * historical feedback and an org chart, plus re-import idempotency.
 * Every fixture carries a random tag and is deleted afterwards. Skips
 * without a database.
 */

const DB_URL = process.env.DATABASE_URL!;
const SECRET = process.env.INTERNAL_API_SECRET!;
const db = getTenantDb(process.env.ORG_ID!, DB_URL);

async function dbReachable(): Promise<boolean> {
  const timeout = new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 3000));
  try {
    await Promise.race([db.execute(sql`select 1`), timeout]);
    return true;
  } catch {
    return false;
  }
}
const dbUp = await dbReachable();

const HEADER_FIELDS: Record<string, string> = {
  "Full Name": "name",
  "Work Email": "email",
  "Line Manager Email": "managerEmail",
  Department: "team",
  "Job Title": "title",
  "Start Date": "startDate",
  Owner: "ownerEmail",
  Goal: "title",
  Progress: "progress",
  Due: "dueDate",
  Parent: "parentTitle",
  Level: "level",
  From: "authorEmail",
  To: "recipientEmail",
  Date: "date",
  Feedback: "text",
};

describe.skipIf(!dbUp)("data imports (integration)", () => {
  let app: FastifyInstance;
  const tag = crypto.randomUUID().slice(0, 8);
  const adminId = crypto.randomUUID();
  const employeeId = crypto.randomUUID();
  const email = (who: string) => `${who}-${tag}@test.local`;
  const team = `Eng-${tag}`;
  let chartReply = "";
  const llmRequests: LLMCompletionRequest[] = [];

  const fakeLlm = {
    complete: async (req: LLMCompletionRequest) => {
      llmRequests.push(req);
      const user = req.messages.find((m) => m.role === "user")!;
      let content: string;
      if (user.attachments?.length) {
        content = chartReply;
      } else {
        const { headers } = JSON.parse(user.content) as { headers: string[] };
        const assignments = headers.filter((h) => HEADER_FIELDS[h]).map((h) => ({ field: HEADER_FIELDS[h], column: h }));
        content = JSON.stringify({ assignments, dateFormat: "dmy" });
      }
      return { content, usage: { inputTokens: 0, outputTokens: 0 }, model: "fake", latencyMs: 0, stopReason: "end_turn" };
    },
  };

  const as = (userId: string) => ({ "x-internal-secret": SECRET, "x-user-id": userId });

  async function runImport(kind: string, file: Buffer, opts: { contentType?: string; sourceSystem?: string; mapping?: object } = {}) {
    const up = await app.inject({
      method: "POST",
      url: "/api/v1/admin/imports",
      headers: as(adminId),
      payload: {
        kind,
        fileName: `${kind}.csv`,
        contentType: opts.contentType ?? "text/csv",
        dataBase64: file.toString("base64"),
        ...(opts.sourceSystem ? { sourceSystem: opts.sourceSystem } : {}),
      },
    });
    expect(up.statusCode, up.body).toBe(201);
    const run = up.json();
    const dry = await app.inject({ method: "PUT", url: `/api/v1/admin/imports/${run.id}/mapping`, headers: as(adminId), payload: opts.mapping ?? {} });
    expect(dry.statusCode, dry.body).toBe(200);
    return { uploaded: run, dryRun: dry.json() };
  }

  async function approveAndCommit(id: string) {
    const ok = await app.inject({ method: "POST", url: `/api/v1/admin/imports/${id}/approve`, headers: as(adminId) });
    expect(ok.statusCode, ok.body).toBe(200);
    const done = await app.inject({ method: "POST", url: `/api/v1/admin/imports/${id}/commit`, headers: as(adminId) });
    expect(done.statusCode, done.body).toBe(200);
    return done.json();
  }

  const userByEmail = async (e: string) => (await db.select().from(users).where(eq(users.email, e)))[0];

  const peopleCsv = () =>
    Buffer.from(
      [
        "Full Name,Work Email,Line Manager Email,Department,Job Title,Start Date",
        `Ada Boss ${tag},${email("ada")},,${team},CTO,01/02/2024`,
        `Bea Dev ${tag},${email("bea")},${email("ada")},${team},Engineer,15/03/2025`,
        `Cal Dev ${tag},${email("cal")},${email("bea")},${team},Engineer,`,
      ].join("\r\n"),
    );

  beforeAll(async () => {
    await db.insert(users).values([
      { id: adminId, email: email("admin"), name: "Admin", role: "admin" },
      { id: employeeId, email: email("emp"), name: "Emp", role: "employee" },
    ]);
    app = await buildApp();
    app.decorate("llm", fakeLlm as unknown as LLMGateway);
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    const ours = await db.select({ id: users.id }).from(users).where(like(users.email, `%-${tag}@test.local`));
    const ids = ours.map((u) => u.id);
    if (ids.length) {
      await db.delete(importedFeedback).where(or(inArray(importedFeedback.authorRef, ids.map(tenantReviewerRef)), inArray(importedFeedback.recipientId, ids)));
      await db.delete(goals).where(inArray(goals.ownerId, ids));
      await db.delete(importRuns).where(inArray(importRuns.createdBy, ids));
      await db.delete(engagementScores).where(inArray(engagementScores.userId, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
    await db.delete(teams).where(like(teams.name, `%-${tag}`));
  });

  it("is admin only", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/admin/imports/${crypto.randomUUID()}`, headers: as(employeeId) });
    expect(res.statusCode).toBe(403);
  });

  it("people CSV end to end: nothing written before commit, then users, managers and team exist", async () => {
    const { uploaded, dryRun } = await runImport("people", peopleCsv());
    expect(uploaded.status).toBe("mapped");
    expect(uploaded.mappingSource).toBe("model");
    expect(dryRun.status).toBe("dry_run");
    expect(dryRun.report.counts).toMatchObject({ total: 3, created: 3, updated: 0, invalid: 0 });
    expect(dryRun.report.teamsToCreate).toEqual([team]);
    expect(await userByEmail(email("bea"))).toBeUndefined();

    // Staged row content is encrypted at rest.
    const rawRows = await db.execute<{ raw: string }>(sql`select raw from import_rows where run_id = ${uploaded.id}`);
    expect(rawRows.length).toBe(3);
    for (const r of rawRows) expect(r.raw).not.toContain(tag);

    const committed = await approveAndCommit(uploaded.id);
    expect(committed.status).toBe("committed");
    const [ada, bea, cal] = await Promise.all(["ada", "bea", "cal"].map((w) => userByEmail(email(w))));
    expect(bea.managerId).toBe(ada.id);
    expect(cal.managerId).toBe(bea.id);
    expect(ada.managerId).toBeNull();
    expect(ada.role).toBe("manager");
    expect(cal.role).toBe("employee");
    expect(bea.jobTitle).toBe("Engineer");
    expect(bea.startDate).toBe("2025-03-15");
    const [t] = await db.select().from(teams).where(eq(teams.name, team));
    expect(bea.teamId).toBe(t.id);
    const rowStates = await db.select({ status: importRows.status, targetId: importRows.targetId }).from(importRows).where(eq(importRows.runId, uploaded.id));
    expect(rowStates.every((r) => r.status === "applied" && r.targetId)).toBe(true);
    // Retention: rows go 30 days after commit.
    expect(new Date(committed.rowsPurgeAfter).getTime() - new Date(committed.committedAt).getTime()).toBe(30 * 86_400_000);
  });

  it("re-importing the same file changes nothing; a delta updates only what changed", async () => {
    const again = await runImport("people", peopleCsv());
    expect(again.dryRun.report.counts).toMatchObject({ created: 0, updated: 0, unchanged: 3, matched: 3 });
    await approveAndCommit(again.uploaded.id);
    expect(await db.select().from(teams).where(eq(teams.name, team))).toHaveLength(1);
    expect(await db.select().from(users).where(like(users.email, `%-${tag}@test.local`))).toHaveLength(5);

    const delta = Buffer.from(
      ["Full Name,Work Email,Line Manager Email,Department,Job Title,Start Date", `Cal Dev ${tag},${email("cal")},,,Senior Engineer,`].join("\n"),
    );
    const d = await runImport("people", delta);
    expect(d.dryRun.report.counts).toMatchObject({ created: 0, updated: 1 });
    await approveAndCommit(d.uploaded.id);
    const cal = await userByEmail(email("cal"));
    expect(cal.jobTitle).toBe("Senior Engineer");
    // Blank cells in a delta never clear data.
    expect(cal.managerId).toBe((await userByEmail(email("bea"))).id);
  });

  it("refuses to approve a run that would create a manager cycle", async () => {
    const cyclic = Buffer.from(["Full Name,Work Email,Line Manager Email", `Ada Boss ${tag},${email("ada")},${email("cal")}`].join("\n"));
    const { uploaded, dryRun } = await runImport("people", cyclic);
    expect(dryRun.report.managerCycles).toHaveLength(1);
    expect(dryRun.report.managerCycles[0]).toEqual(expect.arrayContaining([email("ada"), email("bea"), email("cal")]));
    const res = await app.inject({ method: "POST", url: `/api/v1/admin/imports/${uploaded.id}/approve`, headers: as(adminId) });
    expect(res.statusCode).toBe(409);
    expect(res.json().details[0]).toMatch(/Manager cycle/);
    expect((await userByEmail(email("ada"))).managerId).toBeNull();
  });

  it("imports goals onto the ladder, idempotently", async () => {
    const csv = Buffer.from(
      [
        "Owner,Goal,Progress,Due,Parent,Level",
        `${email("ada")},Grow revenue ${tag},0.4,2026-12-31,,Company`,
        `${email("bea")},Ship v2 ${tag},0.5,2026-06-30,Grow revenue ${tag},Team`,
        `${email("cal")},Write docs ${tag},1,,Ship v2 ${tag},Individual`,
        `${email("ghost")},Orphan ${tag},0.1,,,Individual`,
      ].join("\n"),
    );
    const { uploaded, dryRun } = await runImport("goals", csv);
    expect(dryRun.report.counts).toMatchObject({ total: 4, created: 3, invalid: 1 });
    expect(dryRun.report.unmatchedPeople[0]).toMatchObject({ email: email("ghost") });
    await approveAndCommit(uploaded.id);

    const [ada, bea, cal] = await Promise.all(["ada", "bea", "cal"].map((w) => userByEmail(email(w))));
    const rows = await db.select().from(goals).where(inArray(goals.ownerId, [ada.id, bea.id, cal.id]));
    const byTitle = new Map(rows.map((g) => [g.title, g]));
    const org = byTitle.get(`Grow revenue ${tag}`)!;
    const teamGoal = byTitle.get(`Ship v2 ${tag}`)!;
    const ind = byTitle.get(`Write docs ${tag}`)!;
    expect(org).toMatchObject({ level: "org", progressPercent: 40, targetDate: "2026-12-31", parentGoalId: null, createdById: adminId });
    expect(teamGoal).toMatchObject({ level: "team", parentGoalId: org.id, teamId: bea.teamId });
    expect(ind).toMatchObject({ level: "individual", parentGoalId: teamGoal.id, progressPercent: 100, status: "achieved" });

    const again = await runImport("goals", csv);
    expect(again.dryRun.report.counts).toMatchObject({ created: 0, updated: 0, unchanged: 3 });
  });

  it("imports historical feedback encrypted, marked with its source, outside engagement", async () => {
    const csv = Buffer.from(
      [
        "From,To,Date,Feedback",
        `${email("bea")},${email("cal")},2026-01-05,"Great docs, ${tag}"`,
        `${email("cal")},${email("bea")},2026-01-06,Helpful reviews`,
        `${email("ghost")},${email("bea")},2026-01-07,Unknown author`,
      ].join("\n"),
    );
    const { uploaded, dryRun } = await runImport("feedback", csv, { sourceSystem: "culture_amp" });
    expect(dryRun.report.counts).toMatchObject({ total: 3, created: 2, invalid: 1 });
    expect(JSON.stringify(dryRun.report)).not.toContain("Great docs");
    await approveAndCommit(uploaded.id);

    const [bea, cal] = await Promise.all(["bea", "cal"].map((w) => userByEmail(email(w))));
    const imported = await db.select().from(importedFeedback).where(eq(importedFeedback.authorRef, tenantReviewerRef(bea.id)));
    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({ recipientId: cal.id, content: `Great docs, ${tag}`, sourceSystem: "culture_amp", importRunId: uploaded.id });
    const [stored] = await db.execute<{ content: string }>(sql`select content from imported_feedback where id = ${imported[0].id}`);
    expect(stored.content).not.toContain(tag);

    // Not feedback_entries, so engagement never counts it.
    expect(await db.select().from(feedbackEntries).where(eq(feedbackEntries.reviewerRef, tenantReviewerRef(bea.id)))).toHaveLength(0);
    await recomputeWeeklyEngagement(db, bea.id, "2026-01-05");
    const [score] = await db
      .select()
      .from(engagementScores)
      .where(and(eq(engagementScores.userId, bea.id), eq(engagementScores.weekStarting, "2026-01-05")));
    expect(score.interactionsCompleted).toBe(0);

    const again = await runImport("feedback", csv, { sourceSystem: "culture_amp" });
    expect(again.dryRun.report.counts).toMatchObject({ created: 0, unchanged: 2 });
  });

  it("org chart: vision reading, low-confidence line held until accepted, unmatched person listed", async () => {
    chartReply = JSON.stringify({
      people: [
        { id: "p1", name: "Whoever", email: email("ada"), title: "CTO" },
        { id: "p2", name: `Bea Dev ${tag}`, email: "", title: "" },
        { id: "p3", name: `Cal Dev ${tag}`, email: "", title: "" },
        { id: "p4", name: `Nardole ${tag}`, email: "", title: "" },
      ],
      lines: [
        { report: "p2", manager: "p1", confidence: "high" },
        { report: "p3", manager: "p1", confidence: "low" },
        { report: "p4", manager: "p1", confidence: "high" },
      ],
    });
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(64)]);
    const { uploaded, dryRun } = await runImport("org_chart", png, { contentType: "image/png" });
    const sent = llmRequests.at(-1)!.messages.find((m) => m.role === "user")!;
    expect(sent.attachments?.[0]).toMatchObject({ type: "image", mediaType: "image/png", data: png.toString("base64") });

    expect(dryRun.report.counts).toMatchObject({ total: 4, matched: 3, created: 0, updated: 0, skipped: 1 });
    expect(dryRun.report.lowConfidenceLines).toEqual([{ report: `Cal Dev ${tag}`, manager: "Whoever", applied: false }]);
    expect(dryRun.report.unmatchedPeople).toEqual([expect.objectContaining({ name: `Nardole ${tag}` })]);
    expect(await db.select().from(users).where(like(users.name, `Nardole ${tag}`))).toHaveLength(0);

    const accepted = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/imports/${uploaded.id}/mapping`,
      headers: as(adminId),
      payload: { acceptLowConfidence: true },
    });
    expect(accepted.json().report.lowConfidenceLines[0].applied).toBe(true);
    expect(accepted.json().report.counts.updated).toBe(1);
    await approveAndCommit(uploaded.id);
    const [ada, cal] = await Promise.all(["ada", "cal"].map((w) => userByEmail(email(w))));
    expect(cal.managerId).toBe(ada.id);
  });

  it("refuses to commit when the data changed after approval", async () => {
    const csv = Buffer.from(["Full Name,Work Email,Job Title", `Bea Dev ${tag},${email("bea")},Lead`].join("\n"));
    const { uploaded } = await runImport("people", csv);
    await app.inject({ method: "POST", url: `/api/v1/admin/imports/${uploaded.id}/approve`, headers: as(adminId) });
    await db.update(users).set({ jobTitle: "Lead" }).where(eq(users.email, email("bea")));
    const res = await app.inject({ method: "POST", url: `/api/v1/admin/imports/${uploaded.id}/commit`, headers: as(adminId) });
    expect(res.statusCode).toBe(409);
    const [run] = await db.select().from(importRuns).where(eq(importRuns.id, uploaded.id));
    expect(run.status).toBe("dry_run");
  });
});
