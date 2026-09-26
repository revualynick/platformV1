import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import { calendarEvents, users } from "@revualy/db";

/**
 * Meeting-anchored check-ins (Nick, 2026-09-26): "You were on a call with
 * Jon on Wednesday, how did it go? Did you feel he contributed?" A question
 * about a specific meeting gets specific feedback.
 *
 * Only meetings both people actually attended are used: group meetings in
 * the last week, at least ten minutes long, not declined by either, not
 * marked private or confidential. Titles are used only when they are safe
 * (never for 1:1s, never when they look personal, HR-related or
 * confidential); otherwise the label is generic ("your call with Jon on
 * Wednesday").
 */

export const ANCHOR_LOOKBACK_DAYS = 7;
const MIN_MINUTES = 10;

type CalendarEvent = typeof calendarEvents.$inferSelect;

/** Words that make a title unsafe to repeat back. Deliberately broad: a false positive only costs specificity. */
const SENSITIVE_TITLE =
  /\b(hr|people team|disciplinary|grievance|investigation|performance review|performance improvement|pip|probation|appraisal|salary|pay|compensation|bonus|promotion|redundan\w*|restructur\w*|termination|dismissal|exit interview|offboarding|resignation|leaver\w*|leaving|notice|interview|candidate|hiring|medical|doctor|dentist|gp|therapy|counsell?ing|health|sick|leave|maternity|paternity|personal|private|confidential|legal|lawyer|complaint|1:1|1-1|one[- ]to[- ]one|1on1|catch[- ]?up with)\b/i;

/** True when free text (a title, or the calendar model's focus) touches a sensitive subject. */
export function looksSensitive(text: string): boolean {
  return SENSITIVE_TITLE.test(text);
}

/** The title when it is safe to repeat in a chat message, else null. */
export function safeMeetingTitle(title: string, attendeeCount: number): string | null {
  const t = title.trim().replace(/\s+/g, " ");
  if (!t || t === "(No title)") return null;
  if (attendeeCount < 3) return null; // a two-person meeting is a 1:1 whatever it is called
  if (SENSITIVE_TITLE.test(t)) return null;
  if (t.length > 60) return null;
  return t;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "on Wednesday", "yesterday", "earlier today", in the reviewer's timezone. */
export function whenLabel(startAt: Date, now: Date, timeZone: string): string {
  const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const dayMs = 24 * 60 * 60 * 1000;
  if (day(startAt) === day(now)) return "earlier today";
  if (day(startAt) === day(new Date(now.getTime() - dayMs))) return "yesterday";
  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long" }).format(startAt);
  return WEEKDAYS.includes(weekday) ? `on ${weekday}` : `on ${day(startAt)}`;
}

/**
 * The meeting a check-in opens with, re-checked at send time (a decline
 * may have arrived since scheduling): the scheduled one if still usable,
 * else the most recent usable shared meeting, else none.
 */
export async function resolveAnchor(
  db: TenantDb,
  reviewerId: string,
  subjectId: string,
  preferredEventId: string | null | undefined,
  now: Date = new Date(),
): Promise<CalendarEvent | null> {
  const people = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.id, [reviewerId, subjectId]));
  const emails = [reviewerId, subjectId].map((id) => people.find((p) => p.id === id)?.email);
  if (emails.some((e) => !e)) return null;
  if (preferredEventId) {
    const [event] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, preferredEventId));
    if (event && event.userId === reviewerId && event.endAt < now && usable(event, emails as string[])) return event;
  }
  return findSharedMeeting(db, reviewerId, subjectId, now);
}

/**
 * How the meeting is described to the reviewer. `allowTitle: false` forces
 * the generic label (the calendar model judged the title unsafe to repeat).
 */
export function meetingLabel(
  event: Pick<CalendarEvent, "title" | "attendees" | "startAt">,
  subjectFirstName: string,
  now: Date,
  timeZone: string,
  opts: { allowTitle?: boolean } = {},
): string {
  const title = opts.allowTitle === false ? null : safeMeetingTitle(event.title, event.attendees.length);
  const when = whenLabel(event.startAt, now, timeZone);
  return title ? `the "${title}" call ${when}` : `your call with ${subjectFirstName} ${when}`;
}

/** Whether a meeting can anchor a check-in for everyone in `emails` (recency is checked by the callers' queries). */
export function usable(
  event: Pick<CalendarEvent, "attendees" | "declined" | "visibility" | "startAt" | "endAt">,
  emails: string[],
): boolean {
  const lower = (xs: string[]) => xs.map((x) => x.toLowerCase());
  const attendees = lower(event.attendees);
  const declined = lower(event.declined);
  const minutes = (event.endAt.getTime() - event.startAt.getTime()) / 60_000;
  return (
    event.visibility !== "private" &&
    event.visibility !== "confidential" &&
    minutes >= MIN_MINUTES &&
    attendees.length >= 2 &&
    emails.every((e) => attendees.includes(e.toLowerCase()) && !declined.includes(e.toLowerCase()))
  );
}

/** The reviewer's recent meetings, newest first (their own calendar only). */
export async function recentMeetings(db: TenantDb, reviewerId: string, now: Date): Promise<CalendarEvent[]> {
  const since = new Date(now.getTime() - ANCHOR_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.userId, reviewerId), gte(calendarEvents.startAt, since), lt(calendarEvents.endAt, now)))
    .orderBy(desc(calendarEvents.startAt))
    .limit(200);
}

/** The most recent meeting both attended, if any. */
export async function findSharedMeeting(
  db: TenantDb,
  reviewerId: string,
  subjectId: string,
  now: Date = new Date(),
): Promise<CalendarEvent | null> {
  const people = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.id, [reviewerId, subjectId]));
  const reviewer = people.find((p) => p.id === reviewerId);
  const subject = people.find((p) => p.id === subjectId);
  if (!reviewer || !subject) return null;
  const events = await recentMeetings(db, reviewerId, now);
  return events.find((e) => usable(e, [reviewer.email, subject.email])) ?? null;
}

/**
 * A colleague to ask about, chosen from recent shared meetings: the most
 * recent meeting's attendees first, skipping people reviewed recently.
 * Null when there is no usable meeting (the scheduler falls back to
 * relationship strength).
 */
export async function pickSubjectFromMeetings(
  db: TenantDb,
  reviewerId: string,
  avoid: ReadonlySet<string>,
  now: Date = new Date(),
): Promise<{ subjectId: string; event: CalendarEvent } | null> {
  const [reviewer] = await db.select({ email: users.email }).from(users).where(eq(users.id, reviewerId));
  if (!reviewer) return null;
  const events = await recentMeetings(db, reviewerId, now);
  if (!events.length) return null;
  const colleagues = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.isActive, true));
  const byEmail = new Map(colleagues.map((c) => [c.email.toLowerCase(), c.id]));
  for (const event of events) {
    for (const email of event.attendees) {
      const id = byEmail.get(email.toLowerCase());
      if (!id || id === reviewerId || avoid.has(id)) continue;
      if (usable(event, [reviewer.email, email])) return { subjectId: id, event };
    }
  }
  return null;
}
