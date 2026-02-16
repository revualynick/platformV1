import { and, eq, gte, lte } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import { calendarEvents } from "@revualy/db";

interface TimeSlot {
  start: Date;
  end: Date;
}

/**
 * Find free time slots for a user on a given day.
 * Queries calendar_events and returns gaps between meetings.
 */
export async function findFreeSlots(
  db: TenantDb,
  userId: string,
  date: Date,
  workdayStart: number = 9, // 9 AM
  workdayEnd: number = 17,  // 5 PM
): Promise<TimeSlot[]> {
  const dayStart = new Date(date);
  dayStart.setUTCHours(workdayStart, 0, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setUTCHours(workdayEnd, 0, 0, 0);

  // Fetch all events for this user on the given day
  const events = await db
    .select({ startAt: calendarEvents.startAt, endAt: calendarEvents.endAt })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, userId),
        gte(calendarEvents.startAt, dayStart),
        lte(calendarEvents.endAt, dayEnd),
      ),
    )
    .orderBy(calendarEvents.startAt);

  // Find gaps between events
  const slots: TimeSlot[] = [];
  let cursor = dayStart;

  for (const event of events) {
    const eventStart = new Date(event.startAt);
    const eventEnd = new Date(event.endAt);

    // If there's a gap between cursor and this event's start
    if (cursor < eventStart) {
      const gapMinutes = (eventStart.getTime() - cursor.getTime()) / 60000;
      // Only include slots >= 15 min
      if (gapMinutes >= 15) {
        slots.push({ start: new Date(cursor), end: new Date(eventStart) });
      }
    }

    // Move cursor past this event
    if (eventEnd > cursor) {
      cursor = eventEnd;
    }
  }

  // Final gap to end of workday
  if (cursor < dayEnd) {
    const gapMinutes = (dayEnd.getTime() - cursor.getTime()) / 60000;
    if (gapMinutes >= 15) {
      slots.push({ start: new Date(cursor), end: new Date(dayEnd) });
    }
  }

  return slots;
}

/**
 * Score a time slot for interaction scheduling.
 * Prefers mid-morning (10-11 AM) and mid-afternoon (2-3 PM).
 */
export function scoreSlot(slot: TimeSlot): number {
  const hour = slot.start.getUTCHours();
  const durationMin = (slot.end.getTime() - slot.start.getTime()) / 60000;

  let score = 0;

  // Prefer mid-morning
  if (hour >= 10 && hour <= 11) score += 10;
  // Prefer mid-afternoon
  else if (hour >= 14 && hour <= 15) score += 8;
  // OK: late morning / early afternoon
  else if (hour >= 9 && hour <= 16) score += 5;
  // Penalize early/late
  else score += 1;

  // Bonus for longer slots (more buffer around meetings)
  if (durationMin >= 60) score += 3;
  else if (durationMin >= 30) score += 1;

  return score;
}

/**
 * Find the best time to schedule an interaction for a user.
 * Returns null if no free slots found.
 */
export async function findBestSlot(
  db: TenantDb,
  userId: string,
  date: Date,
): Promise<Date | null> {
  const slots = await findFreeSlots(db, userId, date);
  if (slots.length === 0) return null;

  // Score and sort
  const scored = slots
    .map((slot) => ({ slot, score: scoreSlot(slot) }))
    .sort((a, b) => b.score - a.score);

  // Pick the best slot, use the start time
  return scored[0].slot.start;
}
