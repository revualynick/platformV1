import type { FastifyPluginAsync } from "fastify";
import { eq, sql } from "drizzle-orm";
import { users, orgSettings } from "@revualy/db";
import crypto from "node:crypto";

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
    const expected = crypto.createHmac("sha256", INTERNAL_SECRET).update("revualy").digest();
    const actual = crypto.createHmac("sha256", secret ?? "").update("revualy").digest();
    if (!secret || !crypto.timingSafeEqual(expected, actual)) {
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
   * POST /auth/provision
   * Internal-only: auto-creates a Revualy user from Google OAuth profile.
   * Called by NextAuth signIn callback when the user doesn't exist yet.
   * Returns the newly created user (or existing user if race condition).
   */
  app.post("/provision", async (request, reply) => {
    const secret = request.headers["x-internal-secret"] as string | undefined;
    const expected = crypto.createHmac("sha256", INTERNAL_SECRET).update("revualy").digest();
    const actual = crypto.createHmac("sha256", secret ?? "").update("revualy").digest();
    if (!secret || !crypto.timingSafeEqual(expected, actual)) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const { email: rawEmail, name } = request.body as { email?: string; name?: string };
    if (!rawEmail) {
      return reply.code(400).send({ error: "email is required" });
    }

    const email = rawEmail.toLowerCase();
    const { db, orgId } = request.tenant;

    // Check if user already exists (handles concurrent sign-in race)
    const [existing] = await db
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

    if (existing) {
      return reply.send({ ...existing, orgId });
    }

    // Verify email domain is in the allowed list
    const domain = email.split("@")[1];
    if (!domain) {
      return reply.code(400).send({ error: "Invalid email address" });
    }

    const [settings] = await db
      .select({ allowedDomains: orgSettings.allowedDomains })
      .from(orgSettings)
      .limit(1);

    const allowed = settings?.allowedDomains ?? [];
    if (allowed.length === 0 || !allowed.includes(domain)) {
      return reply.code(403).send({ error: "Email domain not authorized for this organization" });
    }

    // First user in the org gets admin role, subsequent users get employee
    const [{ count: userCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    const role = userCount === 0 ? "admin" : "employee";

    // Atomic upsert — if a concurrent request created the row, return it
    const [result] = await db
      .insert(users)
      .values({
        email,
        name: name || email.split("@")[0],
        role,
        onboardingCompleted: false,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: { updatedAt: sql`now()` },
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        teamId: users.teamId,
        onboardingCompleted: users.onboardingCompleted,
      });

    return reply.code(201).send({ ...result, orgId });
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
