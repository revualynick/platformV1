import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { users } from "@revualy/db";

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;
if (!INTERNAL_SECRET) {
  throw new Error("INTERNAL_API_SECRET env var is required");
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /auth/lookup?email=...
   * Internal-only: called by NextAuth during sign-in to resolve a Revualy user.
   * Protected by a shared secret (not exposed to browsers).
   */
  app.get("/lookup", async (request, reply) => {
    const secret = request.headers["x-internal-secret"] as string | undefined;
    if (secret !== INTERNAL_SECRET) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const { email } = request.query as { email?: string };
    if (!email) {
      return reply.code(400).send({ error: "email query parameter required" });
    }

    const { db, orgId } = request.tenant;
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        teamId: users.teamId,
        onboardingCompleted: users.onboardingCompleted,
      })
      .from(users)
      .where(eq(users.email, email));

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    return reply.send({ ...user, orgId });
  });

  /**
   * GET /auth/me
   * Returns the current authenticated user's profile.
   * Relies on tenant context middleware having resolved userId from the JWT.
   */
  app.get("/me", async (request, reply) => {
    const { db, userId } = request.tenant;

    if (!userId) {
      return reply.code(401).send({ error: "Not authenticated" });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    return reply.send(user);
  });
};
