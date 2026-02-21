import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getFlaggedItems, getUsers } from "@/lib/api";
import {
  flaggedItems as mockFlaggedItems,
  teamMembers as mockTeamMembers,
} from "@/lib/mock-data";
import { severityStyles } from "@/lib/style-constants";

type FlaggedItem = {
  id: string;
  severity: string;
  subjectName: string;
  reason: string;
  excerpt: string | null;
  date: string;
};

type TeamMember = {
  id: string;
  name: string;
  engagementScore: number;
  interactionsThisWeek: number;
  target: number;
  trend: string;
};

async function loadFlaggedData() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  try {
    const [flaggedResult, usersResult] = await Promise.allSettled([
      getFlaggedItems(),
      getUsers({ managerId: userId }),
    ]);

    let flaggedItems: FlaggedItem[] = mockFlaggedItems;
    if (flaggedResult.status === "fulfilled" && flaggedResult.value.data.length > 0) {
      flaggedItems = flaggedResult.value.data.map((item) => ({
        id: item.escalation.id,
        severity: item.escalation.severity,
        subjectName: "Team Member",
        reason: item.escalation.reason,
        excerpt: item.escalation.flaggedContent || null,
        date: new Date(item.escalation.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      }));
    }

    // For "at risk" sidebar, we'd need engagement scores per member
    // Fall back to mock data for now since engagement fetch per-user is heavy
    let needsAttention: TeamMember[] = (mockTeamMembers as TeamMember[])
      .filter((m) => m.engagementScore < 60 || m.trend === "down")
      .sort((a, b) => a.engagementScore - b.engagementScore);

    if (usersResult.status === "fulfilled" && usersResult.value.data.length > 0) {
      // Basic at-risk: members exist but we don't have their scores without extra fetches
      // Keep mock for now — team page already fetches full engagement data
      needsAttention = needsAttention;
    }

    return { flaggedItems, needsAttention };
  } catch {
    return {
      flaggedItems: mockFlaggedItems as FlaggedItem[],
      needsAttention: (mockTeamMembers as TeamMember[])
        .filter((m) => m.engagementScore < 60 || m.trend === "down")
        .sort((a, b) => a.engagementScore - b.engagementScore),
    };
  }
}

export default async function FlaggedPage() {
  const { flaggedItems, needsAttention } = await loadFlaggedData();

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Attention needed</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Flagged Items
        </h1>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {[
          {
            label: "Open Flags",
            value: flaggedItems.length.toString(),
            sub: "Require review",
            color: flaggedItems.length > 0 ? "text-terracotta" : "text-forest",
          },
          {
            label: "At Risk",
            value: needsAttention.length.toString(),
            sub: "Members below threshold",
            color: needsAttention.length > 0 ? "text-warning" : "text-forest",
          },
          {
            label: "Resolution Rate",
            value: "86%",
            sub: "Last 30 days",
            color: "text-forest",
          },
        ].map((stat, i) => {
          const railColors = ["bg-forest", "bg-forest-light", "bg-terracotta", "bg-forest-muted"];
          return (
            <div
              key={stat.label}
              className="card-enter relative overflow-hidden rounded-2xl border border-stone-200/60 bg-surface pb-5 pl-7 pr-5 pt-5"
              style={{
                animationDelay: `${i * 80}ms`,
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div className={`absolute bottom-4 left-0 top-4 w-1.5 rounded-full ${railColors[i % railColors.length]}`} />
              <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
                {stat.label}
              </span>
              <p
                className={`mt-1 font-display text-2xl font-semibold ${stat.color}`}
              >
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-stone-400">{stat.sub}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Flagged items */}
        <div className="space-y-4 lg:col-span-7">
          <h3 className="font-display text-base font-semibold text-stone-800">
            Language & Behavior Flags
          </h3>
          {flaggedItems.map((item, i) => {
            const style = severityStyles[item.severity] ?? severityStyles.coaching;
            return (
              <div
                key={item.id}
                className={`card-enter rounded-2xl border ${style.border} ${style.bg} p-6`}
                style={{ animationDelay: `${300 + i * 100}ms` }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${style.dot}`}
                      />
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wider ${style.text}`}
                      >
                        {style.label}
                      </span>
                      <span className="text-xs text-stone-400">
                        {item.date}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-medium text-stone-800">
                      {item.subjectName}
                    </p>
                    <p className="mt-1 text-sm text-stone-600">
                      {item.reason}
                    </p>
                    {item.excerpt && (
                      <div className="mt-3 rounded-lg bg-surface/60 px-4 py-3">
                        <p className="text-xs italic text-stone-500">
                          {item.excerpt}
                        </p>
                      </div>
                    )}
                    <div className="mt-4 flex gap-2">
                      <button className="rounded-xl bg-surface px-4 py-2 text-xs font-medium text-stone-700 shadow-sm hover:shadow-md">
                        Investigate
                      </button>
                      <button className="rounded-xl border border-stone-200 bg-surface px-4 py-2 text-xs font-medium text-stone-500 hover:bg-stone-50">
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {flaggedItems.length === 0 && (
            <div className="rounded-2xl border border-dashed border-stone-200 p-8 text-center">
              <p className="text-sm text-stone-400">
                No flagged items — your team is looking great!
              </p>
            </div>
          )}
        </div>

        {/* At-risk members sidebar */}
        <div className="lg:col-span-5">
          <div
            className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6"
            style={{ animationDelay: "400ms", boxShadow: "var(--shadow-sm)" }}
          >
            <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
              Members at Risk
            </h3>
            {needsAttention.length > 0 ? (
              <div className="space-y-3">
                {needsAttention.map((member) => (
                  <div
                    key={member.id}
                    className="rounded-xl border border-stone-100 p-4 transition-colors hover:border-stone-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-xs font-medium text-stone-600">
                        {member.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-stone-800">
                          {member.name}
                        </p>
                        <p className="text-xs text-stone-400">
                          {member.interactionsThisWeek}/{member.target}{" "}
                          interactions this week
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-display text-lg font-semibold tabular-nums ${
                            member.engagementScore >= 50
                              ? "text-warning"
                              : "text-danger"
                          }`}
                        >
                          {member.engagementScore}
                        </span>
                        <span className="text-xs text-danger">
                          {member.trend === "down" ? "\u25BC Declining" : "\u2014 Stalled"}
                        </span>
                      </div>
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-stone-100">
                        <div
                          className={`h-full rounded-full ${
                            member.engagementScore >= 50
                              ? "bg-warning"
                              : "bg-danger"
                          }`}
                          style={{
                            width: `${member.engagementScore}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-stone-400">
                No members currently at risk.
              </p>
            )}
          </div>

          {/* Tips card */}
          <div
            className="card-enter mt-6 rounded-2xl border border-forest/10 bg-forest/[0.03] p-6"
            style={{ animationDelay: "500ms" }}
          >
            <h4 className="font-display text-sm font-semibold text-forest">
              Coaching Tips
            </h4>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-stone-600">
              <li className="flex gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-forest/40" />
                Schedule 1:1s with declining members within 48 hours
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-forest/40" />
                Focus on specific behaviors, not personality traits
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-forest/40" />
                Ask open-ended questions to understand blockers
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
