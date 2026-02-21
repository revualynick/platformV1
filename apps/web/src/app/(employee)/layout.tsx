import { Sidebar } from "@/components/sidebar";
import { PathBar } from "@/components/path-bar";
import { auth } from "@/lib/auth";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: "◉" },
  { label: "My Feedback", href: "/dashboard/feedback", icon: "◈" },
  { label: "1:1 Notes", href: "/dashboard/one-on-ones", icon: "◐" },
  { label: "Reflections", href: "/dashboard/reflections", icon: "◎" },
  { label: "Engagement", href: "/dashboard/engagement", icon: "△" },
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
  const userName = session?.user?.name ?? (isDemoMode ? "Demo User" : undefined);

  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar role="employee" items={navItems} userName={userName} />
      <main className="ml-[260px] flex-1 px-6 py-6 lg:px-8 lg:py-8">
        <PathBar />
        {children}
      </main>
    </div>
  );
}
