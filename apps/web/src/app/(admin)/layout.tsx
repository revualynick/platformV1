import { Sidebar } from "@/components/sidebar";

const navItems = [
  { label: "Organization", href: "/settings", icon: "◉" },
  { label: "Core Values", href: "/settings/values", icon: "◇" },
  { label: "Question Bank", href: "/settings/questions", icon: "◈" },
  { label: "Integrations", href: "/settings/integrations", icon: "⬡" },
  { label: "Escalations", href: "/settings/escalations", icon: "⚑" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar role="admin" items={navItems} userName="Jordan Wells" />
      <main className="ml-[260px] flex-1 p-8 lg:p-10">{children}</main>
    </div>
  );
}
