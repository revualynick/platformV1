import { Sidebar } from "@/components/sidebar";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: "◉" },
  { label: "My Feedback", href: "/dashboard/feedback", icon: "◈" },
  { label: "Engagement", href: "/dashboard/engagement", icon: "△" },
  { label: "Kudos", href: "/dashboard/kudos", icon: "♡" },
];

export default function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar role="employee" items={navItems} />
      <main className="ml-[260px] flex-1 p-8 lg:p-10">{children}</main>
    </div>
  );
}
