import { and, eq, inArray, lt, ne, notInArray, or } from "drizzle-orm";
import type { LLMGateway } from "@revualy/ai-core";
import type { TenantDb, TicketType } from "@revualy/db";
import {
  betweenMeetingGoals,
  checkinJobs,
  conversations,
  goals,
  oneOnOneActionItems,
  oneOnOneSessions,
  profileDevelopmentGoals,
  questionnaires,
  questionnaireThemes,
  tickets,
  users,
} from "@revualy/db";
import type { InteractionType } from "@revualy/shared";
import { meetingLabel, resolveAnchor } from "../meeting-anchor.js";
import { proposeTicketContext } from "./agent.js";
import { TICKET_TTL_MS, serialiseContext, type TicketContext } from "./context.js";
import { decideTicketItems, ticketTypeFor, type AcceptedItem, type Category, type GateResult } from "./policy.js";

/**
 * The job side of the air gap. Runs with database access and trusted
 * inputs only (no live chat), and is the only code that writes a ticket's
 * context. Every item goes through the policy gate; the content of each
 * accepted item is fetched here, scoped to the ticket's own people.
 */

type Tx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];
type Logger = Pick<Console, "warn">;

export interface PrepareParams {
  reviewerId: string;
  subjectId: string;
  interactionType: InteractionType;
  questionnaireId: string;
  /** Shared meeting chosen at scheduling; re-checked now. */
  anchorEventId?: string | null;
  /** The calendar model's job: its focus and title judgement apply only if its meeting is still the anchor. */
  checkinJobId?: string | null;
  now?: Date;
}

export interface PrepareOptions {
  /** The job agent's model. Absent: the deterministic default. */
  agent?: Pick<LLMGateway, "complete">;
  logger?: Logger;
}

/** The ticket, plus the conversation-row facts initiation needs (no content beyond the ticket's). */
export interface PreparedTicket {
  ticketId: string;
  context: TicketContext;
  selectedThemeIds: string[];
  anchorEventId: string | null;
  gate: GateResult;
  preparedBy: "agent" | "default";
}

function firstName(name: string | null | undefined, fallback: string): string {
  return (name ?? "").trim().split(/\s+/)[0] || fallback;
}

export async function prepareTicket(db: TenantDb, params: PrepareParams, opts: PrepareOptions = {}): Promise<PreparedTicket> {
  const now = params.now ?? new Date();
  const logger = opts.logger ?? console;
  const type = ticketTypeFor(params.interactionType);

  const [[questionnaire], themeRows, [reviewer], [subject]] = await Promise.all([
    db.select().from(questionnaires).where(eq(questionnaires.id, params.questionnaireId)),
    db
      .select()
      .from(questionnaireThemes)
      .where(eq(questionnaireThemes.questionnaireId, params.questionnaireId))
      .orderBy(questionnaireThemes.sortOrder),
    db.select().from(users).where(eq(users.id, params.reviewerId)),
    db.select().from(users).where(eq(users.id, params.subjectId)),
  ]);
  if (!questionnaire) throw Object.assign(new Error("Questionnaire not found"), { statusCode: 404 });
  if (!reviewer) throw Object.assign(new Error("Reviewer not found"), { statusCode: 404 });
  if (!subject) throw Object.assign(new Error("Subject not found"), { statusCode: 404 });

  // 2-3 themes per conversation (not all of them every time).
  const maxThemes = Math.min(themeRows.length, params.interactionType === "self_reflection" ? 3 : 2);
  const selected = themeRows.slice(0, maxThemes);

  const reviewerFirst = firstName(reviewer.name, "there");
  const subjectFirst = type === "peer_checkin" ? firstName(subject.name, "your colleague") : reviewerFirst;

  // The meeting to open with, for peer check-ins (re-checked at send time).
  let anchorEventId: string | null = null;
  let label: string | null = null;
  let focus: string | null = null;
  const notes: string[] = [];
  if (type === "peer_checkin") {
    const anchor = await resolveAnchor(db, params.reviewerId, params.subjectId, params.anchorEventId, now);
    const [job] =
      anchor && params.checkinJobId
        ? await db
            .select({ anchorEventId: checkinJobs.anchorEventId, subjectId: checkinJobs.subjectId, titleSafe: checkinJobs.titleSafe, focus: checkinJobs.focus, reason: checkinJobs.reason })
            .from(checkinJobs)
            .where(and(eq(checkinJobs.id, params.checkinJobId), eq(checkinJobs.reviewerId, params.reviewerId)))
        : [];
    // The job counts only while its meeting is still the anchor; its focus
    // only when the title may be repeated too.
    const jobApplies = Boolean(job && anchor && job.anchorEventId === anchor.id && job.subjectId === params.subjectId);
    if (anchor) {
      anchorEventId = anchor.id;
      label = meetingLabel(anchor, subjectFirst, now, reviewer.timezone, { allowTitle: jobApplies ? job.titleSafe : undefined });
      notes.push(`Meeting: ${label}`);
    }
    if (jobApplies && job.titleSafe && job.focus.trim()) focus = job.focus.trim();
    if (jobApplies) {
      if (job.reason.trim()) notes.push(`Why this meeting: ${job.reason.trim()}`);
      if (job.focus.trim()) notes.push(`Suggested focus: ${job.focus.trim()}`);
    }
  }

  const available = new Set<Category>(["themes", "angle"]);
  if (type === "peer_checkin") {
    available.add("subject_name");
    if (label) available.add("meeting");
    if (focus) available.add("meeting_focus");
  } else if (type === "personal_checkin") {
    available.add("own_goals");
    available.add("focus_areas");
  }

  const gate = await decide(db, type, available, [params.reviewerId, params.subjectId], opts, {
    reviewerFirstName: reviewerFirst,
    subjectFirstName: type === "peer_checkin" ? subjectFirst : null,
    storedNotes: notes,
  });

  const context = await buildContext(db, type, gate.result.accepted, {
    interactionType: params.interactionType,
    reviewerId: params.reviewerId,
    subjectId: params.subjectId,
    reviewerFirstName: reviewerFirst,
    subjectFirstName: subjectFirst,
    verbatim: questionnaire.verbatim ?? false,
    themes: selected.map((t) => ({ id: t.id, intent: t.intent, dataGoal: t.dataGoal, examplePhrasings: t.examplePhrasings })),
    meeting: label,
    meetingFocus: focus,
  });
  logDropped(logger, gate.result);

  const [row] = await db
    .insert(tickets)
    .values({
      ticketType: type,
      reviewerId: params.reviewerId,
      subjectId: params.subjectId,
      status: "prepared",
      context: serialiseContext(context),
      preparedBy: gate.preparedBy,
      gateLog: gate.result.dropped,
      expiresAt: new Date(now.getTime() + TICKET_TTL_MS),
    })
    .returning({ id: tickets.id });

  return {
    ticketId: row.id,
    context,
    selectedThemeIds: selected.map((t) => t.id),
    anchorEventId: context.meeting ? anchorEventId : null,
    gate: gate.result,
    preparedBy: gate.preparedBy,
  };
}

/**
 * A ticket for a conversation that started before tickets existed (still
 * open at deploy). Deterministic default, no job agent: built from the
 * conversation row as it was set up at initiation.
 */
export async function prepareTicketForConversation(db: TenantDb, conversationId: string, opts: { logger?: Logger; now?: Date } = {}): Promise<void> {
  const now = opts.now ?? new Date();
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  if (!conv) return;
  const interactionType = conv.interactionType as InteractionType;
  const type = ticketTypeFor(interactionType);
  const [people, themeRows, [questionnaire]] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [conv.reviewerId, conv.subjectId])),
    conv.selectedThemeIds.length ? db.select().from(questionnaireThemes).where(inArray(questionnaireThemes.id, conv.selectedThemeIds)) : Promise.resolve([]),
    conv.questionnaireId ? db.select({ verbatim: questionnaires.verbatim }).from(questionnaires).where(eq(questionnaires.id, conv.questionnaireId)) : Promise.resolve([]),
  ]);
  const reviewerFirst = firstName(people.find((p) => p.id === conv.reviewerId)?.name, "there");
  const subjectFirst = type === "peer_checkin" ? firstName(people.find((p) => p.id === conv.subjectId)?.name, "your colleague") : reviewerFirst;
  const byId = new Map(themeRows.map((t) => [t.id, t]));

  const available = new Set<Category>(["themes"]);
  if (type === "peer_checkin") {
    available.add("subject_name");
    if (conv.anchorLabel) available.add("meeting");
    if (conv.anchorFocus) available.add("meeting_focus");
  }
  const gate = await decide(db, type, available, [conv.reviewerId, conv.subjectId], {}, null);
  const context = await buildContext(db, type, gate.result.accepted, {
    interactionType,
    reviewerId: conv.reviewerId,
    subjectId: conv.subjectId,
    reviewerFirstName: reviewerFirst,
    subjectFirstName: subjectFirst,
    verbatim: questionnaire?.verbatim ?? false,
    // By position: a theme deleted since the conversation started is null.
    themes: conv.selectedThemeIds.map((id) => {
      const t = byId.get(id);
      return t ? { id: t.id, intent: t.intent, dataGoal: t.dataGoal, examplePhrasings: t.examplePhrasings } : null;
    }),
    meeting: conv.anchorLabel,
    meetingFocus: conv.anchorFocus,
  });
  await db
    .insert(tickets)
    .values({
      ticketType: type,
      reviewerId: conv.reviewerId,
      subjectId: conv.subjectId,
      conversationId,
      status: "open",
      context: serialiseContext(context),
      preparedBy: "default",
      gateLog: gate.result.dropped,
      expiresAt: new Date(now.getTime() + TICKET_TTL_MS),
    })
    // A concurrent turn may have made it first.
    .onConflictDoNothing();
}

async function decide(
  db: TenantDb,
  type: TicketType,
  available: Set<Category>,
  scopeIds: string[],
  opts: PrepareOptions,
  agentInput: { reviewerFirstName: string; subjectFirstName: string | null; storedNotes: string[] } | null,
): Promise<{ result: GateResult; preparedBy: "agent" | "default" }> {
  const everyone = await db.select({ id: users.id, name: users.name }).from(users);
  const inScopeNames = everyone.filter((u) => scopeIds.includes(u.id)).map((u) => u.name ?? "");
  const otherNames = everyone.filter((u) => !scopeIds.includes(u.id)).map((u) => u.name ?? "");
  let proposals = null;
  if (opts.agent && agentInput) {
    proposals = await proposeTicketContext(opts.agent, { type, available: [...available], ...agentInput }, { logger: opts.logger }).catch(() => null);
  }
  return {
    ...(() => {
      const result = decideTicketItems({ type, available, inScopeNames, otherNames }, proposals);
      return { result, preparedBy: proposals && !result.usedDefaults ? ("agent" as const) : ("default" as const) };
    })(),
  };
}

interface Facts {
  interactionType: InteractionType;
  reviewerId: string;
  subjectId: string;
  reviewerFirstName: string;
  subjectFirstName: string;
  verbatim: boolean;
  themes: TicketContext["themes"];
  meeting: string | null;
  meetingFocus: string | null;
}

/** Only accepted categories reach the context; each fetch is scoped to this ticket's people. */
async function buildContext(db: TenantDb, type: TicketType, accepted: AcceptedItem[], f: Facts): Promise<TicketContext> {
  const has = (c: Category) => accepted.some((a) => a.category === c);
  const items: TicketContext["items"] = [];
  if (has("own_goals")) {
    const rows = await db
      .select({ title: goals.title })
      .from(goals)
      .where(and(eq(goals.ownerId, f.reviewerId), inArray(goals.level, ["individual", "personal"]), notInArray(goals.status, ["achieved", "archived", "draft"])))
      .limit(5);
    for (const r of rows) items.push({ category: "own_goals", text: r.title });
  }
  if (has("focus_areas")) {
    const rows = await db
      .select({ dimension: profileDevelopmentGoals.dimension, direction: profileDevelopmentGoals.targetDirection })
      .from(profileDevelopmentGoals)
      .where(and(eq(profileDevelopmentGoals.userId, f.reviewerId), eq(profileDevelopmentGoals.status, "active")))
      .limit(5);
    for (const r of rows) items.push({ category: "focus_areas", text: `${r.direction} ${r.dimension}` });
  }
  if (has("pair_tasks") || has("pair_goals")) {
    const pair = [f.reviewerId, f.subjectId];
    if (has("pair_tasks")) {
      const rows = await db
        .select({ text: oneOnOneActionItems.text })
        .from(oneOnOneActionItems)
        .innerJoin(oneOnOneSessions, eq(oneOnOneSessions.id, oneOnOneActionItems.sessionId))
        .where(and(inArray(oneOnOneSessions.managerId, pair), inArray(oneOnOneSessions.employeeId, pair), ne(oneOnOneSessions.managerId, oneOnOneSessions.employeeId), eq(oneOnOneActionItems.completed, false)))
        .limit(10);
      for (const r of rows) items.push({ category: "pair_tasks", text: r.text });
    }
    if (has("pair_goals")) {
      const rows = await db
        .select({ text: betweenMeetingGoals.text })
        .from(betweenMeetingGoals)
        .where(
          and(
            eq(betweenMeetingGoals.status, "active"),
            or(
              and(eq(betweenMeetingGoals.ownerId, f.reviewerId), eq(betweenMeetingGoals.counterpartId, f.subjectId)),
              and(eq(betweenMeetingGoals.ownerId, f.subjectId), eq(betweenMeetingGoals.counterpartId, f.reviewerId)),
            ),
          ),
        )
        .limit(10);
      for (const r of rows) items.push({ category: "pair_goals", text: r.text });
    }
  }
  return {
    v: 1,
    type,
    interactionType: f.interactionType,
    reviewerFirstName: f.reviewerFirstName,
    subjectFirstName: type === "peer_checkin" && !has("subject_name") ? "your colleague" : f.subjectFirstName,
    verbatim: f.verbatim,
    themes: has("themes") ? f.themes : [],
    meeting: has("meeting") ? f.meeting : null,
    meetingFocus: has("meeting_focus") ? f.meetingFocus : null,
    angle: accepted.find((a) => a.category === "angle")?.text ?? null,
    items,
  };
}

function logDropped(logger: Logger, gate: GateResult) {
  for (const d of gate.dropped) logger.warn(`[TicketGate] dropped ${d.category} about ${d.about}: ${d.reason}`);
}

// ── Lifecycle (job side) ─────────────────────────────────

/** Bind a prepared ticket to its new conversation, in the conversation's own transaction. */
export async function attachTicket(tx: Tx, ticketId: string, conversationId: string): Promise<void> {
  await tx
    .update(tickets)
    .set({ conversationId, status: "open", updatedAt: new Date() })
    .where(and(eq(tickets.id, ticketId), eq(tickets.status, "prepared")));
}

/** A conversation ended without the chat side closing it (quiet, or "stop"). */
export async function markTicketDoneForConversation(tx: Tx, conversationId: string, outcome: "closed" | "incomplete", now = new Date()): Promise<void> {
  await tx
    .update(tickets)
    .set({ status: "done", outcome, doneAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + TICKET_TTL_MS) })
    .where(and(eq(tickets.conversationId, conversationId), inArray(tickets.status, ["prepared", "open"])));
}

/**
 * The sweeper's step: every ticket past its expiry is expired and its
 * context wiped, whatever state it was stuck in (prepared but never
 * attached, open on a conversation that died, done but never written back).
 */
export async function expireTickets(db: TenantDb, now = new Date()): Promise<number> {
  const rows = await db
    .update(tickets)
    .set({ status: "expired", context: "", updatedAt: now })
    .where(and(ne(tickets.status, "expired"), lt(tickets.expiresAt, now)))
    .returning({ id: tickets.id });
  return rows.length;
}

