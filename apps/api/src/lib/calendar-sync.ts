import { eq, and, sql } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import {
  calendarTokens,
  calendarEvents,
  users,
  userRelationships,
} from "@revualy/db";
import { decrypt, encrypt, isEncryptionConfigured } from "@revualy/shared";
import {
  fetchCalendarEvents,
  refreshAccessToken,
} from "./google-calendar.js";

/**
 * Sync calendar events for a user. Refreshes token if expired,
 * fetches events, upserts into calendar_events, and infers relationships.
 */
export async function syncCalendarForUser(
  db: TenantDb,
  userId: string,
): Promise<{ synced: number; relationships: number }> {
  // 1. Get the user's Google calendar token
  const [token] = await db
    .select()
    .from(calendarTokens)
    .where(
      and(
        eq(calendarTokens.userId, userId),
        eq(calendarTokens.provider, "google"),
      ),
    );

  if (!token) return { synced: 0, relationships: 0 };

  // 2. Decrypt stored tokens
  const decryptIfNeeded = (val: string) =>
    isEncryptionConfigured() ? decrypt(val) : val;
  const encryptIfNeeded = (val: string) =>
    isEncryptionConfigured() ? encrypt(val) : val;

  // 3. Refresh token if expired
  let accessToken = decryptIfNeeded(token.accessToken);
  if (token.expiresAt <= new Date()) {
    const refreshed = await refreshAccessToken(decryptIfNeeded(token.refreshToken));
    accessToken = refreshed.accessToken;

    await db
      .update(calendarTokens)
      .set({
        accessToken: encryptIfNeeded(refreshed.accessToken),
        expiresAt: refreshed.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(calendarTokens.id, token.id));
  }

  // 3. Fetch events from Google
  const events = await fetchCalendarEvents(accessToken);

  // 4. Upsert events into calendar_events
  for (const event of events) {
    await db
      .insert(calendarEvents)
      .values({
        userId,
        externalEventId: event.externalEventId,
        title: event.title,
        attendees: event.attendees,
        startAt: event.startAt,
        endAt: event.endAt,
        source: "google",
      })
      .onConflictDoUpdate({
        target: [calendarEvents.userId, calendarEvents.externalEventId],
        set: {
          title: event.title,
          attendees: event.attendees,
          startAt: event.startAt,
          endAt: event.endAt,
        },
      });
  }

  // 5. Infer relationships from co-attendees
  // Get org user emails for matching
  const orgUsers = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.isActive, true));

  const emailToId = new Map(orgUsers.map((u) => [u.email.toLowerCase(), u.id]));

  // Count shared meetings per co-attendee
  const coAttendeeCounts = new Map<string, number>();
  for (const event of events) {
    for (const email of event.attendees) {
      const otherId = emailToId.get(email.toLowerCase());
      if (otherId && otherId !== userId) {
        coAttendeeCounts.set(otherId, (coAttendeeCounts.get(otherId) ?? 0) + 1);
      }
    }
  }

  // Create relationships for co-attendees with >= 2 shared meetings
  let relationshipsCreated = 0;
  for (const [otherId, count] of coAttendeeCounts) {
    if (count < 2) continue;

    // Check if relationship already exists
    const existing = await db
      .select()
      .from(userRelationships)
      .where(
        and(
          sql`((${userRelationships.fromUserId} = ${userId} AND ${userRelationships.toUserId} = ${otherId}) OR (${userRelationships.fromUserId} = ${otherId} AND ${userRelationships.toUserId} = ${userId}))`,
        ),
      );

    if (existing.length === 0) {
      await db.insert(userRelationships).values({
        fromUserId: userId,
        toUserId: otherId,
        label: "Calendar-inferred connection",
        tags: ["calendar"],
        strength: Math.min(1, count / 10),
        source: "calendar",
      });
      relationshipsCreated++;
    }
  }

  return { synced: events.length, relationships: relationshipsCreated };
}
