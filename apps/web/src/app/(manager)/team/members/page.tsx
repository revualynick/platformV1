import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUsers, getEngagementScores } from "@/lib/api";
import {
  teamMembers as mockTeamMembers,
} from "@/lib/mock-data";
import { trendIcons } from "@/lib/style-constants";

type TeamMember = {
  id: string;
  name: string;
  engagementScore: number;
  interactionsThisWeek: number;
  target: number;
  trend: string;
};

async function loadMembers() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  try {
    const usersResult = await getUsers({ managerId: userId });

    if (usersResult.data.length === 0) {
      return mockTeamMembers as TeamMember[];
    }

    const members = usersResult.data;
    const engResults = await Promise.allSettled(
      members.map((m) => getEngagementScores(m.id)),
    );

    return members.map((m, idx) => {
      const eng = engResults[idx];
      if (eng.status === "fulfilled" && eng.value.data.length > 0) {
        const latest = eng.value.data[eng.value.data.length - 1];
        const prev = eng.value.data.length > 1 ? eng.value.data[eng.value.data.length - 2] : null;
        const delta = prev ? latest.averageQualityScore - prev.averageQualityScore : 0;
        return {
          id: m.id,
          name: m.name,
          engagementScore: latest.averageQualityScore,
          interactionsThisWeek: latest.interactionsCompleted,
          target: latest.interactionsTarget,
          trend: delta > 2 ? "up" : delta < -2 ? "down" : "stable",
        };
      }
      return {
        id: m.id,
        name: m.name,
        engagementScore: 0,
        interactionsThisWeek: 0,
        target: 3,
        trend: "stable",
      };
    });
  } catch {
    return mockTeamMembers as TeamMember[];
  }
}

export default async function TeamMembersPage() {
  const teamMembers = await loadMembers();

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Manager</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Team Members
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          {teamMembers.length} active members. Click a card to view their full profile.
        </p>
      </div>

      {/* Members grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {teamMembers.map((member) => {
          const trend = trendIcons[member.trend] ?? trendIcons.stable;
          return (
            <Link
              key={member.id}
              href={`/team/members/${member.id}`}
              className="group block cursor-pointer rounded-2xl border border-stone-200/60 bg-white p-5 transition-all hover:border-forest/20 hover:shadow-md"
              style={{ boxShadow: "var(--shadow-sm)" }}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-sm font-medium text-stone-600">
                  {member.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
                <div>
                  <p className="text-sm font-medium text-stone-800">
                    {member.name}
                  </p>
                  <p className="text-xs text-stone-400">
                    {member.interactionsThisWeek}/{member.target} interactions
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
                    Engagement
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-display text-xl font-semibold ${
                        member.engagementScore >= 70
                          ? "text-forest"
                          : member.engagementScore >= 50
                            ? "text-warning"
                            : "text-danger"
                      }`}
                    >
                      {member.engagementScore}
                    </span>
                    <span className={`text-xs ${trend.color}`}>
                      {trend.icon}
                    </span>
                  </div>
                </div>
                {/* Mini bar */}
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className={`h-full rounded-full transition-all ${
                      member.engagementScore >= 70
                        ? "bg-forest"
                        : member.engagementScore >= 50
                          ? "bg-warning"
                          : "bg-danger"
                    }`}
                    style={{ width: `${member.engagementScore}%` }}
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-end gap-1 text-xs font-medium text-stone-400 transition-colors group-hover:text-forest">
                View profile <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
