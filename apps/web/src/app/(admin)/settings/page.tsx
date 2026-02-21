import Link from "next/link";
import { getOrgConfig } from "@/lib/api";
import {
  coreValues as mockCoreValues,
  teamMembers,
  mockCampaigns,
  integrations,
  escalations,
} from "@/lib/mock-data";
import { ValuesCard } from "./values-card";

async function loadValues() {
  try {
    const { coreValues } = await getOrgConfig();
    return coreValues.map((v) => ({
      id: v.id,
      name: v.name,
      description: v.description,
      active: v.isActive,
    }));
  } catch {
    return mockCoreValues;
  }
}

const quickLinks = [
  {
    label: "People",
    href: "/settings/people",
    icon: "⊡",
    description: "Team members, roles, and reporting lines",
    stat: `${teamMembers.length} members`,
  },
  {
    label: "Campaigns",
    href: "/settings/campaigns",
    icon: "◈",
    description: "Review cycles and feedback collection",
    stat: `${mockCampaigns.filter((c) => c.status === "collecting").length} active`,
  },
  {
    label: "Integrations",
    href: "/settings/integrations",
    icon: "⬡",
    description: "Chat platforms, calendars, and data sources",
    stat: `${integrations.filter((i) => i.status === "connected").length} connected`,
  },
  {
    label: "Escalations",
    href: "/settings/escalations",
    icon: "⚑",
    description: "Flagged items requiring HR review",
    stat: `${escalations.filter((e) => e.status === "open").length} open`,
  },
];

// Mock "needs attention" items — in production these come from API health checks
const openEscCount = escalations.filter((e) => e.status === "open").length;
const disconnectedCount = integrations.filter((i) => i.status !== "connected").length;
const draftCount = mockCampaigns.filter((c) => c.status === "draft").length;

const attentionItems = [
  ...(openEscCount > 0
    ? [{ icon: "⚑", text: `${openEscCount} escalation${openEscCount > 1 ? "s" : ""} awaiting review`, href: "/settings/escalations", severity: "warn" as const }]
    : []),
  ...(draftCount > 0
    ? [{ icon: "◈", text: `${draftCount} draft campaign${draftCount > 1 ? "s" : ""} pending launch`, href: "/settings/campaigns", severity: "info" as const }]
    : []),
  ...(disconnectedCount > 0
    ? [{ icon: "⬡", text: `${disconnectedCount} integration${disconnectedCount > 1 ? "s" : ""} not connected`, href: "/settings/integrations", severity: "info" as const }]
    : []),
];

const attentionSeverityStyles = {
  warn: "bg-terracotta/[0.06] text-terracotta",
  info: "bg-forest/[0.06] text-forest",
};

export default async function AdminSettings() {
  const coreValues = await loadValues();
  const activeCampaigns = mockCampaigns.filter((c) => c.status === "collecting").length;
  const participationRate = Math.round(
    (teamMembers.filter((m) => m.interactionsThisWeek > 0).length / teamMembers.length) * 100,
  );

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Administration</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Acme Corp
        </h1>
      </div>

      {/* Organization profile */}
      <div
        className="card-enter mb-8 rounded-2xl border border-stone-200/60 bg-white p-6"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-forest text-xl font-display font-semibold text-white">
              A
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-stone-900">Acme Corp</h2>
              <div className="mt-1 flex items-center gap-3 text-xs text-stone-400">
                <span>acmecorp.revualy.com</span>
                <span>&middot;</span>
                <span>America/New_York</span>
                <span>&middot;</span>
                <span>{teamMembers.length} members</span>
              </div>
            </div>
          </div>
          <button className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50">
            Edit
          </button>
        </div>
      </div>

      {/* Top stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "Team Size",
            value: teamMembers.length.toString(),
            sub: "Active members",
            color: "text-stone-900",
          },
          {
            label: "Participation",
            value: `${participationRate}%`,
            sub: "Active this week",
            color: participationRate >= 70 ? "text-forest" : "text-terracotta",
          },
          {
            label: "Active Campaigns",
            value: activeCampaigns.toString(),
            sub: "Collecting feedback",
            color: "text-forest",
          },
          {
            label: "Core Values",
            value: coreValues.length.toString(),
            sub: "Defined",
            color: "text-forest",
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
            <p className="mt-1 text-xs text-stone-400">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left column: Core Values */}
        <div className="lg:col-span-7">
          <div
            className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6"
            style={{ animationDelay: "300ms", boxShadow: "var(--shadow-sm)" }}
          >
            <ValuesCard values={coreValues} />
          </div>
        </div>

        {/* Right column: Needs attention + Quick access */}
        <div className="space-y-6 lg:col-span-5">
          {/* Needs attention */}
          {attentionItems.length > 0 && (
            <div
              className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6"
              style={{ animationDelay: "400ms", boxShadow: "var(--shadow-sm)" }}
            >
              <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
                Needs Attention
              </h3>
              <div className="space-y-2">
                {attentionItems.map((item) => (
                  <Link
                    key={item.text}
                    href={item.href}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-stone-50"
                  >
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs ${attentionSeverityStyles[item.severity]}`}>
                      {item.icon}
                    </span>
                    <span className="text-sm text-stone-600">{item.text}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Quick access */}
          <div
            className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6"
            style={{ animationDelay: "500ms", boxShadow: "var(--shadow-sm)" }}
          >
            <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
              Quick Access
            </h3>
            <div className="space-y-2">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-4 rounded-xl px-4 py-3 transition-colors hover:bg-stone-50"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-forest/[0.06] text-base">
                    {link.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-800">
                      {link.label}
                    </p>
                    <p className="truncate text-xs text-stone-400">
                      {link.description}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-medium text-stone-500">
                    {link.stat}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
