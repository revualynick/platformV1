import { Sidebar } from "@/components/sidebar";

const navItems = [
  { label: "Team Overview", href: "/team", icon: "◉" },
  { label: "Team Feedback", href: "/team/feedback", icon: "◈" },
  { label: "Team Members", href: "/team/members", icon: "◑" },
  { label: "Flagged Items", href: "/team/flagged", icon: "⚑" },
  { label: "Leaderboard", href: "/team/leaderboard", icon: "◆" },
  { label: "Question Bank", href: "/team/questions", icon: "◇" },
  { label: "Org Chart", href: "/team/org-chart", icon: "◎" },
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
