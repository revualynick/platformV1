import type { ViewerContext } from "../context.js";
import {
  getSessionsForPair,
  getSessionDetail as queryDetail,
} from "../queries/sessions.js";

export async function getSessions(
  ctx: ViewerContext,
  opts?: { employeeId?: string; status?: string },
) {
  return getSessionsForPair(ctx.db, ctx.userId, opts);
}

export async function getSessionDetail(
  ctx: ViewerContext,
  sessionId: string,
) {
  const session = await queryDetail(ctx.db, sessionId);
  if (!session) return null;

  // Only manager or employee of the session can view
  if (
    session.managerId !== ctx.userId &&
    session.employeeId !== ctx.userId
  ) {
    throw Object.assign(new Error("Access denied"), { statusCode: 403 });
  }

  return session;
}
