import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { eq } from "drizzle-orm";
import { users } from "@revualy/db";
import { getReportingTree } from "@revualy/db/queries";
import { appendAudit } from "./audit-log.js";
import { findActiveGrant } from "./access-grants.js";

type Role = "employee" | "manager" | "admin" | "super_admin";

/**
 * Extract authenticated userId from request, throwing 401 if not present.
 * Use this instead of `request.tenant.userId!` non-null assertions.
 */
export function getAuthenticatedUserId(request: FastifyRequest): string {
  const { userId } = request.tenant;
  if (!userId) {
    throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
  }
  return userId;
}

const ROLE_HIERARCHY: Record<Role, number> = {
  employee: 0,
  manager: 1,
  admin: 2,
  super_admin: 3,
};

/**
 * Fastify preHandler that enforces a minimum role level.
 *
 * Usage:
 *   app.get("/admin/org", { preHandler: requireRole("admin") }, handler);
 *
 * Checks the authenticated user's role from the database (not from headers)
 * to prevent privilege escalation.
 */
export function requireRole(minRole: Role): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await loadActiveCaller(request, reply);
    if (!user) return reply;

    const userLevel = ROLE_HIERARCHY[user.role as Role] ?? -1;
    const requiredLevel = ROLE_HIERARCHY[minRole];

    if (userLevel < requiredLevel) {
      return reply.code(403).send({ error: "Insufficient permissions" });
    }
  };
}

/**
 * Fastify preHandler that requires the user to be authenticated
 * (any role is acceptable) and still active.
 */
export const requireAuth: preHandlerHookHandler = async (request, reply) => {
  const user = await loadActiveCaller(request, reply);
  if (!user) return reply;
};

/** True for roles with full-org visibility. */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve the caller from the DB (a single primary-key lookup) and reject
 * missing, malformed or deactivated users. Deactivation must cut access
 * immediately, not when the web session happens to expire. Sends the error
 * reply itself and returns null when the caller is not allowed through.
 */
async function loadActiveCaller(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<{ role: string } | null> {
  const { db, userId } = request.tenant;

  if (!userId || !UUID_RE.test(userId)) {
    reply.code(401).send({ error: "Authentication required" });
    return null;
  }

  const [user] = await db
    .select({ role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) {
    reply.code(401).send({ error: "User not found" });
    return null;
  }
  if (!user.isActive) {
    reply.code(403).send({ error: "Account deactivated" });
    return null;
  }
  return user;
}

/**
 * Look up a user's role from the DB (source of truth, never headers).
 * Returns null if the user does not exist.
 */
export async function getUserRole(
  request: FastifyRequest,
  userId: string,
): Promise<Role | null> {
  const { db } = request.tenant;
  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId));
  return (user?.role as Role | undefined) ?? null;
}

export type AccessLevel = "self" | "content" | "signals" | "none";

/**
 * What the caller may see about `targetUserId` (docs/design/
 * privacy-and-agent-access.md, "Who sees what about a person"):
 *  - self: it's them
 *  - content: their direct manager (released themes, profiles, 360, notes)
 *  - signals: a skip-level manager or an admin (engagement, cadence, goals)
 *  - none: anyone else
 */
export async function getAccessLevel(request: FastifyRequest, targetUserId: string): Promise<AccessLevel> {
  const { db } = request.tenant;
  const callerId = getAuthenticatedUserId(request);
  if (callerId === targetUserId) return "self";
  const [target] = await db.select({ managerId: users.managerId }).from(users).where(eq(users.id, targetUserId));
  if (target?.managerId === callerId) return "content";
  const role = await getUserRole(request, callerId);
  if (isAdminRole(role)) return "signals";
  const tree = await getReportingTree(db, callerId);
  return tree.has(targetUserId) ? "signals" : "none";
}

/**
 * Assert the caller may see a person's content: themselves or their direct
 * manager. Skip-levels and admins get signals, not content (use
 * {@link assertCanAccessUser} for signal routes), unless an admin holds an
 * active break-glass grant for this person: then reads are allowed and each
 * one is written to the audit log first. Grants never allow writes, so
 * routes that change content pass `{ write: true }`. Throws a 403 otherwise.
 */
export async function assertContentAccess(
  request: FastifyRequest,
  targetUserId: string,
  opts: { write?: boolean } = {},
): Promise<void> {
  const level = await getAccessLevel(request, targetUserId);
  if (level === "self" || level === "content") return;
  if (!opts.write && level === "signals") {
    const grant = await findActiveGrant(request.tenant.db, getAuthenticatedUserId(request), targetUserId);
    if (grant) {
      await appendAudit(request.tenant.db, {
        actorId: grant.granteeId,
        action: "breakglass.read",
        target: targetUserId,
        outcome: "ok",
        details: { grantId: grant.id, route: request.routeOptions.url ?? null },
      });
      return;
    }
  }
  throw Object.assign(new Error("Insufficient permissions"), { statusCode: 403 });
}

/**
 * Assert the caller may see signals about `targetUserId` (engagement,
 * cadence, goal progress): the target themselves, an admin/super_admin, or
 * a manager with the target anywhere in their reporting tree. For a
 * person's content (themes, profiles, notes) use {@link assertContentAccess}.
 * Throws a 403 (surfaced as "Forbidden" by the global error handler).
 */
export async function assertCanAccessUser(
  request: FastifyRequest,
  targetUserId: string,
): Promise<void> {
  const { db } = request.tenant;
  const callerId = getAuthenticatedUserId(request);

  if (callerId === targetUserId) return;

  const role = await getUserRole(request, callerId);
  if (isAdminRole(role)) return;

  const tree = await getReportingTree(db, callerId);
  if (!tree.has(targetUserId)) {
    throw Object.assign(new Error("Insufficient permissions"), {
      statusCode: 403,
    });
  }
}

/**
 * Assert the caller may access ALL of `targetUserIds` (batch variant of
 * {@link assertCanAccessUser}). Fetches the reporting tree once. Throws 403
 * if any id is outside the caller's scope (and the caller is not admin+).
 */
export async function assertCanAccessUsers(
  request: FastifyRequest,
  targetUserIds: string[],
): Promise<void> {
  const { db } = request.tenant;
  const callerId = getAuthenticatedUserId(request);

  const role = await getUserRole(request, callerId);
  if (isAdminRole(role)) return;

  const tree = await getReportingTree(db, callerId);
  for (const id of targetUserIds) {
    if (id !== callerId && !tree.has(id)) {
      throw Object.assign(new Error("Insufficient permissions"), {
        statusCode: 403,
      });
    }
  }
}
