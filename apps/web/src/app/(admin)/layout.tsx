// Per-user authenticated pages must never be statically prerendered.
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { PathBar } from "@/components/path-bar";
import { auth } from "@/lib/auth";

const navItems = [
  { label: "Organization", href: "/settings", icon: "◉" },
  { label: "Org Chart", href: "/settings/org-chart", icon: "◎" },
  { label: "People", href: "/settings/people", icon: "⊡" },
  { label: "Core Values", href: "/settings/values", icon: "◇" },
  { label: "Goals", href: "/settings/goals", icon: "◍" },
  { label: "1:1 Notes", href: "/settings/one-on-ones", icon: "◐" },
  { label: "Campaigns", href: "/settings/campaigns", icon: "◈" },
  { label: "Integrations", href: "/settings/integrations", icon: "⬡" },
  { label: "Escalations", href: "/settings/escalations", icon: "⚑" },
  { label: "Access", href: "/settings/access", icon: "⛊" },
  { label: "Support", href: "/settings/support", icon: "✚" },
  { label: "Break-glass", href: "/settings/break-glass", icon: "⚿" },
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
      <main className="min-w-0 flex-1 px-4 pb-6 pt-20 lg:ml-[260px] lg:pl-6 lg:pr-8 lg:py-8">
        <PathBar />
        {children}
      </main>
    </div>
  );
}
