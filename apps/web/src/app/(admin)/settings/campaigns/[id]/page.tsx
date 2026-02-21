import { getCampaign } from "@/lib/api";
import type { CampaignRow } from "@/lib/api";
import { mockCampaigns } from "@/lib/mock-data";
import { campaignStatusStyles } from "@/lib/style-constants";
import { PathNameProvider } from "@/lib/path-context";
import { CampaignDetail } from "./campaign-detail";

async function loadCampaign(id: string): Promise<CampaignRow | null> {
  try {
    return await getCampaign(id);
  } catch {
    return mockCampaigns.find((c) => c.id === id) ?? null;
  }
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await loadCampaign(id);

  if (!campaign) {
    return (
      <div className="max-w-6xl">
        <div className="rounded-2xl border border-dashed border-stone-200 p-12 text-center">
          <p className="text-sm text-stone-400">Campaign not found.</p>
        </div>
      </div>
    );
  }

  const status = campaignStatusStyles[campaign.status];

  return (
    <PathNameProvider names={{ [id]: campaign.name }}>
    <div className="max-w-6xl">
      {/* Header */}
      <div
        className="card-enter mb-8 flex items-start justify-between gap-4"
        style={{ animationDelay: "80ms" }}
      >
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
            {campaign.name}
          </h1>
          {campaign.description && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">
              {campaign.description}
            </p>
          )}
        </div>
        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${status?.bg} ${status?.text}`}
        >
          <span className={`h-2 w-2 rounded-full ${status?.dot}`} />
          {status?.label}
        </span>
      </div>

      {/* Client-side tabbed detail */}
      <CampaignDetail campaign={campaign} />
    </div>
    </PathNameProvider>
  );
}
