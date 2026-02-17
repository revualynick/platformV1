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
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    role: string;
    orgId: string;
    teamId: string | null;
    onboardingCompleted: boolean;
  }
}
