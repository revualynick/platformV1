import {
  orgPeople,
  orgThreads,
} from "@/lib/mock-data";
import { TeamOrgChart } from "./team-org-chart";

// Manager = Jordan Wells (p2). Show manager + their direct reports.
const MANAGER_ID = "p2";

export default function OrgChartPage() {
  const teamIds = new Set<string>();
  teamIds.add(MANAGER_ID);
  for (const p of orgPeople) {
    if (p.reportsTo === MANAGER_ID) teamIds.add(p.id);
  }

  const teamPeople = orgPeople
    .filter((p) => teamIds.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      title: p.title,
      team: p.team,
      reportsTo: p.reportsTo,
    }));

  const teamThreads = orgThreads.filter(
    (t) => teamIds.has(t.from) && teamIds.has(t.to),
  );

  const reportingLines = teamPeople.filter((p) => p.reportsTo && teamIds.has(p.reportsTo)).length;

  return (
    <div className="max-w-[1200px]">
      {/* Header */}
      <div className="mb-8">
        <p className="text-sm font-medium text-stone-400">Organization</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Team Org Chart
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">
          Your team&apos;s reporting structure with relationship threads. Drag
          people to rearrange — their reports will rebalance automatically.
        </p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        {[
          {
            label: "Team Members",
            value: teamPeople.length.toString(),
            color: "text-forest",
          },
          {
            label: "Reporting Lines",
            value: reportingLines.toString(),
            color: "text-stone-900",
          },
          {
            label: "Threads",
            value: teamThreads.length.toString(),
            sub: "Relationship links",
            color: "text-terracotta",
          },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className="card-enter rounded-2xl border border-stone-200/60 bg-white p-5"
            style={{
              animationDelay: `${i * 80}ms`,
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
              {stat.label}
            </span>
            <p
              className={`mt-1 font-display text-2xl font-semibold ${stat.color}`}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <TeamOrgChart
        people={teamPeople}
        threads={teamThreads}
        managerId={MANAGER_ID}
      />
    </div>
  );
}
