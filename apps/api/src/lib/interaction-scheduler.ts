import { eq, and, sql, gt, gte, lte, desc, isNotNull } from "drizzle-orm";
import type { Queue } from "bullmq";
import type { TenantDb } from "@revualy/db";
import {
  users,
  interactionSchedule,
  conversations,
  engagementScores,
  userRelationships,
  questionnaires,
  userPlatformIdentities,
  checkinJobs,
} from "@revualy/db";
import type { InteractionType, ChatPlatform } from "@revualy/shared";
import { findBestSlot } from "./availability.js";
import { buildJobId } from "./job-ids.js";
import { pickSubjectFromMeetings } from "./meeting-anchor.js";
import { weeklyQuota, type WeeklyQuota } from "./engagement-aggregation.js";
import { contactHold } from "./contact-guard.js";

/**
 * Run the daily scheduling pass for an org.
 * For each active user, checks if they need more interactions this week
 * and enqueues conversation jobs at optimal times.
 */
export async function runSchedulingPass(
  db: TenantDb,
  conversationQueue: Queue,
  orgId: string,
  defaultPlatform: ChatPlatform,
  /**
   * Optional proactive reach: find a DM address for someone who is not yet
   * reachable (Google Chat, after a domain-wide install). Returns null if
   * none exists.
   */
  discoverDm?: (userId: string) => Promise<string | null>,
): Promise<{ scheduled: number; skipped: number }> {
  let scheduled = 0;
  let skipped = 0;

  // 1. Get all active users with their preferences
  const activeUsers = await db
    .select()
    .from(users)
    .where(and(eq(users.isActive, true), eq(users.onboardingCompleted, true)));

  // 2. Current week boundaries (Monday-Sunday)
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sunday
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() + mondayOffset);
  weekStart.setUTCHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  // 3. Get this week's existing schedule entries for all users
  const existingSchedule = await db
    .select()
    .from(interactionSchedule)
    .where(
      and(
        gte(interactionSchedule.scheduledAt, weekStart),
        lte(interactionSchedule.scheduledAt, weekEnd),
      ),
    );

  const scheduleByUser = new Map<string, typeof existingSchedule>();
  existingSchedule.forEach((entry) => {
    const list = scheduleByUser.get(entry.userId) ?? [];
    list.push(entry);
    scheduleByUser.set(entry.userId, list);
  });

  // 4. Get available questionnaires
  const availableQuestionnaires = await db
    .select()
    .from(questionnaires)
    .where(eq(questionnaires.isActive, true));

  // 5. Process each user
  for (const user of activeUsers) {
    const prefs = user.preferences as {
      weeklyInteractionTarget?: number;
      preferredInteractionTime?: string;
      quietDays?: number[];
    } | null;

    const existing = scheduleByUser.get(user.id) ?? [];
    const interactionType = selectInteractionType(existing, weeklyQuota(user.preferences));
    if (!interactionType) {
      skipped++;
      continue;
    }

    const quietDays = prefs?.quietDays ?? [0, 6]; // default: weekends off


    // Select questionnaire (prefer team-scoped for this user's team)
    const questionnaire = selectQuestionnaire(availableQuestionnaires, interactionType, user.teamId);
    if (!questionnaire) {
      skipped++;
      continue;
    }

    // Calculate optimal send time (calendar-aware with fallback)
    const sendAt = await calculateSendTime(
      db,
      user.id,
      now,
      user.timezone,
      prefs?.preferredInteractionTime ?? "10:00",
    );

    // Quiet days apply to the day the message will actually arrive, in the
    // user's own timezone (not the day the pass happens to run).
    if (quietDays.includes(localWeekday(sendAt, user.timezone))) {
      skipped++;
      continue;
    }

    // Don't badger: a gap between check-ins, and no more this week after a rich one.
    if (await contactHold(db, user.id, sendAt, weekStart)) {
      skipped++;
      continue;
    }

    // Someone who said "stop" is not messaged until they say "start".
    if ((user.preferences as { chatPaused?: boolean } | null)?.chatPaused) {
      skipped++;
      continue;
    }

    // Where to DM them. Only people who are reachable and whose link is
    // trusted (auto-linked from their Google account, or confirmed by them
    // for a manual Slack/Teams link) are messaged: a wrong manual link
    // would send feedback questions about a colleague to the wrong person.
    const [identity] = await db
      .select({
        dmAddress: userPlatformIdentities.dmAddress,
        status: userPlatformIdentities.status,
        linkSource: userPlatformIdentities.linkSource,
        confirmedAt: userPlatformIdentities.confirmedAt,
      })
      .from(userPlatformIdentities)
      .where(
        and(
          eq(userPlatformIdentities.userId, user.id),
          eq(userPlatformIdentities.platform, defaultPlatform),
        ),
      );

    const trusted = identity && (identity.linkSource === "auto" || identity.confirmedAt !== null);
    let dmAddress =
      identity?.status === "reachable" && trusted ? identity.dmAddress : null;
    if (!dmAddress && !identity && discoverDm) {
      dmAddress = await discoverDm(user.id).catch((err) => {
        console.warn(`[Scheduler] DM discovery failed for user ${user.id}:`, err);
        return null;
      });
    }

    if (!dmAddress) {
      console.warn(
        `[Scheduler] Skipping user ${user.id}: not reachable on ${defaultPlatform}` +
          (identity && !trusted ? " (link awaiting confirmation)" : ""),
      );
      skipped++;
      continue;
    }

    // Select review subject (for peer reviews), last so a proposed job is
    // only claimed for someone who will actually be messaged.
    let subjectId: string | null = null;
    let anchorEventId: string | null = null;
    let checkinJobId: string | null = null;
    if (interactionType === "peer_review" || interactionType === "three_sixty") {
      const choice = await choosePeerSubject(db, orgId, user.id, now);
      if (!choice) {
        skipped++;
        continue;
      }
      ({ subjectId, anchorEventId, checkinJobId } = choice);
    } else {
      // Self-reflection: subject is self
      subjectId = user.id;
    }

    // Create schedule entry
    const [entry] = await db
      .insert(interactionSchedule)
      .values({
        userId: user.id,
        scheduledAt: sendAt,
        interactionType,
        subjectId,
        anchorEventId,
        status: "pending",
      })
      .returning();

    // Enqueue delayed conversation job
    const delay = Math.max(0, sendAt.getTime() - Date.now());
    await conversationQueue.add(
      "initiate",
      {
        type: "initiate",
        orgId,
        reviewerId: user.id,
        subjectId,
        interactionType,
        platform: defaultPlatform,
        channelId: dmAddress,
        questionnaireId: questionnaire.id,
        scheduleEntryId: entry.id,
        anchorEventId,
        // The job's focus stays in Postgres (encrypted); initiation loads it by id.
        checkinJobId,
      },
      { delay, jobId: buildJobId("initiate", entry.id) },
    );

    scheduled++;
  }

  return { scheduled, skipped };
}

// ── Interaction type selection ───────────────────────────

/**
 * What to schedule next this week within the quota: the one peer check-in
 * first, then personal ones; null when the week is full.
 */
export function selectInteractionType(
  existing: Array<{ interactionType: string }>,
  quota: WeeklyQuota,
): InteractionType | null {
  const count = (types: string[]) => existing.filter((e) => types.includes(e.interactionType)).length;
  if (count(["peer_review", "three_sixty"]) < quota.peer) return "peer_review";
  if (count(["self_reflection", "pulse_check"]) < quota.personal) return "self_reflection";
  return null;
}

// ── Subject selection ────────────────────────────────────

export interface PeerChoice {
  subjectId: string;
  anchorEventId: string | null;
  /** The calendar model's job this came from, now marked scheduled. */
  checkinJobId: string | null;
}

/**
 * Who a peer check-in is about, best source first: the calendar model's
 * highest-priority unexpired proposal (claimed, so it is used once); then a
 * colleague from a recent shared meeting (the rules layer); then the
 * strongest relationship. People reviewed recently are skipped.
 */
export async function choosePeerSubject(
  db: TenantDb,
  orgId: string,
  userId: string,
  now: Date = new Date(),
): Promise<PeerChoice | null> {
  const avoid = await recentSubjectIds(db, userId);
  const job = await claimCheckinJob(db, userId, avoid, now);
  if (job) return job;
  const anchored = await pickSubjectFromMeetings(db, userId, avoid, now);
  if (anchored) return { subjectId: anchored.subjectId, anchorEventId: anchored.event.id, checkinJobId: null };
  const subjectId = await selectReviewSubject(db, orgId, userId);
  return subjectId ? { subjectId, anchorEventId: null, checkinJobId: null } : null;
}

async function claimCheckinJob(
  db: TenantDb,
  userId: string,
  avoid: ReadonlySet<string>,
  now: Date,
): Promise<PeerChoice | null> {
  const candidates = await db
    .select({ id: checkinJobs.id, subjectId: checkinJobs.subjectId, anchorEventId: checkinJobs.anchorEventId })
    .from(checkinJobs)
    .where(
      and(
        eq(checkinJobs.reviewerId, userId),
        eq(checkinJobs.status, "proposed"),
        gt(checkinJobs.expiresAt, now),
        isNotNull(checkinJobs.subjectId),
      ),
    )
    .orderBy(desc(checkinJobs.priority), checkinJobs.createdAt)
    .limit(20);
  for (const c of candidates) {
    if (!c.subjectId || avoid.has(c.subjectId)) continue;
    // Conditional on still being proposed, so a job is never claimed twice.
    const [claimed] = await db
      .update(checkinJobs)
      .set({ status: "scheduled" })
      .where(and(eq(checkinJobs.id, c.id), eq(checkinJobs.status, "proposed")))
      .returning({ id: checkinJobs.id });
    if (claimed) return { subjectId: c.subjectId, anchorEventId: c.anchorEventId, checkinJobId: c.id };
  }
  return null;
}

/**
 * Pick the best review subject for a user.
 * Prioritizes: strongest connections that haven't been reviewed recently.
 */
/** People this reviewer was asked about in their last five conversations. */
async function recentSubjectIds(db: TenantDb, userId: string): Promise<Set<string>> {
  const recent = await db
    .select({ subjectId: conversations.subjectId })
    .from(conversations)
    .where(eq(conversations.reviewerId, userId))
    .orderBy(desc(conversations.createdAt))
    .limit(5);
  return new Set(recent.map((c) => c.subjectId));
}

async function selectReviewSubject(
  db: TenantDb,
  orgId: string,
  userId: string,
): Promise<string | null> {
  // Get user's relationships sorted by strength (strongest first)
  const relationships = await db
    .select()
    .from(userRelationships)
    .where(
      and(
        eq(userRelationships.isActive, true),
        sql`(${userRelationships.fromUserId} = ${userId} OR ${userRelationships.toUserId} = ${userId})`,
      ),
    )
    .orderBy(desc(userRelationships.strength));

  if (relationships.length === 0) {
    // Fallback: pick a random active user from the same team or org
    const [reviewer] = await db.select().from(users).where(eq(users.id, userId));
    if (!reviewer) return null;

    const teamFilter = reviewer.teamId
      ? and(eq(users.isActive, true), eq(users.teamId, reviewer.teamId))
      : eq(users.isActive, true);
    const candidates = await db
      .select()
      .from(users)
      .where(teamFilter);

    const others = candidates.filter((u) => u.id !== userId);
    if (others.length === 0) return null;
    return others[Math.floor(Math.random() * others.length)].id;
  }

  // Get recent conversations to avoid reviewing same person back-to-back
  const recentConversations = await db
    .select()
    .from(conversations)
    .where(eq(conversations.reviewerId, userId))
    .orderBy(desc(conversations.createdAt))
    .limit(5);

  const recentSubjects = new Set(recentConversations.map((c) => c.subjectId));

  // Find the strongest connection not recently reviewed
  for (const rel of relationships) {
    const otherId = rel.fromUserId === userId ? rel.toUserId : rel.fromUserId;
    if (!recentSubjects.has(otherId)) {
      return otherId;
    }
  }

  // If all strong connections were recently reviewed, pick the strongest anyway
  const first = relationships[0];
  return first.fromUserId === userId ? first.toUserId : first.fromUserId;
}

// ── Questionnaire selection ──────────────────────────────

function selectQuestionnaire(
  available: Array<{ id: string; category: string; source: string; teamScope: string | null }>,
  interactionType: InteractionType,
  userTeamId: string | null,
): { id: string } | null {
  // Match questionnaire category to interaction type
  const matching = available.filter((q) => q.category === interactionType);

  if (matching.length === 0) {
    // Fallback: any active questionnaire
    return available.length > 0 ? available[0] : null;
  }

  // Prefer team-scoped questionnaires for this user's team
  if (userTeamId) {
    const teamScoped = matching.filter((q) => q.teamScope === userTeamId);
    if (teamScoped.length > 0) return teamScoped[0];
  }

  // Fallback: prefer built-in, then custom, then imported
  const sorted = matching.sort((a, b) => {
    const priority: Record<string, number> = { built_in: 0, custom: 1, imported: 2 };
    return (priority[a.source] ?? 3) - (priority[b.source] ?? 3);
  });

  return sorted[0];
}

// ── Send time calculation ────────────────────────────────

/**
 * Returns the zone's UTC offset in ms for a given instant using only Intl APIs,
 * making it fully independent of the Node process's local timezone (Fix 1).
 *
 * Strategy: format the instant in the target zone to get its wall-clock
 * year/month/day/hour/minute/second, reinterpret those components as a UTC
 * timestamp, then diff against the original instant. That delta is the offset.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(instant)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour,
    +parts.minute,
    +parts.second,
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Extract wall-clock date parts for a given instant in the target timezone. */
function zoneParts(instant: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(instant)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  );
  return { year: +parts.year, month: +parts.month - 1, day: +parts.day };
}

async function calculateSendTime(
  db: TenantDb,
  userId: string,
  now: Date,
  userTimezone: string,
  preferredTime: string, // "HH:mm"
): Promise<Date> {
  // Try calendar-aware scheduling first
  try {
    const bestSlot = await findBestSlot(db, userId, now);
    if (bestSlot && bestSlot > now) {
      // Add slight jitter (0-5 min)
      const jitter = Math.floor(Math.random() * 5) * 60 * 1000;
      return new Date(bestSlot.getTime() + jitter);
    }
  } catch {
    // Calendar data unavailable — fall through to preferred time
  }

  const sendAt = nextPreferredSendTime(now, userTimezone, preferredTime);

  // Add slight jitter (0-15 min) so not everyone gets pinged at the same second
  const jitter = Math.floor(Math.random() * 15) * 60 * 1000;
  sendAt.setTime(sendAt.getTime() + jitter);

  return sendAt;
}

/**
 * The next time the user's preferred wall-clock time comes round in their
 * own timezone: today if it is still ahead, otherwise tomorrow. Uses Intl
 * only, so it is independent of the server's timezone and correct across
 * DST changes. Malformed times fall back to 10:00; invalid zones to UTC.
 */
export function nextPreferredSendTime(
  now: Date,
  userTimezone: string | null | undefined,
  preferredTime: string, // "HH:mm"
): Date {
  const parts = preferredTime.split(":");
  let hours = Number(parts[0]);
  let minutes = Number(parts[1]);
  if (
    Number.isNaN(hours) || Number.isNaN(minutes) ||
    hours < 0 || hours > 23 || minutes < 0 || minutes > 59
  ) {
    console.warn(`[Scheduler] Invalid preferredTime "${preferredTime}" for user, defaulting to 10:00`);
    hours = 10;
    minutes = 0;
  }

  const tz = userTimezone && userTimezone.length > 0 ? userTimezone : "UTC";
  try {
    const today = zoneParts(now, tz);
    let sendAt = new Date(
      Date.UTC(today.year, today.month, today.day, hours, minutes, 0) - zoneOffsetMs(now, tz),
    );
    if (sendAt <= now) {
      // Tomorrow in the zone: re-derive the date from now + 24 h rather than
      // adding 86,400 s, which is wrong across DST boundaries.
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const t = zoneParts(tomorrow, tz);
      sendAt = new Date(
        Date.UTC(t.year, t.month, t.day, hours, minutes, 0) - zoneOffsetMs(tomorrow, tz),
      );
    }
    return sendAt;
  } catch {
    // Invalid timezone string: treat preferredTime as UTC.
    const sendAt = new Date(now);
    sendAt.setUTCHours(hours, minutes, 0, 0);
    if (sendAt <= now) sendAt.setUTCDate(sendAt.getUTCDate() + 1);
    return sendAt;
  }
}

/** Day of week (0 = Sunday) of an instant in the given timezone. */
export function localWeekday(instant: Date, userTimezone: string | null | undefined): number {
  const tz = userTimezone && userTimezone.length > 0 ? userTimezone : "UTC";
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(instant);
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
  } catch {
    return instant.getUTCDay();
  }
}
