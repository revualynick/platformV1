import { eq, and, or, desc } from "drizzle-orm";
import {
  oneOnOneSessions,
  oneOnOneActionItems,
  oneOnOneAgendaItems,
} from "../schema/tenant.js";
import type { TenantDb } from "../tenant.js";

export async function getSessionsForPair(
  db: TenantDb,
  userId: string,
  opts?: { employeeId?: string; status?: string },
) {
  const conditions = [];

  if (opts?.employeeId) {
    // User is either the manager or employee in the pair
    conditions.push(
      or(
        and(
          eq(oneOnOneSessions.managerId, userId),
          eq(oneOnOneSessions.employeeId, opts.employeeId),
        ),
        and(
          eq(oneOnOneSessions.managerId, opts.employeeId),
          eq(oneOnOneSessions.employeeId, userId),
        ),
      )!,
    );
  } else {
    conditions.push(
      or(
        eq(oneOnOneSessions.managerId, userId),
        eq(oneOnOneSessions.employeeId, userId),
      )!,
    );
  }

  if (opts?.status) {
    conditions.push(eq(oneOnOneSessions.status, opts.status));
  }

  return db
    .select({
      id: oneOnOneSessions.id,
      managerId: oneOnOneSessions.managerId,
      employeeId: oneOnOneSessions.employeeId,
      status: oneOnOneSessions.status,
      scheduledAt: oneOnOneSessions.scheduledAt,
      startedAt: oneOnOneSessions.startedAt,
      endedAt: oneOnOneSessions.endedAt,
      notes: oneOnOneSessions.notes,
      summary: oneOnOneSessions.summary,
      createdAt: oneOnOneSessions.createdAt,
      updatedAt: oneOnOneSessions.updatedAt,
    })
    .from(oneOnOneSessions)
    .where(and(...conditions))
    .orderBy(desc(oneOnOneSessions.scheduledAt))
    .limit(50);
}

export async function getSessionDetail(db: TenantDb, sessionId: string) {
  const [session] = await db
    .select()
    .from(oneOnOneSessions)
    .where(eq(oneOnOneSessions.id, sessionId));

  if (!session) return null;

  const [agendaItems, actionItems] = await Promise.all([
    db
      .select()
      .from(oneOnOneAgendaItems)
      .where(eq(oneOnOneAgendaItems.sessionId, sessionId))
      .orderBy(oneOnOneAgendaItems.sortOrder),
    db
      .select()
      .from(oneOnOneActionItems)
      .where(eq(oneOnOneActionItems.sessionId, sessionId))
      .orderBy(oneOnOneActionItems.sortOrder),
  ]);

  return { ...session, agendaItems, actionItems };
}
