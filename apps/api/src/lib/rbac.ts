import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { eq } from "drizzle-orm";
import { users } from "@revualy/db";

type Role = "employee" | "manager" | "admin";

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
