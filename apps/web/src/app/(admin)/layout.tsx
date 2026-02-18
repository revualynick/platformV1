import { Sidebar } from "@/components/sidebar";
import { auth } from "@/lib/auth";

const navItems = [
  { label: "Organization", href: "/settings", icon: "◉" },
  { label: "People", href: "/settings/people", icon: "⊡" },
  { label: "Core Values", href: "/settings/values", icon: "◇" },
  { label: "Questionnaires", href: "/settings/questions", icon: "◈" },
  { label: "Integrations", href: "/settings/integrations", icon: "⬡" },
  { label: "Escalations", href: "/settings/escalations", icon: "⚑" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const userName = session?.user?.name ?? undefined;

  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar role="admin" items={navItems} userName={userName} />
      <main className="ml-[260px] flex-1 p-8 lg:p-10">{children}</main>
    </div>
  );
}
