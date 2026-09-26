import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { users, authUsers, authSessions } from "@revualy/db/schema";
import { getDb } from "@/lib/db";
import { publicUrl } from "@/lib/public-url";

/**
 * Dev-only test-login endpoint.
 *
 * Mints a real database-backed NextAuth session for a seeded user so automated
 * tests (Playwright) can exercise authenticated + mutation flows without Google
 * OAuth. DEFENCE IN DEPTH — this is not "just a flag":
 *   1. `TEST_LOGIN_ENABLED` must be exactly "true", AND
 *   2. the caller must present a secret that matches `TEST_LOGIN_KEY`
 *      (constant-time compared), AND
 *   3. `TEST_LOGIN_KEY` must itself be set to a non-empty value.
 * So even if the flag is accidentally left enabled in production, the endpoint
 * is inert to anyone who doesn't hold the (long, random) key.
 *
 * Usage:
 *   GET /api/test-login?email=<seeded-email>&key=<TEST_LOGIN_KEY>[&redirect=/home]
 *   (the key may instead be sent as the `x-test-login-key` header)
 */

const SESSION_COOKIE = "authjs.session-token";
const SESSION_TTL_DAYS = 7;

function keyMatches(provided: string | null, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual requires equal-length buffers; length check first is fine
  // because the key length is not secret.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const enabled = process.env.TEST_LOGIN_ENABLED === "true";
  // Hide the endpoint entirely when disabled — no signal that it exists.
  if (!enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const providedKey =
    request.headers.get("x-test-login-key") ?? url.searchParams.get("key");
  if (!keyMatches(providedKey, process.env.TEST_LOGIN_KEY)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const email = url.searchParams.get("email");
  if (!email) {
    return NextResponse.json(
      { error: "email query param is required" },
      { status: 400 },
    );
  }

  const db = getDb();

  // Resolve the seeded business user.
  const [bizUser] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      teamId: users.teamId,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.email, email));

  if (!bizUser) {
    return NextResponse.json(
      { error: `No seeded user with email ${email}` },
      { status: 404 },
    );
  }

  if (!bizUser.isActive) {
    return NextResponse.json({ error: "User is deactivated" }, { status: 403 });
  }

  // Upsert the matching auth_user row (linked by tenant_user_id).
  const [existingAuth] = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.tenantUserId, bizUser.id));

  let authUserId: string;
  if (existingAuth) {
    authUserId = existingAuth.id;
    await db
      .update(authUsers)
      .set({
        role: bizUser.role,
        teamId: bizUser.teamId,
        onboardingCompleted: true,
        name: bizUser.name,
        email: bizUser.email,
      })
      .where(eq(authUsers.id, authUserId));
  } else {
    authUserId = randomUUID();
    await db.insert(authUsers).values({
      id: authUserId,
      name: bizUser.name,
      email: bizUser.email,
      emailVerified: new Date(),
      tenantUserId: bizUser.id,
      role: bizUser.role,
      teamId: bizUser.teamId,
      onboardingCompleted: true,
    });
  }

  // Create a fresh DB-backed session.
  const sessionToken = randomUUID() + randomUUID().replace(/-/g, "");
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(authSessions).values({
    sessionToken,
    userId: authUserId,
    expires,
  });

  // Same-origin relative paths only, never an open redirect.
  const rawRedirect = url.searchParams.get("redirect");
  const redirectTo =
    rawRedirect && rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
      ? rawRedirect
      : null;
  const response = redirectTo
    ? NextResponse.redirect(publicUrl(redirectTo, request))
    : NextResponse.json({
        ok: true,
        loggedInAs: { email: bizUser.email, role: bizUser.role, id: bizUser.id },
      });

  // NextAuth reads the __Secure- prefixed cookie name over HTTPS.
  const isHttps = url.protocol === "https:";
  response.cookies.set(isHttps ? `__Secure-${SESSION_COOKIE}` : SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isHttps,
    expires,
  });

  return response;
}
