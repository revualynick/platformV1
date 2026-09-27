// Per-user authenticated pages must never be statically prerendered.
export const dynamic = "force-dynamic";

import { Sidebar } from "@/components/sidebar";
import { PathBar } from "@/components/path-bar";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: "◉" },
  { label: "My Feedback", href: "/dashboard/feedback", icon: "◈" },
  { label: "1:1 Notes", href: "/dashboard/one-on-ones", icon: "◐" },
  { label: "Reflections", href: "/dashboard/reflections", icon: "◎" },
  { label: "My Goals", href: "/dashboard/goals", icon: "◍" },
  { label: "Engagement", href: "/dashboard/engagement", icon: "△" },
  { label: "My Profile", href: "/dashboard/profile", icon: "◑" },
  { label: "Kudos", href: "/dashboard/kudos", icon: "♡" },
  { label: "Settings", href: "/dashboard/settings", icon: "⚙" },
];

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const isDemoMode = process.env.DEMO_MODE === "true";

  if (!session && !isDemoMode) {
    redirect("/login");
  }

  const userName = session?.user?.name ?? (isDemoMode ? "Demo User" : undefined);


  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar role="employee" items={navItems} userName={userName} />
      <main className="min-w-0 flex-1 px-4 pb-6 pt-20 lg:ml-[260px] lg:pl-6 lg:pr-8 lg:py-8">
        <PathBar />
        {children}
      </main>
    </div>
  );
}
