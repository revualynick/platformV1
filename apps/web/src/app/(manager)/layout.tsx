import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { auth } from "@/lib/auth";

const navItems = [
  { label: "Team Overview", href: "/team", icon: "◉" },
  { label: "Team Feedback", href: "/team/feedback", icon: "◈" },
  { label: "Team Members", href: "/team/members", icon: "◑" },
  { label: "Flagged Items", href: "/team/flagged", icon: "⚑" },
  { label: "Leaderboard", href: "/team/leaderboard", icon: "◆" },
  { label: "Question Bank", href: "/team/questions", icon: "◇" },
  { label: "Org Chart", href: "/team/org-chart", icon: "◎" },
];

export default async function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  // /team/* requires manager or admin
  if (session.role === "employee") {
    redirect("/dashboard");
  }

  const userName = session.user?.name ?? undefined;

  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar role="manager" items={navItems} userName={userName} />
      <main className="ml-[260px] flex-1 p-8 lg:p-10">{children}</main>
    </div>
  );
}
