import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { PathBar } from "@/components/path-bar";
import { auth } from "@/lib/auth";

const navItems = [
  { label: "Organization", href: "/settings", icon: "◉" },
  { label: "Org Chart", href: "/settings/org-chart", icon: "◎" },
  { label: "People", href: "/settings/people", icon: "⊡" },
  { label: "Core Values", href: "/settings/values", icon: "◇" },
  { label: "Campaigns", href: "/settings/campaigns", icon: "◈" },
  { label: "Integrations", href: "/settings/integrations", icon: "⬡" },
  { label: "Escalations", href: "/settings/escalations", icon: "⚑" },
  { label: "Access", href: "/settings/access", icon: "⛊" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const isDemoMode = process.env.DEMO_MODE === "true";
  if (!session && !isDemoMode) redirect("/login");

  // /settings/* requires admin or super_admin (skip role check in demo mode)
  if (session && !["admin", "super_admin"].includes(session.role ?? "")) {
    redirect("/dashboard");
  }

  const userName = session?.user?.name ?? (isDemoMode ? "Demo Admin" : undefined);

  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar role="admin" items={navItems} userName={userName} />
      <main className="ml-[260px] flex-1 pl-4 pr-6 py-6 lg:pl-6 lg:pr-8 lg:py-8">
        <PathBar />
        {children}
      </main>
    </div>
  );
}
