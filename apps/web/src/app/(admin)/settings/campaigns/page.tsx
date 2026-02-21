import { getCampaigns } from "@/lib/api";
import type { CampaignRow } from "@/lib/api";
import { mockCampaigns } from "@/lib/mock-data";
import { CampaignsList } from "./campaigns-list";

async function loadCampaigns(): Promise<CampaignRow[]> {
  try {
    const { data } = await getCampaigns();
    return data;
  } catch {
    return mockCampaigns;
  }
}

export default async function CampaignsPage() {
  const campaigns = await loadCampaigns();

  const total = campaigns.length;
  const active = campaigns.filter(
    (c) => c.status === "collecting" || c.status === "analyzing",
  ).length;
  const scheduled = campaigns.filter((c) => c.status === "scheduled").length;
  const completed = campaigns.filter((c) => c.status === "complete").length;

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Configuration</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Campaigns
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">
          Manage feedback campaigns across your organization. Each campaign
          defines a time-bounded data collection effort with a linked
          questionnaire, target audience, and AI-powered lifecycle management.
        </p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "Total Campaigns",
            value: total.toString(),
            sub: "All campaigns",
            color: "text-stone-900",
          },
          {
            label: "Active",
            value: active.toString(),
            sub: "Collecting or analyzing",
            color: "text-forest",
          },
          {
            label: "Scheduled",
            value: scheduled.toString(),
            sub: "Upcoming launches",
            color: "text-sky-600",
          },
          {
            label: "Completed",
            value: completed.toString(),
            sub: "Finished campaigns",
            color: "text-positive",
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

      <CampaignsList campaigns={campaigns} />
    </div>
  );
}
