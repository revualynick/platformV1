import "server-only";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { createTenantClient } from "@revualy/db";
import {
  authUsers,
  authAccounts,
  authSessions,
  authVerificationTokens,
} from "@revualy/db/schema";

/**
 * NextAuth.js v5 configuration.
 *
 * Strategy: Database-backed sessions via @auth/drizzle-adapter.
 * Per-tenant deployment: auth tables live in the same DB as business data.
 *
 * On sign-in, we look up the user by email in the Revualy API,
 * then persist org/tenant fields on the authUsers row so the
 * session callback can hydrate them without a JWT.
 *
 * Provider: Google OAuth (Google Chat / Workspace orgs).
 */

const API_URL = process.env.INTERNAL_API_URL ?? "http://localhost:3000";

// Tenant DB for session CRUD. The fallback URL is only used during
// `next build` static analysis — postgres.js connects lazily on first query,
// so no actual connection is attempted at build time.
const { db: tenantDb } = createTenantClient(
  process.env.DATABASE_URL ||
    "postgresql://build:build@localhost:5432/build_placeholder",
);

function getInternalSecret(): string {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    throw new Error("INTERNAL_API_SECRET env var is required");
  }
  return secret;
}

function getOrgId(): string {
  return process.env.ORG_ID ?? process.env.DEFAULT_ORG_ID ?? "";
}

interface RevualyUser {
  id: string;
  email: string;
  name: string;
  role: string;
  teamId: string | null;
  orgId: string;
  onboardingCompleted: boolean;
}

/** Look up a Revualy user by email via the API */
async function lookupUserByEmail(email: string): Promise<RevualyUser | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/v1/auth/lookup?email=${encodeURIComponent(email)}`,
      {
        headers: {
          "x-org-id": getOrgId(),
          "x-internal-secret": getInternalSecret(),
        },
      },
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Populate Revualy-specific columns on an authUsers row.
 * Called for both new and returning users to keep data fresh.
 */
async function syncRevualyFields(
  authUserId: string,
  email: string,
): Promise<void> {
  const revualyUser = await lookupUserByEmail(email);
  if (!revualyUser) return;

  await tenantDb
    .update(authUsers)
    .set({
      orgId: revualyUser.orgId,
      tenantUserId: revualyUser.id,
      role: revualyUser.role,
      teamId: revualyUser.teamId,
      onboardingCompleted: revualyUser.onboardingCompleted,
    })
    .where(eq(authUsers.id, authUserId));
}

// Wrap the adapter so we can populate custom columns after user creation
const baseAdapter = DrizzleAdapter(tenantDb, {
  usersTable: authUsers,
  accountsTable: authAccounts,
  sessionsTable: authSessions,
  verificationTokensTable: authVerificationTokens,
});

const adapter = {
  ...baseAdapter,
  async createUser(
    ...args: Parameters<NonNullable<typeof baseAdapter.createUser>>
  ) {
    const user = await baseAdapter.createUser!(...args);
    // Immediately populate Revualy fields so the first session has them
    if (user.email) {
      await syncRevualyFields(user.id, user.email);
    }
    return user;
  },
};

const nextAuth = NextAuth({
  adapter,

  trustHost: true,

  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],

  session: {
    strategy: "database",
    maxAge: 8 * 60 * 60, // 8 hours
  },

  pages: {
    signIn: "/login",
  },

  callbacks: {
    async signIn({ user, account }) {
      // Only allow Google OAuth sign-in for known Revualy users
      if (account?.provider !== "google" || !user.email) {
        return false;
      }

      const revualyUser = await lookupUserByEmail(user.email);
      if (!revualyUser) {
        // User exists in Google but not in Revualy — deny sign-in
        return false;
      }

      return true;
    },

    async session({ session, user }) {
      // With database sessions, `user` is the authUsers DB row.
      // Read Revualy-specific columns to hydrate the session.
      const [authUser] = await tenantDb
        .select({
          orgId: authUsers.orgId,
          tenantUserId: authUsers.tenantUserId,
          role: authUsers.role,
          teamId: authUsers.teamId,
          onboardingCompleted: authUsers.onboardingCompleted,
        })
        .from(authUsers)
        .where(eq(authUsers.id, user.id));

      if (authUser) {
        session.user.id = authUser.tenantUserId ?? "";
        session.role = authUser.role ?? "employee";
        session.orgId = authUser.orgId ?? getOrgId();
        session.teamId = authUser.teamId ?? null;
        session.user.onboardingCompleted =
          authUser.onboardingCompleted ?? true;
      }

      return session;
    },
  },

  events: {
    async signIn({ user }) {
      // Refresh Revualy fields on every sign-in (handles role/team changes
      // that occurred since the last login)
      if (user.id && user.email) {
        await syncRevualyFields(user.id, user.email);
      }
    },
  },
});

export const { handlers, signIn, signOut } = nextAuth;

/**
 * Session getter — wraps NextAuth's auth() to return a synthetic demo session
 * when DEMO_MODE=true and no real authenticated session exists.
 * This lets all pages render with mock data instead of redirecting to /login.
 */
export async function auth() {
  const session = await nextAuth.auth();
  if (session) return session;

  if (process.env.DEMO_MODE === "true") {
    return {
      user: {
        id: "demo-user",
        name: "Demo User",
        email: "demo@revualy.com",
        image: null,
        onboardingCompleted: true,
      },
      role: "admin",
      orgId: process.env.ORG_ID ?? "demo-org",
      teamId: null,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    } as import("next-auth").Session;
  }

  return null;
}
