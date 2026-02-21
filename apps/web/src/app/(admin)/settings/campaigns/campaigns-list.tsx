"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CampaignRow } from "@/lib/api";
import { campaignStatusStyles } from "@/lib/style-constants";
import { Modal } from "@/components/modal";
import { createCampaignAction } from "./actions";

type StatusFilter = "all" | "draft" | "scheduled" | "collecting" | "analyzing" | "complete";

const filterOptions: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "collecting", label: "Collecting" },
  { value: "analyzing", label: "Analyzing" },
  { value: "complete", label: "Complete" },
];

function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  if (start && end) return `${fmt(start)} - ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  return `Until ${fmt(end!)}`;
}

interface CampaignsListProps {
  campaigns: CampaignRow[];
}

export function CampaignsList({ campaigns }: CampaignsListProps) {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const filtered =
    filter === "all"
      ? campaigns
      : campaigns.filter((c) => c.status === filter);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createCampaignAction(formData);
      if (result.ok) {
        setModalOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      {/* Filter bar + New button */}
      <div
        className="card-enter mb-6 flex flex-wrap items-center justify-between gap-3"
        style={{ animationDelay: "250ms" }}
      >
        <div className="flex flex-wrap items-center gap-2">
          {filterOptions.map((opt) => {
            const isActive = filter === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-forest text-white"
                    : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                }`}
              >
                {opt.label}
                {opt.value !== "all" && (
                  <span className="ml-1.5 tabular-nums">
                    {campaigns.filter((c) =>
                      opt.value === "all" ? true : c.status === opt.value,
                    ).length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded-xl bg-forest px-4 py-2.5 text-xs font-medium text-white hover:bg-forest-light"
        >
          + New Campaign
        </button>
      </div>

      {/* Campaign cards */}
      <div className="mb-10 grid gap-5 lg:grid-cols-2">
        {filtered.map((campaign, i) => {
          const status = campaignStatusStyles[campaign.status];
          const dateRange = formatDateRange(
            campaign.startDate,
            campaign.endDate,
          );
          const themeCount = campaign.questionnaire?.themes?.length ?? 0;

          return (
            <Link
              key={campaign.id}
              href={`/settings/campaigns/${campaign.id}`}
              className="card-enter group rounded-2xl border border-stone-200/60 bg-white p-6 transition-all hover:border-stone-300/60 hover:shadow-md"
              style={{
                animationDelay: `${300 + i * 80}ms`,
                boxShadow: "var(--shadow-sm)",
              }}
            >
              {/* Name + status */}
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-base font-semibold text-stone-800 group-hover:text-forest">
                  {campaign.name}
                </h3>
                <span
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${status?.bg} ${status?.text}`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${status?.dot}`}
                  />
                  {status?.label}
                </span>
              </div>

              {/* Description */}
              {campaign.description && (
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-stone-500">
                  {campaign.description}
                </p>
              )}

              {/* Meta row */}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {dateRange && (
                  <span className="flex items-center gap-1.5 text-xs text-stone-400">
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                      />
                    </svg>
                    {dateRange}
                  </span>
                )}
                {campaign.targetAudience && (
                  <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-medium text-stone-500">
                    {campaign.targetAudience}
                  </span>
                )}
                {campaign.questionnaire && (
                  <span className="rounded-full bg-forest/[0.06] px-2.5 py-0.5 text-[10px] font-medium text-forest">
                    {campaign.questionnaire.name}
                  </span>
                )}
                {themeCount > 0 && (
                  <span className="text-[10px] text-stone-300">
                    {themeCount} theme{themeCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </Link>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-stone-200 p-12 text-center">
            <p className="text-sm text-stone-400">
              {filter === "all"
                ? "No campaigns yet. Create your first campaign to get started."
                : `No ${filter} campaigns found.`}
            </p>
          </div>
        )}
      </div>

      {/* Create modal */}
      {modalOpen && (
        <Modal
          open
          onClose={() => {
            setModalOpen(false);
            setError(null);
          }}
          title="New Campaign"
        >
          <form action={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-600">
                  Name
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest"
                  placeholder="e.g. Q1 Sprint Reviews"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-600">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={3}
                  className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest"
                  placeholder="Describe the purpose and scope of this campaign..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-stone-600">
                    Start Date
                  </label>
                  <input
                    name="startDate"
                    type="date"
                    className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-stone-600">
                    End Date
                  </label>
                  <input
                    name="endDate"
                    type="date"
                    className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-600">
                  Target Audience
                </label>
                <input
                  name="targetAudience"
                  type="text"
                  className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest"
                  placeholder="e.g. Engineering, All Teams"
                />
              </div>
            </div>
            {error && <p className="mt-3 text-xs text-danger">{error}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setError(null);
                }}
                className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-xl bg-forest px-4 py-2 text-xs font-medium text-white hover:bg-forest-light disabled:opacity-50"
              >
                {isPending ? "Creating..." : "Create Campaign"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
