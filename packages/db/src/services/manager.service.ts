import type { ViewerContext } from "../context.js";
import { assertMinRole } from "../context.js";
import {
  getManagerQuestionnaires as queryManagerQ,
  getManagerNotes as queryNotes,
  getTeamInsightDigests as queryDigests,
  getTeamInsightMonth as queryMonth,
  getOrgChartForManager as queryOrgChart,
} from "../queries/manager.js";

export async function getManagerQuestionnaires(ctx: ViewerContext) {
  assertMinRole(ctx, "manager");
  return queryManagerQ(ctx.db, ctx.userId, ctx.teamId);
}

export async function getManagerNotes(
  ctx: ViewerContext,
  subjectId: string,
) {
  assertMinRole(ctx, "manager");
  return queryNotes(ctx.db, ctx.userId, subjectId);
}

export async function getTeamInsightDigests(ctx: ViewerContext) {
  assertMinRole(ctx, "manager");
  return queryDigests(ctx.db, ctx.userId);
}

export async function getTeamInsightMonth(
  ctx: ViewerContext,
  month: string,
) {
  assertMinRole(ctx, "manager");
  const monthStarting = `${month}-01`;
  return queryMonth(ctx.db, ctx.userId, monthStarting);
}

export async function getOrgChartForManager(ctx: ViewerContext) {
  assertMinRole(ctx, "manager");
  return queryOrgChart(ctx.db, ctx.userId);
}
