import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

/**
 * NextAuth.js v5 configuration.
 *
 * Strategy: JWT-based sessions (no database session table needed).
 * On sign-in, we look up the user by email in the Revualy API,
 * then embed userId, orgId, and role into the JWT for downstream use.
 *
 * Providers:
 * - Google OAuth (for Google Chat / Workspace orgs)
 * - Credentials (dev-only: sign in with email, no password)
 *
 * Microsoft Entra ID will be added in Phase 4 alongside the Teams adapter.
 */

const API_URL = process.env.INTERNAL_API_URL ?? "http://localhost:3000";

interface RevualyUser {
  id: string;
  email: string;
  name: string;
  role: string;
  teamId: string | null;
  orgId: string;
}

/** Look up a Revualy user by email via the API */
async function lookupUserByEmail(email: string): Promise<RevualyUser | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/auth/lookup?email=${encodeURIComponent(email)}`, {
      headers: {
        "x-org-id": "dev-org",
        "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "dev-secret",
      },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    // Dev-only credentials provider: sign in with any seeded email
    ...(process.env.NODE_ENV !== "production"
      ? [
          Credentials({
            name: "Dev Login",
            credentials: {
              email: { label: "Email", type: "email", placeholder: "sarah.chen@acmecorp.com" },
            },
            async authorize(credentials) {
              const email = credentials?.email as string | undefined;
              if (!email) return null;

              const user = await lookupUserByEmail(email);
              if (!user) return null;

              return {
                id: user.id,
                email: user.email,
                name: user.name,
              };
            },
          }),
        ]
      : []),
  ],

  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
  },

  pages: {
    signIn: "/login",
  },

  callbacks: {
    async signIn({ user, account }) {
      // For OAuth providers, look up the user in Revualy by email
      if (account?.provider === "google" && user.email) {
        const revualyUser = await lookupUserByEmail(user.email);
        if (!revualyUser) {
          // User exists in Google but not in Revualy — deny sign-in
          return false;
        }
        // Attach Revualy-specific fields for the jwt callback
        (user as Record<string, unknown>).revualyId = revualyUser.id;
        (user as Record<string, unknown>).role = revualyUser.role;
        (user as Record<string, unknown>).orgId = revualyUser.orgId;
        (user as Record<string, unknown>).teamId = revualyUser.teamId;
      }
      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        // First sign-in — populate token with Revualy data
        const u = user as Record<string, unknown>;

        if (u.revualyId) {
          // OAuth flow — data already attached in signIn callback
          token.userId = u.revualyId as string;
          token.role = u.role as string;
          token.orgId = u.orgId as string;
          token.teamId = u.teamId as string | null;
        } else {
          // Credentials flow — look up by email
          const revualyUser = await lookupUserByEmail(user.email!);
          if (revualyUser) {
            token.userId = revualyUser.id;
            token.role = revualyUser.role;
            token.orgId = revualyUser.orgId;
            token.teamId = revualyUser.teamId;
          }
        }
      }
      return token;
    },

    async session({ session, token }) {
      // Expose Revualy fields on the client session
      session.user.id = token.userId as string;
      session.role = token.role as string;
      session.orgId = token.orgId as string;
      session.teamId = token.teamId as string | null;
      return session;
    },
  },
});
