import { Sidebar } from "@/components/sidebar";

const navItems = [
  { label: "Team Overview", href: "/team", icon: "◉" },
  { label: "Team Feedback", href: "/team/feedback", icon: "◈" },
  { label: "Flagged Items", href: "/team/flagged", icon: "⚑" },
  { label: "Leaderboard", href: "/team/leaderboard", icon: "◆" },
];

export default function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar role="manager" items={navItems} userName="Alex Thompson" />
      <main className="ml-[260px] flex-1 p-8 lg:p-10">{children}</main>
    </div>
  );
}
