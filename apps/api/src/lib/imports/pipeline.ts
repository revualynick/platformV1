import crypto from "node:crypto";
import { and, asc, eq, inArray, lt, notInArray, sql } from "drizzle-orm";
import type { LLMAttachment, LLMGateway } from "@revualy/ai-core";
import { goals, importedFeedback, importRows, importRuns, teams, users, type TenantDb } from "@revualy/db";
import { findManagerCycles } from "./graph.js";
import {
  FIELDS,
  applyMapping,
  proposeMapping,
  validateMapping,
  type ColumnMapping,
  type FeedbackRow,
  type GoalRow,
  type PersonRow,
  type TabularKind,
} from "./mapping.js";
import { extractOrgChart, type ChartPerson } from "./org-chart.js";
import {
  feedbackSourceKey,
  planFeedback,
  planGoals,
  planOrgChart,
  planPeople,
  type FeedbackPlan,
  type GoalsPlan,
  type ImportKind,
  type ImportReport,
  type OrgChartPlan,
  type PeoplePlan,
  type RowOutcome,
  type StagedTabularRow,
  type UserSnap,
} from "./plan.js";
import { MAX_IMPORT_ROWS, readTabular } from "./tabular.js";
import { insertUsersSkippingExisting } from "../user-provisioning.js";
import { syncAuthUser } from "../auth-sync.js";
import { tenantReviewerRef } from "../pseudonym.js";

/**
 * The import flow: stage -> map -> dry run -> admin approves -> commit.
 * Staging writes only import_runs / import_rows; nothing reaches users,
 * goals or feedback until commit, and commit applies exactly the plan the
 * admin approved (it re-plans and compares planHash). Re-running a file,
 * or a later delta of it, only applies what changed.
 */

type Db = Pick<TenantDb, "select" | "insert" | "update" | "delete">;
type Run = typeof importRuns.$inferSelect;

export const ROWS_RETENTION_DAYS = 30;
export const MAX_TABULAR_BYTES = 10 * 1024 * 1024;
export const MAX_CHART_BYTES = 20 * 1024 * 1024;
/** Anthropic's per-image limit. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** An error with a status and a message safe to show the admin. */
export class ImportError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function targetFields(kind: ImportKind): string[] {
  return kind === "org_chart" ? [] : Object.keys(FIELDS[kind]);
}

export function runView(run: Run) {
  return { ...run, targetFields: targetFields(run.kind as ImportKind) };
}

// ── Stage ──────────────────────────────────────────────

export interface UploadInput {
  kind: ImportKind;
  fileName: string;
  contentType: string;
  data: Buffer;
  sourceSystem?: string;
  createdBy: string;
}

function sniffChart(buf: Buffer): LLMAttachment["mediaType"] | null {
  if (buf.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (buf.length > 8 && buf[0] === 0x89 && buf.subarray(1, 4).toString("latin1") === "PNG") return "image/png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  return null;
}

/**
 * Stage a file. Tabular files are parsed into rows and the model proposes
 * a mapping; org charts go to the model (vision) straight away and its
 * reading becomes the rows. The file itself is never stored, only its
 * hash, size and name.
 */
export async function stageUpload(
  db: TenantDb,
  llm: Pick<LLMGateway, "complete"> | null | undefined,
  input: UploadInput,
  opts: { logger?: Pick<Console, "warn"> } = {},
): Promise<Run> {
  const meta = {
    kind: input.kind,
    fileName: input.fileName,
    contentType: input.contentType,
    fileSize: input.data.length,
    fileSha256: crypto.createHash("sha256").update(input.data).digest("hex"),
    sourceSystem: input.sourceSystem ?? null,
    createdBy: input.createdBy,
  };

  if (input.kind === "org_chart") {
    if (input.data.length > MAX_CHART_BYTES) throw new ImportError(413, "Org charts can be at most 20 MB");
    const mediaType = sniffChart(input.data);
    if (!mediaType) throw new ImportError(400, "Org charts must be a PDF, PNG or JPG. Export slides to PDF first.");
    if (mediaType !== "application/pdf" && input.data.length > MAX_IMAGE_BYTES) {
      throw new ImportError(413, "Images can be at most 5 MB; export as PDF or a smaller image");
    }
    if (!llm) throw new ImportError(503, "Reading org charts needs the AI model, which is not configured");
    let people: ChartPerson[];
    let warnings: string[];
    try {
      const chart = await extractOrgChart(llm, { type: mediaType === "application/pdf" ? "document" : "image", mediaType, data: input.data.toString("base64") } as LLMAttachment, opts);
      people = chart.people;
      warnings = chart.warnings;
    } catch (err) {
      const [failed] = await db
        .insert(importRuns)
        .values({ ...meta, status: "failed", error: err instanceof Error ? err.message : "Could not read the org chart" })
        .returning();
      return failed;
    }
    return db.transaction(async (tx) => {
      const [run] = await tx
        .insert(importRuns)
        .values({
          ...meta,
          status: "mapped",
          rowCount: people.length,
          mapping: { acceptLowConfidence: false },
          mappingSource: "model",
          report: { extractionWarnings: warnings },
        })
        .returning();
      await insertRows(tx, run.id, people.map((p, i) => ({ rowIndex: i + 1, raw: JSON.stringify(p) })));
      return run;
    });
  }

  if (input.data.length > MAX_TABULAR_BYTES) throw new ImportError(413, "Files can be at most 10 MB");
  let source;
  try {
    source = await readTabular(input.data);
  } catch {
    throw new ImportError(400, "Could not read the file as CSV or XLSX");
  }
  if (source.headers.length === 0 || source.rows.length === 0) throw new ImportError(400, "The file has no data rows");
  if (source.rows.length > MAX_IMPORT_ROWS) {
    throw new ImportError(413, `At most ${MAX_IMPORT_ROWS} rows per import; split the file`);
  }

  const proposal = await proposeMapping(llm, input.kind, source.headers, source.rows.map((r) => r.cells), opts);
  return db.transaction(async (tx) => {
    const [run] = await tx
      .insert(importRuns)
      .values({
        ...meta,
        status: proposal.mapping ? "mapped" : "staged",
        columns: source.headers,
        rowCount: source.rows.length,
        mapping: proposal.mapping as unknown as Record<string, unknown> | null,
        mappingSource: proposal.source,
        error: proposal.mapping ? null : "No mapping could be proposed; set one with PUT /mapping",
        report: { parseWarnings: source.warnings, mappingNotes: proposal.notes },
      })
      .returning();
    await insertRows(tx, run.id, source.rows.map((r) => ({ rowIndex: r.rowNumber, raw: JSON.stringify(r.cells) })));
    return run;
  });
}

async function insertRows(db: Db, runId: string, rows: Array<{ rowIndex: number; raw: string }>) {
  for (let i = 0; i < rows.length; i += 500) {
    await db.insert(importRows).values(rows.slice(i, i + 500).map((r) => ({ runId, ...r })));
  }
}

// ── Plan ───────────────────────────────────────────────

type Planned =
  | { kind: "people"; plan: PeoplePlan; mapped: Map<number, unknown> }
  | { kind: "goals"; plan: GoalsPlan; mapped: Map<number, unknown> }
  | { kind: "feedback"; plan: FeedbackPlan; mapped: Map<number, unknown> }
  | { kind: "org_chart"; plan: OrgChartPlan; mapped: Map<number, unknown> };

async function loadUsers(db: Db): Promise<UserSnap[]> {
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      teamId: users.teamId,
      managerId: users.managerId,
      jobTitle: users.jobTitle,
      startDate: users.startDate,
      role: users.role,
      isActive: users.isActive,
    })
    .from(users);
}

async function planRun(db: Db, run: Run, rows: Array<{ rowIndex: number; raw: string }>): Promise<Planned> {
  const kind = run.kind as ImportKind;
  const snapUsers = await loadUsers(db);

  if (kind === "org_chart") {
    const people = rows.map((r) => ({ ...(JSON.parse(r.raw) as ChartPerson), rowIndex: r.rowIndex }));
    const accept = (run.mapping as { acceptLowConfidence?: boolean } | null)?.acceptLowConfidence === true;
    const plan = planOrgChart(people, snapUsers, { acceptLowConfidence: accept });
    const mapped = new Map<number, unknown>(plan.outcomes.map((o) => [o.rowIndex, { userId: o.targetId ?? null }]));
    return { kind, plan, mapped };
  }

  const mapping = run.mapping as unknown as ColumnMapping | null;
  if (!mapping) throw new ImportError(409, "The run has no mapping yet");
  const results = applyMapping(kind, run.columns, mapping, rows.map((r) => JSON.parse(r.raw) as string[]));
  const staged = rows.map((r, i) => ({ rowIndex: r.rowIndex, result: results[i] }));
  const mapped = new Map<number, unknown>(staged.filter((s) => s.result.ok).map((s) => [s.rowIndex, (s.result as { value: unknown }).value]));

  if (kind === "people") {
    const snapTeams = await db.select({ id: teams.id, name: teams.name }).from(teams);
    return { kind, plan: planPeople(staged as StagedTabularRow<PersonRow>[], snapUsers, snapTeams), mapped };
  }
  if (kind === "goals") {
    const snapGoals = await db
      .select({
        id: goals.id,
        importKey: goals.importKey,
        title: goals.title,
        level: goals.level,
        ownerId: goals.ownerId,
        description: goals.description,
        progressPercent: goals.progressPercent,
        targetDate: goals.targetDate,
        parentGoalId: goals.parentGoalId,
        status: goals.status,
      })
      .from(goals);
    return { kind, plan: planGoals(staged as StagedTabularRow<GoalRow>[], snapUsers, snapGoals), mapped };
  }
  const keys = staged.filter((s) => s.result.ok).map((s) => feedbackSourceKey((s.result as { value: FeedbackRow }).value));
  const existing = new Set<string>();
  for (let i = 0; i < keys.length; i += 1000) {
    const found = await db
      .select({ key: importedFeedback.sourceKey })
      .from(importedFeedback)
      .where(inArray(importedFeedback.sourceKey, keys.slice(i, i + 1000)));
    for (const f of found) existing.add(f.key);
  }
  return { kind, plan: planFeedback(staged as StagedTabularRow<FeedbackRow>[], snapUsers, existing), mapped };
}

async function loadRows(db: Db, runId: string) {
  const rows = await db
    .select({ rowIndex: importRows.rowIndex, raw: importRows.raw })
    .from(importRows)
    .where(eq(importRows.runId, runId))
    .orderBy(asc(importRows.rowIndex));
  if (rows.length === 0) throw new ImportError(410, "The staged rows for this run have been deleted; upload the file again");
  return rows;
}

/** Record each row's planned or applied outcome (mapped JSON is encrypted by the ORM). */
async function writeRowStates(
  db: Db,
  runId: string,
  rows: Array<{ rowIndex: number; raw: string }>,
  outcomes: RowOutcome[],
  mapped: Map<number, unknown>,
  applied: boolean,
) {
  const byIndex = new Map(outcomes.map((o) => [o.rowIndex, o]));
  const values = rows.map((r) => {
    const o = byIndex.get(r.rowIndex);
    const status = !o ? "staged" : applied && o.status === "ready" ? "applied" : o.status;
    const m = mapped.get(r.rowIndex);
    return {
      runId,
      rowIndex: r.rowIndex,
      raw: r.raw,
      mapped: m === undefined ? null : JSON.stringify(m),
      status,
      action: o?.action ?? null,
      error: o?.error ?? null,
      targetId: o?.targetId ?? null,
    };
  });
  for (let i = 0; i < values.length; i += 500) {
    await db
      .insert(importRows)
      .values(values.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [importRows.runId, importRows.rowIndex],
        set: {
          mapped: sql`excluded.mapped`,
          status: sql`excluded.status`,
          action: sql`excluded.action`,
          error: sql`excluded.error`,
          targetId: sql`excluded.target_id`,
        },
      });
  }
}

// ── Map + dry run ──────────────────────────────────────

async function getRun(db: Db, id: string, lock = false): Promise<Run> {
  const q = db.select().from(importRuns).where(eq(importRuns.id, id));
  const [run] = lock ? await q.for("update") : await q;
  if (!run) throw new ImportError(404, "Import run not found");
  return run;
}

export async function getImportRun(db: TenantDb, id: string): Promise<Run> {
  return getRun(db, id);
}

export interface MappingInput {
  /** Tabular: replaces the proposed mapping. Omit to confirm the proposal. */
  mapping?: ColumnMapping;
  /** Org charts: apply low-confidence reporting lines too. */
  acceptLowConfidence?: boolean;
}

/**
 * Set or confirm the mapping and run the dry run: every row is mapped,
 * planned against the current data and given an outcome, and the report
 * is stored. Writes nothing outside the import tables. Clears any earlier
 * approval, so a changed mapping must be approved again.
 */
export async function setMappingAndDryRun(db: TenantDb, id: string, input: MappingInput): Promise<Run> {
  return db.transaction(async (tx) => {
    const run = await getRun(tx, id, true);
    if (run.status === "committed") throw new ImportError(409, "This run is already committed");
    const updates: Partial<Run> = {};
    if (run.kind === "org_chart") {
      if (input.mapping) throw new ImportError(400, "Org chart runs have no column mapping");
      updates.mapping = { acceptLowConfidence: input.acceptLowConfidence === true };
    } else if (input.mapping) {
      const errors = validateMapping(run.kind as TabularKind, run.columns, input.mapping);
      if (errors.length) throw new ImportError(400, "The mapping is not valid", errors);
      updates.mapping = input.mapping as unknown as Record<string, unknown>;
      updates.mappingSource = "admin";
    } else if (!run.mapping) {
      throw new ImportError(400, "No mapping was proposed for this file; send one");
    }
    const withMapping = { ...run, ...updates };
    const rows = await loadRows(tx, id);
    const planned = await planRun(tx, withMapping, rows);
    await writeRowStates(tx, id, rows, planned.plan.outcomes, planned.mapped, false);
    const [updated] = await tx
      .update(importRuns)
      .set({
        ...updates,
        status: "dry_run",
        report: planned.plan.report as unknown as Record<string, unknown>,
        error: null,
        approvedBy: null,
        approvedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(importRuns.id, id))
      .returning();
    return updated;
  });
}

// ── Approve ────────────────────────────────────────────

export async function approveRun(db: TenantDb, id: string, adminId: string): Promise<Run> {
  return db.transaction(async (tx) => {
    const run = await getRun(tx, id, true);
    if (run.status !== "dry_run") throw new ImportError(409, "Only a run with a dry-run report can be approved");
    const report = run.report as unknown as ImportReport;
    if (report.blocking?.length) throw new ImportError(409, "The dry run found problems that must be fixed first", report.blocking);
    const [updated] = await tx
      .update(importRuns)
      .set({ status: "approved", approvedBy: adminId, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(importRuns.id, id))
      .returning();
    return updated;
  });
}

// ── Commit ─────────────────────────────────────────────

/**
 * Apply an approved run in one transaction. Re-plans against the data as
 * it is now; if that plan differs from the approved one the run goes back
 * to dry_run with the fresh report and nothing is written. A failure
 * rolls everything back and marks the run failed.
 */
export async function commitRun(db: TenantDb, id: string, adminId: string, opts: { logger?: Pick<Console, "error"> } = {}): Promise<Run> {
  const logger = opts.logger ?? console;
  const authSyncs: Array<{ userId: string; teamId: string | null }> = [];
  let drift: ImportReport | null = null;
  let committed: Run;
  try {
    committed = await db.transaction(async (tx) => {
      const run = await getRun(tx, id, true);
      if (run.status !== "approved") throw new ImportError(409, "Only an approved run can be committed");
      const rows = await loadRows(tx, id);
      const planned = await planRun(tx, run, rows);
      if (planned.plan.report.planHash !== (run.report as unknown as ImportReport).planHash) {
        drift = planned.plan.report;
        throw new ImportError(409, "The data changed since the dry run; review the new report and approve again");
      }

      if (planned.kind === "people") await applyPeople(tx, planned.plan, authSyncs);
      else if (planned.kind === "goals") await applyGoals(tx, planned.plan, adminId);
      else if (planned.kind === "feedback") await applyFeedback(tx, planned.plan, id, run.sourceSystem);
      else await applyOrgChart(tx, planned.plan);

      await writeRowStates(tx, id, rows, planned.plan.outcomes, planned.mapped, true);
      const now = new Date();
      const [updated] = await tx
        .update(importRuns)
        .set({
          status: "committed",
          committedAt: now,
          report: { ...planned.plan.report, committedBy: adminId } as unknown as Record<string, unknown>,
          rowsPurgeAfter: new Date(now.getTime() + ROWS_RETENTION_DAYS * 86_400_000),
          updatedAt: now,
        })
        .where(eq(importRuns.id, id))
        .returning();
      return updated;
    });
  } catch (err) {
    if (drift) {
      await db
        .update(importRuns)
        .set({ status: "dry_run", report: drift as unknown as Record<string, unknown>, approvedBy: null, approvedAt: null, updatedAt: new Date() })
        .where(eq(importRuns.id, id));
    } else if (!(err instanceof ImportError)) {
      logger.error("[import] commit failed:", err);
      await db
        .update(importRuns)
        .set({ status: "failed", error: err instanceof CommitRejected ? err.message : "The commit failed and was rolled back", updatedAt: new Date() })
        .where(eq(importRuns.id, id));
      if (err instanceof CommitRejected) throw new ImportError(409, err.message);
    }
    throw err;
  }
  for (const s of authSyncs) await syncAuthUser(db, s.userId, { teamId: s.teamId });
  return committed;
}

/** A safety check inside the commit transaction failed (rolls back). */
class CommitRejected extends Error {}

async function assertNoCycles(tx: Db, touched: Set<string>) {
  const all = await tx.select({ id: users.id, managerId: users.managerId }).from(users);
  const cycles = findManagerCycles(new Map(all.map((u) => [u.id, u.managerId])));
  if (cycles.some((c) => c.some((n) => touched.has(n)))) {
    throw new CommitRejected("Committing would create a manager cycle; nothing was written");
  }
}

async function applyPeople(tx: Db, plan: PeoplePlan, authSyncs: Array<{ userId: string; teamId: string | null }>) {
  const teamIds = new Map((await tx.select({ id: teams.id, name: teams.name }).from(teams)).map((t) => [t.name.trim().toLowerCase(), t.id]));
  if (plan.teamsToCreate.length) {
    const created = await tx.insert(teams).values(plan.teamsToCreate.map((name) => ({ name }))).returning({ id: teams.id, name: teams.name });
    for (const t of created) teamIds.set(t.name.trim().toLowerCase(), t.id);
  }
  const teamId = (name?: string) => (name ? teamIds.get(name.trim().toLowerCase()) ?? null : null);

  const created = await insertUsersSkippingExisting(
    tx,
    plan.creates.map((c) => ({ email: c.email, name: c.name, role: c.role, teamId: teamId(c.teamName), jobTitle: c.jobTitle, startDate: c.startDate })),
  );
  if (created.length !== plan.creates.length) throw new CommitRejected("Some of these people were created while the import ran; run the dry run again");
  const idByEmail = new Map((await tx.select({ id: users.id, email: users.email }).from(users)).map((u) => [u.email.toLowerCase(), u.id]));
  const createdByRow = new Map(plan.creates.map((c) => [c.rowIndex, idByEmail.get(c.email)!]));
  for (const o of plan.outcomes) if (o.action === "create") o.targetId = createdByRow.get(o.rowIndex) ?? null;

  for (const u of plan.updates) {
    const set: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    if (u.set.name !== undefined) set.name = u.set.name;
    if (u.set.jobTitle !== undefined) set.jobTitle = u.set.jobTitle;
    if (u.set.startDate !== undefined) set.startDate = u.set.startDate;
    if (u.set.teamName !== undefined) {
      set.teamId = teamId(u.set.teamName);
      authSyncs.push({ userId: u.userId, teamId: set.teamId });
    }
    await tx.update(users).set(set).where(eq(users.id, u.userId));
  }

  const touched = new Set<string>();
  for (const m of plan.managers) {
    const userId = idByEmail.get(m.email)!;
    touched.add(userId);
    await tx.update(users).set({ managerId: idByEmail.get(m.managerEmail)!, updatedAt: new Date() }).where(eq(users.id, userId));
  }
  if (touched.size) await assertNoCycles(tx, touched);
}

async function applyGoals(tx: Db, plan: GoalsPlan, adminId: string) {
  const idByKey = new Map(
    (await tx.select({ id: goals.id, key: goals.importKey }).from(goals)).filter((g) => g.key).map((g) => [g.key!, g.id]),
  );
  const parentId = (ref: GoalsPlan["creates"][number]["parent"] | undefined) =>
    !ref ? null : "goalId" in ref ? ref.goalId : (idByKey.get(ref.importKey) ?? null);

  // Creates are ordered parents first, so a parent in the file exists before its children.
  for (const c of plan.creates) {
    const [g] = await tx
      .insert(goals)
      .values({
        level: c.level,
        title: c.title,
        description: c.description,
        parentGoalId: parentId(c.parent),
        teamId: c.teamId,
        ownerId: c.ownerId,
        createdById: adminId,
        status: c.status,
        progressPercent: c.progressPercent,
        targetDate: c.targetDate,
        importKey: c.importKey,
      })
      .returning({ id: goals.id });
    idByKey.set(c.importKey, g.id);
    const outcome = plan.outcomes.find((o) => o.rowIndex === c.rowIndex);
    if (outcome) outcome.targetId = g.id;
  }
  for (const u of plan.updates) {
    const set: Partial<typeof goals.$inferInsert> = { ...u.set, updatedAt: new Date() };
    if (u.parent) set.parentGoalId = parentId(u.parent);
    await tx.update(goals).set(set).where(eq(goals.id, u.goalId));
  }
}

async function applyFeedback(tx: Db, plan: FeedbackPlan, runId: string, sourceSystem: string | null) {
  const ids = new Map<string, string>();
  for (let i = 0; i < plan.inserts.length; i += 500) {
    const inserted = await tx
      .insert(importedFeedback)
      .values(
        plan.inserts.slice(i, i + 500).map((f) => ({
          authorRef: tenantReviewerRef(f.authorId), // tier A: pseudonym, not the author's id
          recipientId: f.recipientId,
          givenAt: new Date(`${f.givenAt}T12:00:00.000Z`),
          content: f.text,
          sourceSystem: sourceSystem ?? "import",
          importRunId: runId,
          sourceKey: f.sourceKey,
        })),
      )
      .onConflictDoNothing({ target: importedFeedback.sourceKey })
      .returning({ id: importedFeedback.id, key: importedFeedback.sourceKey });
    for (const r of inserted) ids.set(r.key, r.id);
  }
  const keyByRow = new Map(plan.inserts.map((f) => [f.rowIndex, f.sourceKey]));
  for (const o of plan.outcomes) if (o.action === "create") o.targetId = ids.get(keyByRow.get(o.rowIndex)!) ?? null;
}

async function applyOrgChart(tx: Db, plan: OrgChartPlan) {
  const touched = new Set<string>();
  for (const m of plan.managers) {
    touched.add(m.userId);
    await tx.update(users).set({ managerId: m.managerId, updatedAt: new Date() }).where(eq(users.id, m.userId));
  }
  if (touched.size) await assertNoCycles(tx, touched);
}

// ── Retention ──────────────────────────────────────────

/**
 * Delete staged rows (personal data) once a run's retention has passed:
 * 30 days after commit, or 30 days after upload for runs never committed,
 * which are then marked failed. Runs and their reports stay as the audit
 * trail. Called from the conversation sweeper.
 */
export async function purgeExpiredImportRows(db: TenantDb, now = new Date()): Promise<number> {
  const expired = db.select({ id: importRuns.id }).from(importRuns).where(lt(importRuns.rowsPurgeAfter, now));
  const deleted = await db.delete(importRows).where(inArray(importRows.runId, expired)).returning({ id: importRows.id });
  await db
    .update(importRuns)
    .set({ status: "failed", error: "Staged rows expired before commit; upload the file again", updatedAt: now })
    .where(and(lt(importRuns.rowsPurgeAfter, now), notInArray(importRuns.status, ["committed", "failed"])));
  return deleted.length;
}
