"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/modal";
import { InfoHint } from "@/components/info-hint";
import { GoalStatusBadge } from "./status-badge";
import { GoalProgressBar } from "./progress-bar";
import {
  SuggestionReviewModal,
  type SuggestionView,
} from "./suggestion-review-modal";

export interface GoalCardGoal {
  id: string;
  level: "org" | "team" | "individual" | "personal";
  title: string;
  description: string;
  status: string;
  progressPercent: number;
  effectiveProgress: number;
  metricName: string | null;
  metricStartValue: number | null;
  metricTargetValue: number | null;
  metricCurrentValue: number | null;
  shareWithManager: boolean;
  targetDate: string | null;
  parentTitle?: string | null;
  ownerName?: string;
  alignmentPercent?: number | null;
}

type ActionResult = { ok: true } | { ok: false; error: string };

interface GoalCardProps {
  goal: GoalCardGoal;
  /** Server action: check in on this goal (FormData includes goalId). */
  checkInAction?: (formData: FormData) => Promise<ActionResult>;
  /** Server action: toggle manager sharing (personal goals only). */
  toggleShareAction?: (goalId: string, share: boolean) => Promise<ActionResult>;
  /** Pending transcript suggestions awaiting review on this goal. */
  suggestions?: SuggestionView[];
  applySuggestionAction?: (
    id: string,
    edits: {
      progressPercent?: number;
      metricCurrentValue?: number;
      status?: string;
      note?: string;
    },
  ) => Promise<ActionResult>;
  dismissSuggestionAction?: (id: string) => Promise<ActionResult>;
}

const STATUS_OPTIONS = [
  { value: "on_track", label: "On track" },
  { value: "at_risk", label: "At risk" },
  { value: "behind", label: "Behind" },
  { value: "achieved", label: "Achieved" },
] as const;

const inputClass =
  "w-full rounded-xl border border-stone-200 bg-surface px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest";
const labelClass =
  "mb-1.5 block text-xs font-medium uppercase tracking-wider text-stone-400";

export function GoalCard({
  goal,
  checkInAction,
  toggleShareAction,
  suggestions = [],
  applySuggestionAction,
  dismissSuggestionAction,
}: GoalCardProps) {
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasMetric = goal.metricName !== null;
  const pendingSuggestion =
    applySuggestionAction && dismissSuggestionAction && suggestions.length > 0
      ? suggestions[0]
      : null;

  function handleCheckIn(formData: FormData) {
    if (!checkInAction) return;
    setError(null);
    startTransition(async () => {
      const result = await checkInAction(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        setCheckInOpen(false);
      }
    });
  }

  function handleToggleShare() {
    if (!toggleShareAction) return;
    startTransition(async () => {
      await toggleShareAction(goal.id, !goal.shareWithManager);
    });
  }

  return (
    <div
      className="rounded-2xl border border-stone-200/60 bg-surface p-5"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-48">
          <h3 className="truncate font-display text-base font-semibold text-stone-900">
            {goal.title}
          </h3>
          {goal.parentTitle && (
            <p className="mt-0.5 truncate text-xs text-stone-400">
              ↳ ladders to <span className="text-stone-500">{goal.parentTitle}</span>
            </p>
          )}
          {goal.ownerName && (
            <p className="mt-0.5 text-xs text-stone-400">{goal.ownerName}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pendingSuggestion && (
            <button
              onClick={() => setReviewOpen(true)}
              className="rounded-full bg-forest-light/15 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-forest-light hover:bg-forest-light/25"
            >
              ✨ Suggested update
            </button>
          )}
          {goal.level === "personal" && (
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-stone-500">
              {goal.shareWithManager ? "Shared with manager" : "Private"}
            </span>
          )}
          <GoalStatusBadge status={goal.status} />
        </div>
      </div>

      {goal.description && (
        <p className="mb-3 line-clamp-2 text-sm text-stone-600">{goal.description}</p>
      )}

      <GoalProgressBar
        percent={goal.effectiveProgress}
        status={goal.status}
        alignmentPercent={goal.alignmentPercent}
      />

      <div className="mt-2 flex items-center justify-between text-xs text-stone-400">
        <span>
          {hasMetric
            ? `${goal.metricName}: ${goal.metricCurrentValue} (target ${goal.metricTargetValue})`
            : goal.targetDate
              ? `Target ${goal.targetDate}`
              : ""}
          {goal.alignmentPercent !== null && goal.alignmentPercent !== undefined && (
            <span className="ml-2 text-forest-light">
              alignment {goal.alignmentPercent}%
              <InfoHint entry="alignment" />
            </span>
          )}
        </span>
        <span className="flex items-center gap-3">
          {goal.level === "personal" && toggleShareAction && (
            <button
              onClick={handleToggleShare}
              disabled={isPending}
              title="Personal goals are private by default. Sharing lets your manager see this one — useful for growth conversations in 1:1s."
              className="font-medium text-stone-500 hover:text-forest disabled:opacity-50"
            >
              {goal.shareWithManager ? "Make private" : "Share with manager"}
            </button>
          )}
          {checkInAction && (
            <button
              onClick={() => setCheckInOpen(true)}
              className="font-medium text-forest hover:text-forest-light"
            >
              Check in
            </button>
          )}
        </span>
      </div>

      {pendingSuggestion && applySuggestionAction && dismissSuggestionAction && (
        <SuggestionReviewModal
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          goal={goal}
          suggestion={pendingSuggestion}
          applyAction={applySuggestionAction}
          dismissAction={dismissSuggestionAction}
        />
      )}

      <Modal
        open={checkInOpen}
        onClose={() => !isPending && setCheckInOpen(false)}
        title={`Check in — ${goal.title}`}
      >
        <form action={handleCheckIn} className="space-y-4">
          <input type="hidden" name="goalId" value={goal.id} />
          {hasMetric ? (
            <div>
              <label className={labelClass}>
                {goal.metricName} (current value, target {goal.metricTargetValue})
              </label>
              <input
                type="number"
                name="metricCurrentValue"
                step="any"
                defaultValue={goal.metricCurrentValue ?? undefined}
                className={inputClass}
              />
            </div>
          ) : (
            <div>
              <label className={labelClass}>Progress (%)</label>
              <input
                type="number"
                name="progressPercent"
                min={0}
                max={100}
                defaultValue={goal.progressPercent}
                className={inputClass}
              />
            </div>
          )}
          <div>
            <label className={labelClass}>Status</label>
            <select name="status" defaultValue={goal.status} className={inputClass}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Note</label>
            <textarea
              name="note"
              rows={3}
              placeholder="What moved? What's blocked?"
              className={inputClass}
            />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCheckInOpen(false)}
              disabled={isPending}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-xl bg-forest px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_rgba(61,24,55,0.25)] hover:bg-forest-light disabled:opacity-50"
            >
              {isPending ? "Saving..." : "Save check-in"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
