import type { GoalLevel } from "@revualy/shared";

export type Role = "employee" | "manager" | "admin" | "super_admin";

const ROLE_HIERARCHY: Record<Role, number> = {
  employee: 0,
  manager: 1,
  admin: 2,
  super_admin: 3,
};

function isAdmin(role: Role): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.admin;
}

/**
 * Everything goal permissions need about the acting user, resolved once
 * per request. reportingTree contains the user's own id plus all
 * direct/indirect reports (see getReportingTree in @revualy/db).
 */
export interface GoalPermissionContext {
  userId: string;
  role: Role;
  /** Teams where teams.managerId === userId */
  ownedTeamIds: Set<string>;
  /** BFS over users.managerId, includes userId itself */
  reportingTree: Set<string>;
}

export interface GoalForPermissions {
  level: GoalLevel;
  ownerId: string;
  teamId: string | null;
  shareWithManager: boolean;
}

/**
 * Personal goals are private to their owner unless shared with the
 * management chain. Admins do NOT bypass this — personal-development
 * privacy beats admin omniscience. Everything else is org-visible.
 */
export function canViewGoal(
  ctx: GoalPermissionContext,
  goal: GoalForPermissions,
): boolean {
  if (goal.level !== "personal") return true;
  if (goal.ownerId === ctx.userId) return true;
  return goal.shareWithManager && ctx.reportingTree.has(goal.ownerId);
}

export function canManageGoal(
  ctx: GoalPermissionContext,
  goal: GoalForPermissions,
): boolean {
  switch (goal.level) {
    case "org":
      return isAdmin(ctx.role);
    case "team":
      return (
        isAdmin(ctx.role) ||
        (goal.teamId !== null && ctx.ownedTeamIds.has(goal.teamId))
      );
    case "individual":
      return (
        goal.ownerId === ctx.userId ||
        isAdmin(ctx.role) ||
        ctx.reportingTree.has(goal.ownerId)
      );
    case "personal":
      return goal.ownerId === ctx.userId;
  }
}

/**
 * Suggestions come from a 1:1, and what is said in a 1:1 stays in that
 * 1:1: only the two people in the meeting may see, apply or dismiss them.
 * Skip-levels and admins are excluded even when they can manage the goal
 * (docs/design/privacy-and-agent-access.md, tier C).
 */
export function isMeetingParticipant(
  ctx: Pick<GoalPermissionContext, "userId">,
  meeting: { organizerId: string; subjectUserId: string | null },
): boolean {
  return ctx.userId === meeting.organizerId || ctx.userId === meeting.subjectUserId;
}

/**
 * Creation follows the manage matrix, with one extra rule: personal
 * goals can only ever be created for oneself.
 */
export function canCreateGoal(
  ctx: GoalPermissionContext,
  input: GoalForPermissions,
): boolean {
  if (input.level === "personal") return input.ownerId === ctx.userId;
  return canManageGoal(ctx, input);
}
