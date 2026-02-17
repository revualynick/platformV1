import { auth } from "@/lib/auth";
import { getCurrentUser } from "@/lib/api";
import { redirect } from "next/navigation";
import { currentUser as mockUser } from "@/lib/mock-data";
import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingPage() {
  const session = await auth();
  const userId = session?.user?.id;

  let user;
  try {
    user = userId ? await getCurrentUser() : null;
  } catch {
    user = null;
  }

  // If already onboarded, redirect to dashboard
  if (user?.onboardingCompleted) {
    redirect("/dashboard");
  }

  const initialData = {
    name: user?.name ?? session?.user?.name ?? mockUser.name,
    email: user?.email ?? session?.user?.email ?? mockUser.email,
    role: user?.role ?? mockUser.role,
    timezone: user?.timezone ?? "America/New_York",
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-lg">
        <OnboardingWizard initialData={initialData} />
      </div>
    </div>
  );
}
