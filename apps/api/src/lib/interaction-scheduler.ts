import { eq, and, sql, gte, lte, desc } from "drizzle-orm";
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
} from "@revualy/db";
import type { InteractionType, ChatPlatform } from "@revualy/shared";
import { findBestSlot } from "./availability.js";
import { buildJobId } from "./job-ids.js";

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

    const target = prefs?.weeklyInteractionTarget ?? 2;
    const existing = scheduleByUser.get(user.id) ?? [];
    const remaining = target - existing.length;

    if (remaining <= 0) {
      skipped++;
      continue;
    }

    // Check quiet days
    const quietDays = prefs?.quietDays ?? [0, 6]; // default: weekends off
    const todayDay = now.getUTCDay();
    if (quietDays.includes(todayDay)) {
      skipped++;
      continue;
    }

    // Select interaction type (rotate: peer_review → self_reflection → peer_review)
    const interactionType = selectInteractionType(existing);

    // Select review subject (for peer reviews)
    let subjectId: string | null = null;
    if (interactionType === "peer_review" || interactionType === "three_sixty") {
      subjectId = await selectReviewSubject(db, orgId, user.id);
      if (!subjectId) {
        skipped++;
        continue;
      }
    } else {
      // Self-reflection: subject is self
      subjectId = user.id;
    }

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

    // Create schedule entry
    const [entry] = await db
      .insert(interactionSchedule)
      .values({
        userId: user.id,
        scheduledAt: sendAt,
        interactionType,
        subjectId,
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
      },
      { delay, jobId: buildJobId("initiate", entry.id) },
    );

    scheduled++;
  }

  return { scheduled, skipped };
}

// ── Interaction type selection ───────────────────────────

function selectInteractionType(
  existing: Array<{ interactionType: string }>,
): InteractionType {
  const typeCounts = new Map<string, number>();
  existing.forEach((e) => {
    typeCounts.set(e.interactionType, (typeCounts.get(e.interactionType) ?? 0) + 1);
  });

  // Prefer peer_review, mix in self_reflection every other time
  const peerCount = typeCounts.get("peer_review") ?? 0;
  const selfCount = typeCounts.get("self_reflection") ?? 0;

  if (selfCount === 0 && peerCount > 0) return "self_reflection";
  return "peer_review";
}

// ── Subject selection ────────────────────────────────────

/**
 * Pick the best review subject for a user.
 * Prioritizes: strongest connections that haven't been reviewed recently.
 */
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

  // Fix 2: guard against malformed preferredTime (e.g. "10" → minutes=NaN).
  const parts = preferredTime.split(":");
  let hours = Number(parts[0]);
  let minutes = Number(parts[1]);
  if (
    Number.isNaN(hours) || Number.isNaN(minutes) ||
    hours < 0 || hours > 23 || minutes < 0 || minutes > 59
  ) {
    console.warn(
      `[Scheduler] Invalid preferredTime "${preferredTime}" for user — defaulting to 10:00`,
    );
    hours = 10;
    minutes = 0;
  }

  const tz = userTimezone && userTimezone.length > 0 ? userTimezone : "UTC";

  // Fix 1: convert preferredTime (wall-clock in the user's zone) to a UTC instant
  // using Intl APIs only — independent of the Node process's local timezone.
  // We read today's calendar date in the zone, build the desired wall-clock
  // instant as a fake-UTC timestamp, then subtract the zone's offset to get
  // the true UTC send time. If that instant is already past, we advance by
  // one calendar day *in the zone* (re-derive parts from now+24 h) rather
  // than blindly adding 86 400 s, which would be wrong across DST boundaries.
  let sendAt: Date;
  try {
    const offset = zoneOffsetMs(now, tz);
    const { year, month, day } = zoneParts(now, tz);
    // Wall-clock instant for today's preferred time, treated as if UTC
    const wallClockAsUtc = Date.UTC(year, month, day, hours, minutes, 0);
    // Subtract offset to get the true UTC instant
    sendAt = new Date(wallClockAsUtc - offset);

    if (sendAt <= now) {
      // Advance by one calendar day in the zone
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowOffset = zoneOffsetMs(tomorrow, tz);
      const { year: ty, month: tm, day: td } = zoneParts(tomorrow, tz);
      const tomorrowWall = Date.UTC(ty, tm, td, hours, minutes, 0);
      sendAt = new Date(tomorrowWall - tomorrowOffset);
    }
  } catch {
    // Invalid timezone string — fall back to treating preferredTime as UTC.
    sendAt = new Date(now);
    sendAt.setUTCHours(hours, minutes, 0, 0);
    if (sendAt <= now) {
      sendAt.setUTCDate(sendAt.getUTCDate() + 1);
    }
  }

  // Add slight jitter (0-15 min) so not everyone gets pinged at the same second
  const jitter = Math.floor(Math.random() * 15) * 60 * 1000;
  sendAt.setTime(sendAt.getTime() + jitter);

  return sendAt;
}
