import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Dashboard sub-layout: redirects to onboarding if not completed.
 * This wraps /dashboard/* but NOT /onboarding/*, preventing infinite loops.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  if (session.user.onboardingCompleted === false) {
    redirect("/onboarding");
  }

  return children;
}
