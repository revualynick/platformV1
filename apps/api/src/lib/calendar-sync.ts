import { eq, sql } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import {
  calendarEvents,
  users,
  userRelationships,
} from "@revualy/db";
import {
  fetchCalendarEvents,
  getFreshGoogleAccessToken,
} from "./google-calendar.js";

/**
 * Sync calendar events for a user. Refreshes token if expired,
 * fetches events, upserts into calendar_events, and infers relationships.
 */
export async function syncCalendarForUser(
  db: TenantDb,
  userId: string,
): Promise<{ synced: number; relationships: number }> {
  // 1. Get a fresh access token (decrypts + refreshes if expired)
  const token = await getFreshGoogleAccessToken(db, userId);
  if (!token) return { synced: 0, relationships: 0 };

  // 2. Fetch events from Google
  const events = await fetchCalendarEvents(token.accessToken);

  // 4. Upsert events into calendar_events (batched)
  if (events.length > 0) {
    const BATCH = 50;
    for (let i = 0; i < events.length; i += BATCH) {
      const batch = events.slice(i, i + BATCH);
      await db
        .insert(calendarEvents)
        .values(
          batch.map((event) => ({
            userId,
            externalEventId: event.externalEventId,
            title: event.title,
            attendees: event.attendees,
            startAt: event.startAt,
            endAt: event.endAt,
            source: "google",
          })),
        )
        .onConflictDoUpdate({
          target: [calendarEvents.userId, calendarEvents.externalEventId],
          set: {
            title: sql`excluded.title`,
            attendees: sql`excluded.attendees`,
            startAt: sql`excluded.start_at`,
            endAt: sql`excluded.end_at`,
          },
        });
    }
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
        sql`((${userRelationships.fromUserId} = ${userId} AND ${userRelationships.toUserId} = ${otherId}) OR (${userRelationships.fromUserId} = ${otherId} AND ${userRelationships.toUserId} = ${userId}))`,
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
