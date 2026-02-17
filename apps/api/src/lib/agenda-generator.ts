import { eq, and, desc, gte } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import {
  oneOnOneSessions,
  oneOnOneActionItems,
  escalations,
  feedbackEntries,
  kudos,
  users,
  questionnaireThemes,
  questionnaires,
} from "@revualy/db";

interface AgendaItem {
  text: string;
  source: "ai" | "manual";
}

const MAX_ITEMS = 8;

/**
 * Generates agenda items from existing data for a 1:1 session.
 * No LLM required — pure data aggregation.
 */
export async function generateAgenda(
  db: TenantDb,
  managerId: string,
  employeeId: string,
): Promise<AgendaItem[]> {
  const items: AgendaItem[] = [];
  const now = new Date();

  // 1. Open action items from last completed session with this pair
  try {
    const [lastSession] = await db
      .select({ id: oneOnOneSessions.id })
      .from(oneOnOneSessions)
      .where(
        and(
          eq(oneOnOneSessions.managerId, managerId),
          eq(oneOnOneSessions.employeeId, employeeId),
          eq(oneOnOneSessions.status, "completed"),
        ),
      )
      .orderBy(desc(oneOnOneSessions.endedAt))
      .limit(1);

    if (lastSession) {
      const openActions = await db
        .select({ text: oneOnOneActionItems.text })
        .from(oneOnOneActionItems)
        .where(
          and(
            eq(oneOnOneActionItems.sessionId, lastSession.id),
            eq(oneOnOneActionItems.completed, false),
          ),
        )
        .limit(3);

      for (const action of openActions) {
        items.push({ text: `Follow up: ${action.text}`, source: "ai" });
      }
    }
  } catch {
    // Skip if query fails
  }

  // 2. Unresolved flagged feedback about the employee (last 30 days)
  try {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const flagged = await db
      .select({
        reason: escalations.reason,
      })
      .from(escalations)
      .innerJoin(feedbackEntries, eq(feedbackEntries.id, escalations.feedbackEntryId))
      .where(
        and(
          eq(feedbackEntries.subjectId, employeeId),
          gte(escalations.createdAt, thirtyDaysAgo),
        ),
      )
      .limit(2);

    // Only include unresolved (resolvedAt is null)
    for (const flag of flagged) {
      items.push({
        text: `Discuss flagged feedback: ${flag.reason}`,
        source: "ai",
      });
    }
  } catch {
    // Skip
  }

  // 3. Recent kudos for the employee (last 14 days)
  try {
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const recentKudos = await db
      .select({
        message: kudos.message,
        giverName: users.name,
      })
      .from(kudos)
      .innerJoin(users, eq(users.id, kudos.giverId))
      .where(
        and(
          eq(kudos.receiverId, employeeId),
          gte(kudos.createdAt, fourteenDaysAgo),
        ),
      )
      .limit(2);

    for (const k of recentKudos) {
      const snippet = k.message.length > 60 ? k.message.slice(0, 57) + "..." : k.message;
      items.push({
        text: `Acknowledge kudos: "${snippet}" from ${k.giverName}`,
        source: "ai",
      });
    }
  } catch {
    // Skip
  }

  // 4. Questionnaire themes scoped to employee's team
  try {
    const [employee] = await db
      .select({ teamId: users.teamId })
      .from(users)
      .where(eq(users.id, employeeId));

    if (employee?.teamId) {
      const themes = await db
        .select({ intent: questionnaireThemes.intent })
        .from(questionnaireThemes)
        .innerJoin(questionnaires, eq(questionnaires.id, questionnaireThemes.questionnaireId))
        .where(
          and(
            eq(questionnaires.teamScope, employee.teamId),
            eq(questionnaires.isActive, true),
          ),
        )
        .limit(2);

      for (const theme of themes) {
        items.push({
          text: `Explore: ${theme.intent}`,
          source: "ai",
        });
      }
    }
  } catch {
    // Skip
  }

  return items.slice(0, MAX_ITEMS);
}
