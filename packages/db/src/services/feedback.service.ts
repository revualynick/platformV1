import type { ViewerContext } from "../context.js";
import { assertMinRole } from "../context.js";
import {
  getFeedbackForSubject,
  getFlaggedItemsForReports,
  getAllFlaggedItems,
} from "../queries/feedback.js";
import { getUserById, listActiveUsers } from "../queries/users.js";

export async function getFeedback(
  ctx: ViewerContext,
  targetId: string,
  limit?: number,
) {
  if (ctx.userId !== targetId) {
    if (ctx.role === "employee") {
      throw Object.assign(new Error("You can only view your own feedback"), {
        statusCode: 403,
      });
    }
    if (ctx.role === "manager") {
      const subject = await getUserById(ctx.db, targetId);
      if (!subject || subject.managerId !== ctx.userId) {
        throw Object.assign(
          new Error("You can only view feedback for your direct reports"),
          { statusCode: 403 },
        );
      }
    }
  }

  const data = await getFeedbackForSubject(ctx.db, targetId, limit);
  return { data, userId: targetId };
}

export async function getFlaggedItems(ctx: ViewerContext) {
  assertMinRole(ctx, "manager");

  if (ctx.role === "manager") {
    const reports = await listActiveUsers(ctx.db, {
      managerId: ctx.userId,
    });
    const reportIds = reports.map((r) => r.id);
    return getFlaggedItemsForReports(ctx.db, reportIds);
  }

  // Admin/super_admin: all
  return getAllFlaggedItems(ctx.db);
}
