import type { ViewerContext } from "../context.js";
import { assertMinRole, assertSelfOrManagerOf } from "../context.js";
import {
  getEngagementScoresForUser,
  getBulkLatestEngagement as queryBulk,
  getLeaderboard as queryLeaderboard,
} from "../queries/engagement.js";
import { getUserById, listActiveUsers } from "../queries/users.js";

export async function getEngagementScores(
  ctx: ViewerContext,
  targetId: string,
) {
  // Self always OK; manager for reports; admin for all
  if (ctx.userId !== targetId) {
    if (ctx.role === "employee") {
      throw Object.assign(
        new Error("You can only view your own engagement scores"),
        { statusCode: 403 },
      );
    }
    if (ctx.role === "manager") {
      const subject = await getUserById(ctx.db, targetId);
      if (!subject || subject.managerId !== ctx.userId) {
        throw Object.assign(
          new Error("You can only view engagement scores for your direct reports"),
          { statusCode: 403 },
        );
      }
    }
  }

  const scores = await getEngagementScoresForUser(ctx.db, targetId);
  return { data: scores, userId: targetId };
}

export async function getBulkEngagement(
  ctx: ViewerContext,
  userIds: string[],
) {
  assertMinRole(ctx, "manager");

  // Admin/super_admin can query any user; managers only their reports
  if (ctx.role === "manager") {
    const reports = await listActiveUsers(ctx.db, { managerId: ctx.userId });
    const reportIdSet = new Set(reports.map((r) => r.id));
    const scopedIds = userIds.filter((id) => reportIdSet.has(id));
    if (scopedIds.length === 0) return {};
    return queryBulk(ctx.db, scopedIds);
  }

  return queryBulk(ctx.db, userIds);
}

export async function getLeaderboard(ctx: ViewerContext, weekStart: string) {
  // Any authenticated user can see the leaderboard
  return queryLeaderboard(ctx.db, weekStart);
}
