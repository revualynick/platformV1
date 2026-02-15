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
} from "@revualy/db";
import { getOrgSession } from "@revualy/db";
import type { InteractionType, ChatPlatform } from "@revualy/shared";

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

    // Select questionnaire
    const questionnaire = selectQuestionnaire(availableQuestionnaires, interactionType);
    if (!questionnaire) {
      skipped++;
      continue;
    }

    // Calculate optimal send time
    const sendAt = calculateSendTime(
      now,
      user.timezone,
      prefs?.preferredInteractionTime ?? "10:00",
    );

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
        questionnaireId: questionnaire.id,
        scheduleEntryId: entry.id,
      },
      { delay },
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
  available: Array<{ id: string; category: string; source: string }>,
  interactionType: InteractionType,
): { id: string } | null {
  // Match questionnaire category to interaction type
  const matching = available.filter((q) => q.category === interactionType);

  if (matching.length === 0) {
    // Fallback: any active questionnaire
    return available.length > 0 ? available[0] : null;
  }

  // Prefer built-in, then custom, then imported
  const sorted = matching.sort((a, b) => {
    const priority: Record<string, number> = { built_in: 0, custom: 1, imported: 2 };
    return (priority[a.source] ?? 3) - (priority[b.source] ?? 3);
  });

  return sorted[0];
}

// ── Send time calculation ────────────────────────────────

function calculateSendTime(
  now: Date,
  userTimezone: string,
  preferredTime: string, // "HH:mm"
): Date {
  const [hours, minutes] = preferredTime.split(":").map(Number);

  // Simple timezone offset calculation
  // In production, use a proper timezone library (date-fns-tz, luxon)
  const sendAt = new Date(now);
  sendAt.setUTCHours(hours, minutes, 0, 0);

  // If the preferred time already passed today, schedule for tomorrow
  if (sendAt <= now) {
    sendAt.setUTCDate(sendAt.getUTCDate() + 1);
  }

  // Add slight jitter (0-15 min) so not everyone gets pinged at the same second
  const jitter = Math.floor(Math.random() * 15) * 60 * 1000;
  sendAt.setTime(sendAt.getTime() + jitter);

  return sendAt;
}
