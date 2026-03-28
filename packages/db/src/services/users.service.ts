import type { ViewerContext } from "../context.js";
import { assertSelfOrManagerOf } from "../context.js";
import {
  listActiveUsers as queryListActiveUsers,
  getUserById as queryGetUserById,
  getUserWithManager,
} from "../queries/users.js";

export async function listUsers(
  ctx: ViewerContext,
  filters?: { teamId?: string; managerId?: string; limit?: number },
) {
  // Any authenticated user can list users (scoped view)
  return queryListActiveUsers(ctx.db, filters);
}

export async function getUser(ctx: ViewerContext, targetId: string) {
  const user = await queryGetUserById(ctx.db, targetId);
  if (!user) return null;

  // Self always gets full profile
  if (ctx.userId === targetId) return user;

  // Admin/super_admin get full profile
  if (ctx.role === "admin" || ctx.role === "super_admin") return user;

  // Manager gets full profile for direct reports
  if (ctx.role === "manager" && user.managerId === ctx.userId) return user;

  // Scoped view for everyone else
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    teamId: user.teamId,
    timezone: user.timezone,
    isActive: user.isActive,
  };
}

export async function getCurrentUser(ctx: ViewerContext) {
  return getUserWithManager(ctx.db, ctx.userId);
}
