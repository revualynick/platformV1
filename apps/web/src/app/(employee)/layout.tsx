// Per-user authenticated pages must never be statically prerendered.
export const dynamic = "force-dynamic";

import { Sidebar } from "@/components/sidebar";
import { PathBar } from "@/components/path-bar";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getSupportMe } from "@/lib/api";

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

  // Support contacts get the queue of people who asked to be contacted.
  let isSupportContact = false;
  if (session) {
    try {
      isSupportContact = (await getSupportMe()).isContact;
    } catch {
      // No link; the page itself checks again.
    }
  }
  const items = isSupportContact
    ? [...navItems.slice(0, -1), { label: "Support requests", href: "/dashboard/support", icon: "✚" }, navItems[navItems.length - 1]]
    : navItems;

  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar role="employee" items={items} userName={userName} />
      <main className="min-w-0 flex-1 px-4 pb-6 pt-20 lg:ml-[260px] lg:pl-6 lg:pr-8 lg:py-8">
        <PathBar />
        {children}
      </main>
    </div>
  );
}
