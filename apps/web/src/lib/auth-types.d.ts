import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      onboardingCompleted: boolean;
    };
    role: string;
    orgId: string;
    teamId: string | null;
  }

  /** Extended User with Revualy-specific columns from authUsers */
  interface User {
    orgId?: string | null;
    tenantUserId?: string | null;
    role?: string | null;
    teamId?: string | null;
    onboardingCompleted?: boolean | null;
  }
}
