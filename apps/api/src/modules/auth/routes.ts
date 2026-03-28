import type { FastifyPluginAsync } from "fastify";
import { eq, sql } from "drizzle-orm";
import { users, orgSettings } from "@revualy/db";
import crypto from "node:crypto";
import { z } from "zod";

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;
if (!INTERNAL_SECRET) {
  throw new Error("INTERNAL_API_SECRET env var is required");
}

function verifyInternalSecret(secret: string | undefined): boolean {
  const expected = crypto.createHmac("sha256", INTERNAL_SECRET!).update("revualy").digest();
  const actual = crypto.createHmac("sha256", secret ?? "").update("revualy").digest();
  return !!secret && crypto.timingSafeEqual(expected, actual);
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  // Stricter rate limit for auth endpoints (10 req/min per IP)
  const authRateLimit = {
    config: { rateLimit: { max: 10, timeWindow: "1 minute", keyGenerator: (request: import("fastify").FastifyRequest) => request.ip } },
  };

  /**
   * GET /auth/lookup?email=...
   * Internal-only: called by NextAuth during sign-in to resolve a Revualy user.
   * Protected by a shared secret (not exposed to browsers).
   */
  app.get("/lookup", authRateLimit, async (request, reply) => {
    if (!verifyInternalSecret(request.headers["x-internal-secret"] as string | undefined)) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const lookupQuery = z.object({ email: z.string().email() }).safeParse(request.query);
    if (!lookupQuery.success) {
      return reply.code(400).send({ error: "Valid email query parameter required" });
    }
    const { email } = lookupQuery.data;

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
  app.post("/provision", authRateLimit, async (request, reply) => {
    if (!verifyInternalSecret(request.headers["x-internal-secret"] as string | undefined)) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const provisionBody = z.object({ email: z.string().email(), name: z.string().optional() }).safeParse(request.body);
    if (!provisionBody.success) {
      return reply.code(400).send({ error: "Valid email is required" });
    }
    const { email: rawEmail, name } = provisionBody.data;

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

    // Atomic insert: role is determined at INSERT time via subquery to prevent
    // TOCTOU race where two concurrent first-sign-ins both see count=0
    const [result] = await db
      .insert(users)
      .values({
        email,
        name: name || email.split("@")[0],
        role: sql`CASE WHEN (SELECT count(*) FROM ${users}) = 0 THEN 'super_admin' ELSE 'employee' END`,
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
