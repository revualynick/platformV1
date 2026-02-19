import { Sidebar } from "@/components/sidebar";
import { auth } from "@/lib/auth";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: "◉" },
  { label: "My Feedback", href: "/dashboard/feedback", icon: "◈" },
  { label: "1:1 Notes", href: "/dashboard/one-on-ones", icon: "◐" },
  { label: "Reflections", href: "/dashboard/reflections", icon: "◎" },
  { label: "Engagement", href: "/dashboard/engagement", icon: "△" },
  { label: "Kudos", href: "/dashboard/kudos", icon: "♡" },
  { label: "Demo Chat", href: "/dashboard/demo", icon: "◇" },
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
      <main className="ml-[260px] flex-1 p-8 lg:p-10">{children}</main>
    </div>
  );
}
