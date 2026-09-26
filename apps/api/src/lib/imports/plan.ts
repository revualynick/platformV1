import crypto from "node:crypto";
import { findManagerCycles } from "./graph.js";
import type { FeedbackRow, GoalLevel, GoalRow, PersonRow, RowResult } from "./mapping.js";
import { matchChartPeople, type ChartPerson } from "./org-chart.js";

/**
 * Planning is pure: rows plus a snapshot of what exists give the operations
 * a commit would apply and the dry-run report. The dry run and the commit
 * both plan; commit refuses if its plan differs from the one the admin
 * approved (planHash), so what was approved is exactly what is written.
 */

export type ImportKind = "people" | "goals" | "feedback" | "org_chart";

export interface ImportReport {
  kind: ImportKind;
  generatedAt: string;
  counts: {
    total: number;
    /** Rows matched to something that already exists (updated + unchanged). */
    matched: number;
    created: number;
    updated: number;
    unchanged: number;
    skipped: number;
    invalid: number;
  };
  unmatchedPeople: Array<{ name?: string; email?: string; rows: number[]; reason: string }>;
  duplicates: Array<{ key: string; rows: number[] }>;
  managerCycles: string[][];
  lowConfidenceLines: Array<{ report: string; manager: string; applied: boolean }>;
  /** Row numbers are as a spreadsheet shows them (header is row 1); person order for charts. */
  rowErrors: Array<{ row: number; errors: string[] }>;
  teamsToCreate: string[];
  warnings: string[];
  /** Anything here stops approval. */
  blocking: string[];
  planHash: string;
}

export interface RowOutcome {
  rowIndex: number;
  status: "ready" | "invalid" | "skipped";
  action: "create" | "update" | "none" | null;
  error?: string;
  targetId?: string | null;
}

export interface UserSnap {
  id: string;
  email: string;
  name: string;
  teamId: string | null;
  managerId: string | null;
  jobTitle: string | null;
  startDate: string | null;
  role: string;
  isActive: boolean;
}

export interface TeamSnap {
  id: string;
  name: string;
}

export interface StagedTabularRow<T> {
  rowIndex: number;
  result: RowResult<T>;
}

const MAX_LISTED = 200;

function emptyReport(kind: ImportKind): ImportReport {
  return {
    kind,
    generatedAt: new Date().toISOString(),
    counts: { total: 0, matched: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, invalid: 0 },
    unmatchedPeople: [],
    duplicates: [],
    managerCycles: [],
    lowConfidenceLines: [],
    rowErrors: [],
    teamsToCreate: [],
    warnings: [],
    blocking: [],
    planHash: "",
  };
}

function finalise(report: ImportReport, outcomes: RowOutcome[], ops: unknown): ImportReport {
  report.counts.total = outcomes.length;
  for (const o of outcomes) {
    if (o.status === "invalid") report.counts.invalid++;
    else if (o.status === "skipped") report.counts.skipped++;
    else if (o.action === "create") report.counts.created++;
    else if (o.action === "update") report.counts.updated++;
    else report.counts.unchanged++;
  }
  report.counts.matched = report.counts.updated + report.counts.unchanged;
  if (report.rowErrors.length > MAX_LISTED) {
    report.warnings.push(`Only the first ${MAX_LISTED} row errors are listed`);
    report.rowErrors = report.rowErrors.slice(0, MAX_LISTED);
  }
  if (report.warnings.length > MAX_LISTED) report.warnings = report.warnings.slice(0, MAX_LISTED);
  report.planHash = crypto.createHash("sha256").update(JSON.stringify(ops)).digest("hex");
  return report;
}

function addUnmatched(report: ImportReport, entry: { name?: string; email?: string; reason: string }, row: number) {
  const existing = report.unmatchedPeople.find(
    (u) => u.email === entry.email && u.name === entry.name && u.reason === entry.reason,
  );
  if (existing) existing.rows.push(row);
  else if (report.unmatchedPeople.length < MAX_LISTED) report.unmatchedPeople.push({ ...entry, rows: [row] });
}

function invalid(report: ImportReport, outcomes: RowOutcome[], rowIndex: number, errors: string[]) {
  outcomes.push({ rowIndex, status: "invalid", action: null, error: errors.join("; ") });
  report.rowErrors.push({ row: rowIndex, errors });
}

/** Returns the first row with the same key, or null. `label` is what the report shows. */
function duplicateTracker(report: ImportReport) {
  const first = new Map<string, number>();
  const entries = new Map<string, ImportReport["duplicates"][number]>();
  return (key: string, rowIndex: number, label = key): number | null => {
    const seen = first.get(key);
    if (seen === undefined) {
      first.set(key, rowIndex);
      return null;
    }
    const entry = entries.get(key);
    if (entry) entry.rows.push(rowIndex);
    else {
      const created = { key: label, rows: [seen, rowIndex] };
      entries.set(key, created);
      report.duplicates.push(created);
    }
    return seen;
  };
}

/** Cycles that involve at least one edge this import changes, shown by label. */
function cyclesTouching(
  managerOf: Map<string, string | null>,
  changed: Set<string>,
  label: (id: string) => string,
): string[][] {
  return findManagerCycles(managerOf)
    .filter((c) => c.some((n) => changed.has(n)))
    .map((c) => c.map(label));
}

// ── People ─────────────────────────────────────────────

export interface PeoplePlan {
  outcomes: RowOutcome[];
  teamsToCreate: string[];
  creates: Array<{ rowIndex: number; email: string; name: string; teamName?: string; jobTitle?: string; startDate?: string; role: "employee" | "manager" }>;
  updates: Array<{ rowIndex: number; userId: string; set: { name?: string; teamName?: string; jobTitle?: string; startDate?: string } }>;
  /** Manager changes only, by email: resolved to ids at commit, after creates. */
  managers: Array<{ email: string; managerEmail: string }>;
  report: ImportReport;
}

/**
 * Upsert by email. Blank cells never clear a value, so a partial re-export
 * (a delta) cannot wipe data. Deactivated users are skipped, not revived.
 */
export function planPeople(rows: StagedTabularRow<PersonRow>[], users: UserSnap[], teams: TeamSnap[]): PeoplePlan {
  const report = emptyReport("people");
  const outcomes: RowOutcome[] = [];
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const byId = new Map(users.map((u) => [u.id, u]));
  const teamByName = new Map(teams.map((t) => [t.name.trim().toLowerCase(), t]));
  const isDuplicate = duplicateTracker(report);

  const candidates: Array<{ rowIndex: number; row: PersonRow }> = [];
  for (const { rowIndex, result } of rows) {
    if (!result.ok) {
      invalid(report, outcomes, rowIndex, result.errors);
      continue;
    }
    const first = isDuplicate(result.value.email, rowIndex);
    if (first !== null) {
      outcomes.push({ rowIndex, status: "skipped", action: null, error: `duplicate of row ${first}` });
      continue;
    }
    const existing = byEmail.get(result.value.email);
    if (existing && !existing.isActive) {
      outcomes.push({ rowIndex, status: "skipped", action: null, error: "user is deactivated", targetId: existing.id });
      report.warnings.push(`Row ${rowIndex}: ${result.value.email} is deactivated in Revualy; left unchanged`);
      continue;
    }
    candidates.push({ rowIndex, row: result.value });
  }

  const fileEmails = new Set(candidates.map((c) => c.row.email));
  const resolvable = (managerEmail: string) => {
    if (fileEmails.has(managerEmail)) return null;
    const m = byEmail.get(managerEmail);
    if (!m) return "manager is not in the file or in Revualy";
    if (!m.isActive) return "manager is deactivated";
    return null;
  };

  // Reporting graph by email: what exists, overlaid with this file.
  const managerOf = new Map<string, string | null>();
  for (const u of users) managerOf.set(u.email.toLowerCase(), u.managerId ? (byId.get(u.managerId)?.email.toLowerCase() ?? null) : null);
  const changedEdges = new Set<string>();
  const managers: PeoplePlan["managers"] = [];
  for (const { rowIndex, row } of candidates) {
    if (!row.managerEmail) continue;
    const problem = resolvable(row.managerEmail);
    if (problem) {
      addUnmatched(report, { email: row.managerEmail, reason: problem }, rowIndex);
      continue;
    }
    if (managerOf.get(row.email) !== row.managerEmail) {
      managerOf.set(row.email, row.managerEmail);
      changedEdges.add(row.email);
      managers.push({ email: row.email, managerEmail: row.managerEmail });
    }
  }
  report.managerCycles = cyclesTouching(managerOf, changedEdges, (e) => e);
  for (const c of report.managerCycles) report.blocking.push(`Manager cycle: ${[...c, c[0]].join(" -> ")}`);

  const hasReports = new Set(managers.map((m) => m.managerEmail));
  const teamsToCreate = new Map<string, string>();
  const creates: PeoplePlan["creates"] = [];
  const updates: PeoplePlan["updates"] = [];

  for (const { rowIndex, row } of candidates) {
    const teamKey = row.team?.toLowerCase();
    if (row.team && !teamByName.has(teamKey!) && !teamsToCreate.has(teamKey!)) teamsToCreate.set(teamKey!, row.team);
    const existing = byEmail.get(row.email);
    if (!existing) {
      creates.push({
        rowIndex,
        email: row.email,
        name: row.name,
        ...(row.team ? { teamName: row.team } : {}),
        ...(row.title ? { jobTitle: row.title } : {}),
        ...(row.startDate ? { startDate: row.startDate } : {}),
        role: hasReports.has(row.email) ? "manager" : "employee",
      });
      outcomes.push({ rowIndex, status: "ready", action: "create" });
      continue;
    }
    const set: PeoplePlan["updates"][number]["set"] = {};
    if (row.name !== existing.name) set.name = row.name;
    const currentTeam = existing.teamId ? teams.find((t) => t.id === existing.teamId)?.name.trim().toLowerCase() : undefined;
    if (row.team && teamKey !== currentTeam) set.teamName = row.team;
    if (row.title && row.title !== existing.jobTitle) set.jobTitle = row.title;
    if (row.startDate && row.startDate !== existing.startDate) set.startDate = row.startDate;
    const managerChanged = changedEdges.has(row.email);
    if (Object.keys(set).length > 0) updates.push({ rowIndex, userId: existing.id, set });
    const changed = Object.keys(set).length > 0 || managerChanged;
    outcomes.push({ rowIndex, status: "ready", action: changed ? "update" : "none", targetId: existing.id });
    if (hasReports.has(row.email) && existing.role === "employee") {
      report.warnings.push(`${row.email} will have direct reports but has the employee role; roles are not changed by imports`);
    }
  }

  report.teamsToCreate = [...teamsToCreate.values()];
  const plan = { teamsToCreate: report.teamsToCreate, creates, updates, managers };
  return { outcomes, ...plan, report: finalise(report, outcomes, plan) };
}

// ── Goals ──────────────────────────────────────────────

export interface GoalSnap {
  id: string;
  importKey: string | null;
  title: string;
  level: string;
  ownerId: string;
  description: string;
  progressPercent: number;
  targetDate: string | null;
  parentGoalId: string | null;
  status: string;
}

export type ParentRef = { importKey: string } | { goalId: string } | null;

export interface GoalsPlan {
  outcomes: RowOutcome[];
  /** Parents before children (org, team, individual, personal). */
  creates: Array<{
    rowIndex: number;
    importKey: string;
    level: GoalLevel;
    title: string;
    description: string;
    progressPercent: number;
    status: string;
    targetDate: string | null;
    ownerId: string;
    teamId: string | null;
    parent: ParentRef;
  }>;
  updates: Array<{
    rowIndex: number;
    goalId: string;
    set: { title?: string; description?: string; progressPercent?: number; status?: string; targetDate?: string };
    parent?: ParentRef;
  }>;
  report: ImportReport;
}

const PARENT_LEVEL: Record<GoalLevel, GoalLevel | null> = { org: null, team: "org", individual: "team", personal: null };
const LEVEL_ORDER: Record<GoalLevel, number> = { org: 0, team: 1, individual: 2, personal: 3 };

/** The source's own id when mapped, otherwise owner plus title. */
export function goalImportKey(row: GoalRow): string {
  const basis = row.externalId ? `ext\n${row.externalId}` : `own\n${row.ownerEmail}\n${row.title.trim().toLowerCase()}`;
  return `imp:${crypto.createHash("sha256").update(basis).digest("hex")}`;
}

/**
 * Goals attach to the Revualy ladder (org <- team <- individual; personal
 * stands alone). A parent is linked only when it resolves, uniquely, to a
 * goal one level up, in the file or already in Revualy; otherwise the goal
 * is imported without it and the report says why.
 */
export function planGoals(rows: StagedTabularRow<GoalRow>[], users: UserSnap[], goals: GoalSnap[]): GoalsPlan {
  const report = emptyReport("goals");
  const outcomes: RowOutcome[] = [];
  const byEmail = new Map(users.filter((u) => u.isActive).map((u) => [u.email.toLowerCase(), u]));
  const byKey = new Map(goals.filter((g) => g.importKey).map((g) => [g.importKey!, g]));
  const isDuplicate = duplicateTracker(report);

  const ready: Array<{ rowIndex: number; row: GoalRow; key: string; owner: UserSnap }> = [];
  for (const { rowIndex, result } of rows) {
    if (!result.ok) {
      invalid(report, outcomes, rowIndex, result.errors);
      continue;
    }
    const row = result.value;
    const owner = byEmail.get(row.ownerEmail);
    if (!owner) {
      invalid(report, outcomes, rowIndex, ["ownerEmail: no active user with this email"]);
      addUnmatched(report, { email: row.ownerEmail, reason: "goal owner not found" }, rowIndex);
      continue;
    }
    if (row.level === "team" && !owner.teamId) {
      invalid(report, outcomes, rowIndex, ["level: a team goal's owner must be in a team"]);
      continue;
    }
    const key = goalImportKey(row);
    const first = isDuplicate(key, rowIndex, `${row.ownerEmail}: ${row.title}`);
    if (first !== null) {
      outcomes.push({ rowIndex, status: "skipped", action: null, error: `duplicate of row ${first}` });
      continue;
    }
    ready.push({ rowIndex, row, key, owner });
  }

  const resolveParent = (row: GoalRow, rowIndex: number): ParentRef => {
    if (!row.parentTitle) return null;
    const want = PARENT_LEVEL[row.level];
    if (!want) {
      report.warnings.push(`Row ${rowIndex}: ${row.level} goals have no parent; parent ignored`);
      return null;
    }
    const title = row.parentTitle.trim().toLowerCase();
    const inFile = ready.filter((r) => r.row.title.trim().toLowerCase() === title);
    const inFileRight = inFile.filter((r) => r.row.level === want);
    if (inFileRight.length === 1) return { importKey: inFileRight[0].key };
    const existing = goals.filter((g) => g.title.trim().toLowerCase() === title && g.level === want);
    if (inFileRight.length === 0 && existing.length === 1) return { goalId: existing[0].id };
    if (inFileRight.length + existing.length > 1) {
      report.warnings.push(`Row ${rowIndex}: more than one ${want} goal has the parent title; imported without a parent`);
    } else if (inFile.length > 0) {
      report.warnings.push(`Row ${rowIndex}: the parent is not a ${want} goal (a ${row.level} goal's parent must be); imported without a parent`);
    } else {
      report.warnings.push(`Row ${rowIndex}: parent goal not found; imported without a parent`);
    }
    return null;
  };

  const creates: GoalsPlan["creates"] = [];
  const updates: GoalsPlan["updates"] = [];
  for (const { rowIndex, row, key, owner } of ready) {
    const parent = resolveParent(row, rowIndex);
    const status = row.progress === 100 ? "achieved" : undefined;
    const existing = byKey.get(key);
    if (!existing) {
      creates.push({
        rowIndex,
        importKey: key,
        level: row.level,
        title: row.title,
        description: row.description ?? "",
        progressPercent: row.progress ?? 0,
        status: status ?? "on_track",
        targetDate: row.dueDate ?? null,
        ownerId: owner.id,
        teamId: row.level === "personal" || row.level === "org" ? null : owner.teamId,
        parent,
      });
      outcomes.push({ rowIndex, status: "ready", action: "create" });
      continue;
    }
    const set: GoalsPlan["updates"][number]["set"] = {};
    if (row.title !== existing.title) set.title = row.title;
    if (row.description !== undefined && row.description !== existing.description) set.description = row.description;
    if (row.progress !== undefined && row.progress !== existing.progressPercent) set.progressPercent = row.progress;
    if (status && status !== existing.status) set.status = status;
    if (row.dueDate && row.dueDate !== existing.targetDate) set.targetDate = row.dueDate;
    if (existing.ownerId !== owner.id) {
      report.warnings.push(`Row ${rowIndex}: the goal's owner differs from Revualy's; owner not changed`);
    }
    // Only ever set a parent from the file, never clear one set in Revualy.
    const parentChanged =
      parent !== null && !("goalId" in parent && parent.goalId === existing.parentGoalId) && !("importKey" in parent && byKey.get(parent.importKey)?.id === existing.parentGoalId);
    const changed = Object.keys(set).length > 0 || parentChanged;
    if (changed) updates.push({ rowIndex, goalId: existing.id, set, ...(parentChanged ? { parent } : {}) });
    outcomes.push({ rowIndex, status: "ready", action: changed ? "update" : "none", targetId: existing.id });
  }
  creates.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.rowIndex - b.rowIndex);

  const plan = { creates, updates };
  return { outcomes, ...plan, report: finalise(report, outcomes, plan) };
}

// ── Historical feedback ────────────────────────────────

export interface FeedbackPlan {
  outcomes: RowOutcome[];
  inserts: Array<{ rowIndex: number; authorId: string; recipientId: string; givenAt: string; text: string; sourceKey: string }>;
  report: ImportReport;
}

export function feedbackSourceKey(row: FeedbackRow): string {
  const text = row.text.replace(/\s+/g, " ").trim();
  return crypto.createHash("sha256").update([row.authorEmail, row.recipientEmail, row.date, text].join("\n")).digest("hex");
}

/**
 * Author and recipient must already exist (deactivated is fine: history
 * about leavers is still history); nobody is created from feedback.
 * Already-imported feedback (same source key) is left alone.
 */
export function planFeedback(
  rows: StagedTabularRow<FeedbackRow>[],
  users: UserSnap[],
  existingKeys: Set<string>,
  now = new Date(),
): FeedbackPlan {
  const report = emptyReport("feedback");
  const outcomes: RowOutcome[] = [];
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const isDuplicate = duplicateTracker(report);
  const today = now.toISOString().slice(0, 10);
  const inserts: FeedbackPlan["inserts"] = [];

  for (const { rowIndex, result } of rows) {
    if (!result.ok) {
      invalid(report, outcomes, rowIndex, result.errors);
      continue;
    }
    const row = result.value;
    const author = byEmail.get(row.authorEmail);
    const recipient = byEmail.get(row.recipientEmail);
    const errors: string[] = [];
    if (!author) {
      errors.push("authorEmail: no user with this email");
      addUnmatched(report, { email: row.authorEmail, reason: "feedback author not found" }, rowIndex);
    }
    if (!recipient) {
      errors.push("recipientEmail: no user with this email");
      addUnmatched(report, { email: row.recipientEmail, reason: "feedback recipient not found" }, rowIndex);
    }
    if (row.date > today) errors.push("date: in the future");
    if (errors.length) {
      invalid(report, outcomes, rowIndex, errors);
      continue;
    }
    if (author!.id === recipient!.id) {
      outcomes.push({ rowIndex, status: "skipped", action: null, error: "author and recipient are the same person" });
      continue;
    }
    const sourceKey = feedbackSourceKey(row);
    // Label without the text: the report is stored in plaintext.
    const first = isDuplicate(sourceKey, rowIndex, `${row.authorEmail} -> ${row.recipientEmail} on ${row.date}`);
    if (first !== null) {
      outcomes.push({ rowIndex, status: "skipped", action: null, error: `duplicate of row ${first}` });
      continue;
    }
    if (existingKeys.has(sourceKey)) {
      outcomes.push({ rowIndex, status: "ready", action: "none" });
      continue;
    }
    inserts.push({ rowIndex, authorId: author!.id, recipientId: recipient!.id, givenAt: row.date, text: row.text, sourceKey });
    outcomes.push({ rowIndex, status: "ready", action: "create" });
  }
  // Hash the keys, not the text: the report is stored in plaintext.
  const ops = inserts.map((i) => [i.rowIndex, i.authorId, i.recipientId, i.sourceKey]);
  return { outcomes, inserts, report: finalise(report, outcomes, ops) };
}

// ── Org charts ─────────────────────────────────────────

export interface OrgChartPlan {
  outcomes: RowOutcome[];
  managers: Array<{ rowIndex: number; userId: string; managerId: string }>;
  report: ImportReport;
}

/**
 * Only reporting lines between two matched people are applied, and
 * low-confidence lines only when the admin accepts them. A chart never
 * clears a manager and never creates a person.
 */
export function planOrgChart(
  people: Array<ChartPerson & { rowIndex: number }>,
  users: UserSnap[],
  opts: { acceptLowConfidence: boolean },
): OrgChartPlan {
  const report = emptyReport("org_chart");
  const outcomes: RowOutcome[] = [];
  const matches = matchChartPeople(people, users);
  const byId = new Map(users.map((u) => [u.id, u]));
  const byRef = new Map(people.map((p) => [p.ref, p]));
  const userOfRef = new Map<string, string>();
  const isDuplicate = duplicateTracker(report);

  for (const p of people) {
    const m = matches.get(p.ref)!;
    if (m.userId === null) {
      addUnmatched(report, { name: p.name, ...(p.email ? { email: p.email } : {}), reason: m.reason }, p.rowIndex);
      continue;
    }
    if (isDuplicate(m.userId, p.rowIndex, byId.get(m.userId)?.email) === null) userOfRef.set(p.ref, m.userId);
  }

  const managerOf = new Map<string, string | null>(users.map((u) => [u.id, u.managerId]));
  const changed = new Set<string>();
  const managers: OrgChartPlan["managers"] = [];
  for (const p of people) {
    const userId = matches.get(p.ref)!.userId;
    if (!userId) {
      outcomes.push({ rowIndex: p.rowIndex, status: "skipped", action: null, error: "not matched to a user" });
      continue;
    }
    if (userOfRef.get(p.ref) !== userId) {
      outcomes.push({ rowIndex: p.rowIndex, status: "skipped", action: null, error: "the same user appears twice on the chart", targetId: userId });
      continue;
    }
    let action: RowOutcome["action"] = "none";
    const managerPerson = p.managerRef ? byRef.get(p.managerRef) : undefined;
    const managerId = p.managerRef ? userOfRef.get(p.managerRef) : undefined;
    if (managerPerson && !managerId) {
      report.warnings.push(`${p.name}: manager ${managerPerson.name} is not matched; line not applied`);
    }
    if (managerPerson && managerId) {
      const low = p.confidence === "low";
      const apply = !low || opts.acceptLowConfidence;
      if (low) report.lowConfidenceLines.push({ report: p.name, manager: managerPerson.name, applied: apply });
      if (apply && managerOf.get(userId) !== managerId) {
        managerOf.set(userId, managerId);
        changed.add(userId);
        managers.push({ rowIndex: p.rowIndex, userId, managerId });
        action = "update";
      }
    }
    outcomes.push({ rowIndex: p.rowIndex, status: "ready", action, targetId: userId });
  }
  report.managerCycles = cyclesTouching(managerOf, changed, (id) => byId.get(id)?.email ?? id);
  for (const c of report.managerCycles) report.blocking.push(`Manager cycle: ${[...c, c[0]].join(" -> ")}`);
  if (report.lowConfidenceLines.some((l) => !l.applied)) {
    report.warnings.push("Low-confidence lines are not applied unless you accept them when confirming the mapping");
  }
  return { outcomes, managers, report: finalise(report, outcomes, managers) };
}
