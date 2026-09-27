import { eq, and, or, lt, sql, inArray, isNotNull } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import { users, checkInMeetings, calendarTokens } from "@revualy/db";
import { getOrgSettings, getReportingTree } from "@revualy/db/queries";
import type { LLMGateway } from "@revualy/ai-core";
import {
  getFreshGoogleAccessToken,
  fetchPastCheckInEvents,
  GOOGLE_DRIVE_SCOPE,
  type CheckInEvent,
} from "./google-calendar.js";
import {
  findMeetingDocs,
  exportDocText,
  type MeetingDocs,
  type TranscriptLookupEvent,
} from "./google-drive.js";
import { ingestMeetingDocuments } from "./one-on-one-ingestion.js";
import { effectiveMode } from "./ingestion-mode.js";

export {
  chunkTranscript,
  getCandidateGoals,
  mergeSegmentExtractions,
  type CandidateGoal,
  type ExtractedSuggestion,
} from "./one-on-one-ingestion.js";

/**
 * The hourly 1:1 pipeline. Finds 1:1s on managers' calendars (the title
 * marker as an explicit opt-in, or a two-person meeting between a manager
 * and a direct report), waits for Meet's Docs (Gemini notes, transcript),
 * then hands them to one-on-one-ingestion.ts.
 *
 * Mode, per manager (lib/ingestion-mode.ts): the admin sets the most
 * automatic mode allowed and a default; each manager may choose within it.
 * - automatic: a MeetingSource with admin-granted access (a service
 *   account) reads every manager's 1:1s. None is built yet: pass one in.
 * - semi_automatic: the manager's own Google token. Each found 1:1 waits
 *   for the manager's yes ("import this 1:1?") before anything is read.
 * - manual: no calendar reading at all; files are uploaded by hand.
 * After import, processing is the same in every mode.
 */

const DEFAULT_MARKER = "[Check-in]";
const TRANSCRIPT_GIVE_UP_DAYS = 7;
const TRANSCRIPT_MAX_ATTEMPTS = 168; // hourly cron × 7 days
// Processing attempts once a Doc exists (the counter is reset when the
// Doc is found). Keeps LLM retries bounded.
export const PROCESSING_MAX_ATTEMPTS = 5;
// A row left in "processing" this long was abandoned by a crashed worker.
const STALE_PROCESSING_MS = 60 * 60 * 1000;
const TRANSIENT_ERROR_CODES = new Set(["google_rate_limited", "network_error", "llm_error"]);
/** With only one of notes/transcript found, wait this long after the meeting for the other. */
export const DOC_SETTLE_MS = 2 * 60 * 60 * 1000;
const USER_BATCH = 5;

export type IngestionMode = "automatic" | "semi_automatic" | "manual";

/** Google-touching dependencies, injectable so tests can stub them. */
export interface CheckInGoogleDeps {
  getFreshAccessToken: typeof getFreshGoogleAccessToken;
  fetchPastCheckInEvents: typeof fetchPastCheckInEvents;
  findMeetingDocs: typeof findMeetingDocs;
  exportDocText: typeof exportDocText;
}

const defaultGoogleDeps: CheckInGoogleDeps = {
  getFreshAccessToken: getFreshGoogleAccessToken,
  fetchPastCheckInEvents,
  findMeetingDocs,
  exportDocText,
};

/**
 * Where 1:1s and their Docs come from. Each call returns null when this
 * user's data is not reachable (not connected, access revoked). The
 * semi-automatic source uses the manager's OAuth token; an automatic
 * source (Meet REST API conferenceRecords.smartNotes / transcripts under
 * domain-wide delegation, or a Drive folder shared with a service account)
 * implements the same interface.
 */
export interface MeetingSource {
  listPastEvents(user: { id: string; email: string }): Promise<CheckInEvent[] | null>;
  findMeetingDocs(userId: string, event: TranscriptLookupEvent): Promise<MeetingDocs | null>;
  exportDocText(userId: string, docId: string): Promise<string | null>;
}

/** The semi-automatic source: the manager's own token (calendar.readonly + drive.readonly). */
export function oauthMeetingSource(db: TenantDb, google: CheckInGoogleDeps = defaultGoogleDeps): MeetingSource {
  return {
    async listPastEvents(user) {
      const token = await google.getFreshAccessToken(db, user.id);
      return token ? google.fetchPastCheckInEvents(token.accessToken, null) : null;
    },
    async findMeetingDocs(userId, event) {
      const token = await google.getFreshAccessToken(db, userId);
      return token ? google.findMeetingDocs(token.accessToken, event) : null;
    },
    async exportDocText(userId, docId) {
      const token = await google.getFreshAccessToken(db, userId);
      return token ? google.exportDocText(token.accessToken, docId) : null;
    },
  };
}

interface Logger {
  log: (msg: string) => void;
}

const quietWarn = (logger: Logger): Pick<Console, "warn"> => ({ warn: (...args: unknown[]) => logger.log(args.map(String).join(" ")) });

// ── Pure helpers (unit-tested) ──────────────────────────

/** Coarse error classification stored in check_in_meetings.errorMessage. */
export function classifyPipelineError(err: unknown): string {
  const message = err instanceof Error ? err.message.toLowerCase() : "";
  if (message.includes("rate limit") || message.includes("quota"))
    return "google_rate_limited";
  if (
    message.includes("invalid_grant") ||
    message.includes("unauthorized") ||
    message.includes("401") ||
    message.includes("403")
  )
    return "google_auth_error";
  if (message.includes("export") || message.includes("drive"))
    return "transcript_export_failed";
  if (message.includes("llm") || message.includes("anthropic") || message.includes("model"))
    return "llm_error";
  if (message.includes("timeout") || message.includes("econn") || message.includes("network"))
    return "network_error";
  return "processing_failed";
}

export function matchesMarker(title: string, marker: string): boolean {
  return marker.length > 0 && title.toLowerCase().includes(marker.toLowerCase());
}

export interface SubjectCandidate {
  id: string;
  email: string;
  isActive: boolean;
}

/**
 * Resolve which user a check-in meeting is ABOUT. Attendee emails are
 * matched to active users; the organizer is excluded. One remaining
 * match wins; with several, prefer the single one inside the
 * organizer's reporting tree. Ambiguity resolves to null (skipped, not
 * guessed — wrong-subject suggestions would leak goal context across
 * people).
 */
export function resolveSubject(
  attendeeEmails: string[],
  organizerUserId: string,
  candidates: SubjectCandidate[],
  reportingTree: Set<string>,
): string | null {
  const byEmail = new Map(
    candidates.filter((c) => c.isActive).map((c) => [c.email.toLowerCase(), c.id]),
  );
  const matched = [
    ...new Set(
      attendeeEmails
        .map((e) => byEmail.get(e.toLowerCase()))
        .filter((id): id is string => !!id && id !== organizerUserId),
    ),
  ];
  if (matched.length === 1) return matched[0];
  if (matched.length > 1) {
    const inTree = matched.filter((id) => reportingTree.has(id));
    if (inTree.length === 1) return inTree[0];
  }
  return null;
}

export interface DetectionPerson extends SubjectCandidate {
  managerId: string | null;
}

export interface Detection {
  subjectUserId: string | null;
  detectedBy: "marker" | "pair";
}

/**
 * Is this event on the calendar owner's (manager's) calendar a 1:1?
 * - The title marker is an explicit opt-in: resolved as before.
 * - Otherwise: exactly two people (the owner and one other, rooms aside),
 *   the other an active direct report of the owner who did not decline.
 *   Private and confidential events are left alone.
 * Returns null when it is not a 1:1.
 */
export function detectOneOnOne(
  event: Pick<CheckInEvent, "title" | "attendees" | "declined" | "visibility" | "organizerEmail">,
  owner: { id: string; email: string },
  people: DetectionPerson[],
  marker: string,
  reportingTree: Set<string>,
): Detection | null {
  if (matchesMarker(event.title, marker)) {
    return { subjectUserId: resolveSubject(event.attendees, owner.id, people, reportingTree), detectedBy: "marker" };
  }
  if (event.visibility === "private" || event.visibility === "confidential") return null;

  const ownerEmail = owner.email.toLowerCase();
  const everyone = new Set(
    [...event.attendees, ...(event.organizerEmail ? [event.organizerEmail] : []), owner.email].map((e) => e.toLowerCase()),
  );
  if (everyone.size !== 2) return null;
  const otherEmail = [...everyone].find((e) => e !== ownerEmail)!;
  if ((event.declined ?? []).some((e) => e.toLowerCase() === otherEmail)) return null;
  const other = people.find((p) => p.isActive && p.email.toLowerCase() === otherEmail);
  if (!other || other.managerId !== owner.id) return null;
  return { subjectUserId: other.id, detectedBy: "pair" };
}

/**
 * Status of a newly found 1:1. Semi-automatic waits for the manager's
 * yes, except for marker meetings the manager organised themselves (the
 * marker is their opt-in). Automatic goes straight to waiting for Docs.
 */
export function initialStatus(
  mode: IngestionMode,
  detection: Detection,
  ownerOrganised: boolean,
): "awaiting_approval" | "pending_transcript" | "no_subject_match" {
  if (!detection.subjectUserId) return "no_subject_match";
  if (mode === "automatic") return "pending_transcript";
  return detection.detectedBy === "marker" && ownerOrganised ? "pending_transcript" : "awaiting_approval";
}

/**
 * Enough Docs to go? Both found, or one found and the meeting ended long
 * enough ago that the other is not coming (Meet makes them separately and
 * either feature may be off).
 */
export function docsReady(docs: MeetingDocs, eventStart: Date, now = new Date()): boolean {
  if (docs.notesDocId && docs.transcriptDocId) return true;
  if (!docs.notesDocId && !docs.transcriptDocId) return false;
  return now.getTime() - eventStart.getTime() >= DOC_SETTLE_MS;
}

// ── Poll + process orchestration ────────────────────────

export interface PipelineOptions {
  /** Automatic mode's admin-granted source. Without one, automatic mode does nothing. */
  automaticSource?: MeetingSource;
}

/**
 * One pipeline run: discover new 1:1s for every reachable manager (per
 * the org's mode), then advance pending meetings (find Docs, extract, store).
 */
export async function runCheckInPipeline(
  db: TenantDb,
  llm: LLMGateway,
  logger: Logger = console,
  google: CheckInGoogleDeps = defaultGoogleDeps,
  opts: PipelineOptions = {},
): Promise<{ discovered: number; processed: number }> {
  const settings = await getOrgSettings(db);
  const marker = settings?.checkInTitleMarker ?? DEFAULT_MARKER;
  // Each manager's own mode, within the admin's limit (lib/ingestion-mode.ts).
  // Automatic is only possible when a meeting source is actually supplied.
  const automaticAvailable = Boolean(opts.automaticSource);
  const limits = { maxMode: settings?.oneOnOneMaxMode, defaultMode: settings?.oneOnOneIngestionMode };
  const modeOf = async (ids: string[]): Promise<Map<string, IngestionMode>> => {
    if (ids.length === 0) return new Map();
    const rows = await db
      .select({ id: users.id, choice: users.oneOnOneIngestionMode })
      .from(users)
      .where(inArray(users.id, ids));
    return new Map(rows.map((r) => [r.id, effectiveMode(limits, r.choice, automaticAvailable)]));
  };

  // Semi-automatic: people who connected Google with Drive access, reading
  // with their own token.
  const tokenRows = await db
    .select({ userId: calendarTokens.userId, scopes: calendarTokens.scopes })
    .from(calendarTokens)
    .where(eq(calendarTokens.provider, "google"))
    .limit(500);
  const tokenOwners = tokenRows.filter((t) => t.scopes.includes(GOOGLE_DRIVE_SCOPE)).map((t) => t.userId);
  const tokenModes = await modeOf(tokenOwners);
  const semiOwners = tokenOwners.filter((id) => tokenModes.get(id) === "semi_automatic");

  const calendarSource = oauthMeetingSource(db, google);
  let discovered = await discoverMeetings(db, calendarSource, semiOwners, marker, "semi_automatic", logger);

  // Automatic: managers who chose it (or default to it), through the source.
  let automaticSource: MeetingSource | null = null;
  if (opts.automaticSource) {
    const managers = await managerIds(db);
    const managerModes = await modeOf(managers);
    const autoOwners = managers.filter((id) => managerModes.get(id) === "automatic");
    if (autoOwners.length > 0) {
      automaticSource = opts.automaticSource;
      discovered += await discoverMeetings(db, automaticSource, autoOwners, marker, "automatic", logger);
    }
  }

  let processed = 0;
  for (const meeting of await selectMeetingsToProcess(db, 50, ["calendar"])) {
    if (await processCheckInMeeting(db, llm, meeting, calendarSource, logger)) processed++;
  }
  if (opts.automaticSource) {
    for (const meeting of await selectMeetingsToProcess(db, 50, ["automatic"])) {
      if (await processCheckInMeeting(db, llm, meeting, opts.automaticSource, logger)) processed++;
    }
  }
  return { discovered, processed };
}

/** Active users with at least one active direct report. */
async function managerIds(db: TenantDb): Promise<string[]> {
  const rows = await db
    .selectDistinct({ managerId: users.managerId })
    .from(users)
    .where(and(eq(users.isActive, true), isNotNull(users.managerId)));
  return rows.map((r) => r.managerId!).filter(Boolean);
}

/** Find new 1:1s on these users' calendars and record them. Returns rows inserted. */
export async function discoverMeetings(
  db: TenantDb,
  source: MeetingSource,
  ownerIds: string[],
  marker: string,
  mode: IngestionMode,
  logger: Logger = console,
): Promise<number> {
  if (ownerIds.length === 0 || mode === "manual") return 0;
  const people = await db
    .select({ id: users.id, email: users.email, isActive: users.isActive, managerId: users.managerId })
    .from(users)
    .where(eq(users.isActive, true));
  const byId = new Map(people.map((p) => [p.id, p]));

  let discovered = 0;
  for (let i = 0; i < ownerIds.length; i += USER_BATCH) {
    const batch = ownerIds.slice(i, i + USER_BATCH);
    const results = await Promise.allSettled(
      batch.map(async (ownerId) => {
        const owner = byId.get(ownerId);
        if (!owner) return 0;
        const events = await source.listPastEvents(owner);
        if (!events || events.length === 0) return 0;

        const reportingTree = await getReportingTree(db, owner.id);
        let inserted = 0;
        for (const event of events) {
          const detection = detectOneOnOne(event, owner, people, marker, reportingTree);
          if (!detection) continue;
          const ownerOrganised = (event.organizerEmail ?? "").toLowerCase() === owner.email.toLowerCase();
          const rows = await db
            .insert(checkInMeetings)
            .values({
              organizerId: owner.id,
              subjectUserId: detection.subjectUserId,
              externalEventId: event.externalEventId,
              title: event.title.slice(0, 500),
              eventStart: event.startAt,
              source: mode === "automatic" ? "automatic" : "calendar",
              detectedBy: detection.detectedBy,
              status: initialStatus(mode, detection, ownerOrganised),
            })
            .onConflictDoNothing({ target: [checkInMeetings.organizerId, checkInMeetings.externalEventId] })
            .returning({ id: checkInMeetings.id });
          inserted += rows.length;
        }
        return inserted;
      }),
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled") discovered += r.value;
      else logger.log(`1:1 discovery failed for user ${batch[j]}: ${r.reason}`);
    }
  }
  if (discovered > 0) logger.log(`Discovered ${discovered} new 1:1 meetings`);
  return discovered;
}

type MeetingRow = typeof checkInMeetings.$inferSelect;

/**
 * Advance one meeting: find its Docs (may not exist yet), then export and
 * ingest. Returns true when the meeting was processed on this call.
 */
export async function processCheckInMeeting(
  db: TenantDb,
  llm: Pick<LLMGateway, "complete">,
  meeting: MeetingRow,
  source: MeetingSource,
  logger: Logger = console,
): Promise<boolean> {
  try {
    if (!meeting.subjectUserId) {
      await db.update(checkInMeetings).set({ status: "no_subject_match" }).where(eq(checkInMeetings.id, meeting.id));
      return false;
    }

    let docs: MeetingDocs = { notesDocId: meeting.notesDocId, transcriptDocId: meeting.transcriptDocId };
    if (!docsReady(docs, meeting.eventStart)) {
      const lookup: TranscriptLookupEvent = {
        externalEventId: meeting.externalEventId,
        title: meeting.title,
        eventStart: meeting.eventStart,
      };
      const found = await source.findMeetingDocs(meeting.organizerId, lookup);
      if (!found) return false; // disconnected: retry next run
      const merged: MeetingDocs = {
        notesDocId: docs.notesDocId ?? found.notesDocId,
        transcriptDocId: docs.transcriptDocId ?? found.transcriptDocId,
      };
      const newlyFound = merged.notesDocId !== docs.notesDocId || merged.transcriptDocId !== docs.transcriptDocId;
      docs = merged;
      if (!docsReady(docs, meeting.eventStart)) {
        // Give up on either signal: wall-clock age (Math.max guards against
        // clock skew) or a hard attempt ceiling.
        const ageDays = Math.max(0, (Date.now() - meeting.eventStart.getTime()) / (24 * 60 * 60 * 1000));
        const nothing = !docs.notesDocId && !docs.transcriptDocId;
        const giveUp = nothing && (ageDays > TRANSCRIPT_GIVE_UP_DAYS || meeting.attemptCount + 1 >= TRANSCRIPT_MAX_ATTEMPTS);
        await db
          .update(checkInMeetings)
          .set({
            notesDocId: docs.notesDocId,
            transcriptDocId: docs.transcriptDocId,
            attemptCount: meeting.attemptCount + 1,
            lastAttemptAt: new Date(),
            ...(giveUp && { status: "transcript_missing" }),
          })
          .where(eq(checkInMeetings.id, meeting.id));
        return false;
      }
      // Waiting used the attempt counter; processing gets its own budget.
      await db
        .update(checkInMeetings)
        .set({ notesDocId: docs.notesDocId, transcriptDocId: docs.transcriptDocId, ...(newlyFound && { attemptCount: 0 }) })
        .where(eq(checkInMeetings.id, meeting.id));
      if (newlyFound) meeting.attemptCount = 0;
    }

    await db
      .update(checkInMeetings)
      .set({ status: "processing", lastAttemptAt: new Date() })
      .where(eq(checkInMeetings.id, meeting.id));

    // Text lives in memory only for this call.
    const notes = docs.notesDocId ? await source.exportDocText(meeting.organizerId, docs.notesDocId) : null;
    const transcript = docs.transcriptDocId ? await source.exportDocText(meeting.organizerId, docs.transcriptDocId) : null;
    if (notes === null && transcript === null) {
      await db.update(checkInMeetings).set({ status: "pending_transcript" }).where(eq(checkInMeetings.id, meeting.id));
      return false;
    }

    const outcome = await ingestMeetingDocuments(
      db,
      llm,
      { id: meeting.id, managerId: meeting.organizerId, reportId: meeting.subjectUserId, eventStart: meeting.eventStart },
      { notes, transcript },
      quietWarn(logger),
    );
    logger.log(
      `Processed 1:1 ${meeting.id}: ${outcome.tasks} tasks, ${outcome.focusAreas} focus areas, ${outcome.suggestions} suggestions, ${outcome.withheld} withheld`,
    );
    return true;
  } catch (err) {
    // Store only a coarse error code: raw messages could echo API
    // responses containing meeting content. Detail goes to the logger only.
    const code = classifyPipelineError(err);
    const nextStatus = statusAfterFailure(code, meeting.attemptCount + 1);
    await db
      .update(checkInMeetings)
      .set({ status: nextStatus, errorMessage: code, lastAttemptAt: new Date(), attemptCount: meeting.attemptCount + 1 })
      .where(eq(checkInMeetings.id, meeting.id));
    logger.log(
      `1:1 processing failed for meeting ${meeting.id} [${code}] → ${nextStatus}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

/**
 * After a processing failure: transient errors (network, rate limit, LLM)
 * go back to pending_transcript for the next hourly run until the attempt
 * budget is spent; permanent errors (auth revoked, export failure) and
 * exhausted retries go to "failed", which is never selected again.
 */
export function statusAfterFailure(
  code: string,
  attemptsSoFar: number,
): "pending_transcript" | "failed" {
  if (!TRANSIENT_ERROR_CODES.has(code)) return "failed";
  return attemptsSoFar >= PROCESSING_MAX_ATTEMPTS ? "failed" : "pending_transcript";
}

/**
 * Meetings to work on this run: those waiting for Docs or a retry, plus
 * rows abandoned in "processing" by a crashed worker. "failed" and
 * "awaiting_approval" rows are never selected. Least recently attempted
 * first, so retries cannot crowd new meetings out of the batch.
 */
/**
 * Process one just-approved calendar 1:1 straight away (instead of at the
 * next hourly run). If the Gemini notes aren't attached yet it stays pending
 * and the hourly run picks it up as before.
 */
export async function processMeetingNow(
  db: TenantDb,
  llm: Pick<LLMGateway, "complete">,
  meetingId: string,
  logger: Logger = console,
  google: CheckInGoogleDeps = defaultGoogleDeps,
): Promise<boolean> {
  const [meeting] = await db
    .select()
    .from(checkInMeetings)
    .where(
      and(
        eq(checkInMeetings.id, meetingId),
        eq(checkInMeetings.source, "calendar"),
        eq(checkInMeetings.status, "pending_transcript"),
      ),
    );
  if (!meeting) return false;
  return processCheckInMeeting(db, llm, meeting, oauthMeetingSource(db, google), logger);
}

export async function selectMeetingsToProcess(
  db: TenantDb,
  limit = 50,
  sources: Array<"calendar" | "automatic"> = ["calendar", "automatic"],
) {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
  return db
    .select()
    .from(checkInMeetings)
    .where(
      and(
        inArray(checkInMeetings.source, sources),
        or(
          eq(checkInMeetings.status, "pending_transcript"),
          and(eq(checkInMeetings.status, "processing"), lt(checkInMeetings.lastAttemptAt, staleBefore)),
        ),
      ),
    )
    .orderBy(sql`${checkInMeetings.lastAttemptAt} asc nulls first`)
    .limit(limit);
}
