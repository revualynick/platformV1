import type { ViewerContext } from "../context.js";
import { assertMinRole } from "../context.js";
import {
  getNotificationPreferences as queryNotifPrefs,
  getKudosForUser as queryKudos,
  getConversations as queryConversations,
  getConversationWithMessages as queryConvDetail,
  getEscalations as queryEscalations,
  getEscalationDetail as queryEscDetail,
  getCampaigns as queryCampaigns,
  getCampaignById as queryCampaignById,
  getFullOrgGraph as queryFullOrgGraph,
} from "../queries/misc.js";

export async function getNotificationPreferences(ctx: ViewerContext) {
  return queryNotifPrefs(ctx.db, ctx.userId);
}

export async function getKudos(ctx: ViewerContext, targetUserId?: string) {
  const userId = targetUserId ?? ctx.userId;
  if (userId !== ctx.userId) {
    assertMinRole(ctx, "manager");
  }
  return queryKudos(ctx.db, userId);
}

export async function getConversations(
  ctx: ViewerContext,
  opts?: { status?: string; limit?: number },
) {
  assertMinRole(ctx, "admin");
  return queryConversations(ctx.db, opts);
}

export async function getConversationDetail(
  ctx: ViewerContext,
  id: string,
) {
  assertMinRole(ctx, "admin");
  return queryConvDetail(ctx.db, id);
}

export async function getEscalations(
  ctx: ViewerContext,
  opts?: { status?: string; severity?: string },
) {
  assertMinRole(ctx, "admin");
  return queryEscalations(ctx.db, opts);
}

export async function getEscalationDetail(
  ctx: ViewerContext,
  id: string,
) {
  assertMinRole(ctx, "admin");
  return queryEscDetail(ctx.db, id);
}

export async function getCampaigns(ctx: ViewerContext) {
  assertMinRole(ctx, "admin");
  return queryCampaigns(ctx.db);
}

export async function getCampaignDetail(ctx: ViewerContext, id: string) {
  assertMinRole(ctx, "admin");
  return queryCampaignById(ctx.db, id);
}

export async function getFullOrgGraph(ctx: ViewerContext) {
  assertMinRole(ctx, "admin");
  return queryFullOrgGraph(ctx.db);
}
