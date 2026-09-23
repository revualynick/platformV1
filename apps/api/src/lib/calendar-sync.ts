import { eq, sql, inArray, or } from "drizzle-orm";
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

  // Create relationships for co-attendees with >= 2 shared meetings.
  // Batch the existence check into a single query (replaces N sequential
  // per-pair queries) to avoid N+1 DB round-trips.
  const qualifiedPairs = [...coAttendeeCounts.entries()].filter(([, c]) => c >= 2);
  let relationshipsCreated = 0;

  if (qualifiedPairs.length > 0) {
    // Fix 3: scope the existence check to only the candidate other-user IDs
    // so the query is bounded by this batch rather than the whole org.
    const otherIds = qualifiedPairs.map(([id]) => id);
    const existingRels = await db
      .select({
        fromUserId: userRelationships.fromUserId,
        toUserId: userRelationships.toUserId,
      })
      .from(userRelationships)
      .where(
        or(
          inArray(userRelationships.fromUserId, otherIds),
          inArray(userRelationships.toUserId, otherIds),
        ),
      );

    const existingSet = new Set(
      existingRels.map((r) =>
        [r.fromUserId, r.toUserId].sort().join("|"),
      ),
    );

    for (const [otherId, count] of qualifiedPairs) {
      const pairKey = [userId, otherId].sort().join("|");
      if (existingSet.has(pairKey)) continue;

      // In-run dedup via existingSet above; the uq_user_relationship_pair
      // constraint (migration 0031) backstops concurrent syncs landing on the
      // same directional pair — onConflictDoNothing makes those inserts no-ops.
      const inserted = await db
        .insert(userRelationships)
        .values({
          fromUserId: userId,
          toUserId: otherId,
          label: "Calendar-inferred connection",
          tags: ["calendar"],
          strength: Math.min(1, count / 10),
          source: "calendar",
        })
        .onConflictDoNothing({
          target: [userRelationships.fromUserId, userRelationships.toUserId],
        })
        .returning({ id: userRelationships.id });
      if (inserted.length > 0) relationshipsCreated++;
    }
  }

  return { synced: events.length, relationships: relationshipsCreated };
}
