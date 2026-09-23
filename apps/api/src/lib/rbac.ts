import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { eq } from "drizzle-orm";
import { users } from "@revualy/db";
import { getReportingTree } from "@revualy/db/queries";

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
    const { db, userId } = request.tenant;

    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    const [user] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return reply.code(401).send({ error: "User not found" });
    }

    const userLevel = ROLE_HIERARCHY[user.role as Role] ?? -1;
    const requiredLevel = ROLE_HIERARCHY[minRole];

    if (userLevel < requiredLevel) {
      return reply.code(403).send({ error: "Insufficient permissions" });
    }
  };
}

/**
 * Fastify preHandler that requires the user to be authenticated
 * (any role is acceptable).
 */
export const requireAuth: preHandlerHookHandler = async (request, reply) => {
  const { userId } = request.tenant;

  if (!userId) {
    return reply.code(401).send({ error: "Authentication required" });
  }
};

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

/**
 * Assert the caller may access data belonging to `targetUserId`.
 *
 * Access is granted when the caller is the target themselves, is an
 * admin/super_admin (full-org visibility), or the target is within the
 * caller's reporting tree (direct or indirect report). Throws a 403
 * (surfaced as "Forbidden" by the global error handler) otherwise.
 *
 * Use this in every manager-scoped endpoint that takes a target user id
 * from params/query/body, so role checks are backed by tree membership.
 */
export async function assertCanAccessUser(
  request: FastifyRequest,
  targetUserId: string,
): Promise<void> {
  const { db } = request.tenant;
  const callerId = getAuthenticatedUserId(request);

  if (callerId === targetUserId) return;

  const role = await getUserRole(request, callerId);
  if (role === "admin" || role === "super_admin") return;

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
  if (role === "admin" || role === "super_admin") return;

  const tree = await getReportingTree(db, callerId);
  for (const id of targetUserIds) {
    if (id !== callerId && !tree.has(id)) {
      throw Object.assign(new Error("Insufficient permissions"), {
        statusCode: 403,
      });
    }
  }
}
