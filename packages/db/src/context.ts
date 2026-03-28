import type { TenantDb } from "./tenant.js";

export type Role = "employee" | "manager" | "admin" | "super_admin";

export interface ViewerContext {
  db: TenantDb;
  orgId: string;
  userId: string;
  role: Role;
  teamId: string | null;
  managerId: string | null;
  isDemo: boolean;
}

const ROLE_HIERARCHY: Record<Role, number> = {
  employee: 0,
  manager: 1,
  admin: 2,
  super_admin: 3,
};

export function assertMinRole(ctx: ViewerContext, minRole: Role): void {
  const userLevel = ROLE_HIERARCHY[ctx.role] ?? -1;
  const requiredLevel = ROLE_HIERARCHY[minRole];
  if (userLevel < requiredLevel) {
    throw Object.assign(new Error("Insufficient permissions"), {
      statusCode: 403,
    });
  }
}

export function assertSelfOrMinRole(
  ctx: ViewerContext,
  targetId: string,
  minRole: Role,
): void {
  if (ctx.userId === targetId) return;
  assertMinRole(ctx, minRole);
}

export function assertSelfOrManagerOf(
  ctx: ViewerContext,
  targetId: string,
  targetManagerId: string | null,
): void {
  if (ctx.userId === targetId) return;
  if (ctx.role === "admin" || ctx.role === "super_admin") return;
  if (ctx.role === "manager" && targetManagerId === ctx.userId) return;
  throw Object.assign(new Error("Insufficient permissions"), {
    statusCode: 403,
  });
}
