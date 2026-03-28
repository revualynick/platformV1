import type { ViewerContext } from "../context.js";
import {
  getReflections as queryReflections,
  getReflectionStats as queryStats,
} from "../queries/reflections.js";

export async function getReflections(ctx: ViewerContext, limit?: number) {
  // Self-only
  return queryReflections(ctx.db, ctx.userId, limit);
}

export async function getReflectionStats(ctx: ViewerContext) {
  return queryStats(ctx.db, ctx.userId);
}
