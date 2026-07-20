"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/modal";

type ActionResult = { ok: true } | { ok: false; error: string };

export interface SuggestionView {
  id: string;
  suggestedProgressPercent: number | null;
  suggestedStatus: string | null;
  suggestedMetricCurrentValue: number | null;
  suggestedNote: string;
  evidenceQuote: string;
  meetingTitle: string;
  meetingDate: string;
}

export interface SuggestionGoalView {
  title: string;
  status: string;
  progressPercent: number;
  metricName: string | null;
  metricCurrentValue: number | null;
  metricTargetValue: number | null;
}

interface SuggestionReviewModalProps {
  open: boolean;
  onClose: () => void;
  goal: SuggestionGoalView;
  suggestion: SuggestionView;
  applyAction: (
    id: string,
    edits: {
      progressPercent?: number;
      metricCurrentValue?: number;
      status?: string;
      note?: string;
    },
  ) => Promise<ActionResult>;
  dismissAction: (id: string) => Promise<ActionResult>;
}

const inputClass =
  "w-full rounded-xl border border-stone-200 bg-surface px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest";
const labelClass =
  "mb-1.5 block text-xs font-medium uppercase tracking-wider text-stone-400";

const STATUS_LABELS: Record<string, string> = {
  on_track: "On track",
  at_risk: "At risk",
  behind: "Behind",
  achieved: "Achieved",
};

export function SuggestionReviewModal({
  open,
  onClose,
  goal,
  suggestion,
  applyAction,
  dismissAction,
}: SuggestionReviewModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasMetric = goal.metricName !== null;

  function handleApply(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const edits: Parameters<typeof applyAction>[1] = {};
      const progress = formData.get("progressPercent");
      if (typeof progress === "string" && progress !== "")
        edits.progressPercent = Number(progress);
      const metric = formData.get("metricCurrentValue");
      if (typeof metric === "string" && metric !== "")
        edits.metricCurrentValue = Number(metric);
      const status = formData.get("status");
      if (typeof status === "string" && status !== "") edits.status = status;
      const note = formData.get("note");
      if (typeof note === "string") edits.note = note;

      const result = await applyAction(suggestion.id, edits);
      if (!result.ok) setError(result.error);
      else onClose();
    });
  }

  function handleDismiss() {
    setError(null);
    startTransition(async () => {
      const result = await dismissAction(suggestion.id);
      if (!result.ok) setError(result.error);
      else onClose();
    });
  }

  const meetingDate = new Date(suggestion.meetingDate).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric" },
  );

  return (
    <Modal
      open={open}
      onClose={() => !isPending && onClose()}
      title="Suggested update"
    >
      <div className="space-y-4">
        <p className="text-xs text-stone-400">
          From <span className="text-stone-600">{suggestion.meetingTitle}</span>{" "}
          on {meetingDate} — extracted from the Meet transcript. Nothing is
          applied until you confirm.
        </p>

        <details className="text-xs text-stone-400">
          <summary className="cursor-pointer hover:text-stone-600">
            How do suggestions work?
          </summary>
          <p className="mt-1.5">
            Suggestions are extracted from your Meet check-in transcript by
            AI; the quote below shows the source. Applying records a normal
            goal update attributed to you. Dismissing discards it.
          </p>
        </details>

        <blockquote className="rounded-xl border-l-2 border-forest-light bg-stone-50 px-3 py-2 text-sm italic text-stone-600">
          "{suggestion.evidenceQuote || suggestion.suggestedNote}"
        </blockquote>

        <div className="rounded-xl bg-stone-50/70 px-3 py-2 text-xs text-stone-500">
          {hasMetric ? (
            <>
              {goal.metricName}:{" "}
              <span className="font-semibold">{goal.metricCurrentValue}</span>
              {suggestion.suggestedMetricCurrentValue !== null && (
                <>
                  {" "}
                  <span aria-hidden="true">→</span>
                  <span className="sr-only">changes to</span>{" "}
                  <span className="font-semibold text-forest">
                    {suggestion.suggestedMetricCurrentValue}
                  </span>
                </>
              )}{" "}
              (target {goal.metricTargetValue})
            </>
          ) : (
            <>
              Progress:{" "}
              <span className="font-semibold">{goal.progressPercent}%</span>
              {suggestion.suggestedProgressPercent !== null && (
                <>
                  {" "}
                  <span aria-hidden="true">→</span>
                  <span className="sr-only">changes to</span>{" "}
                  <span className="font-semibold text-forest">
                    {suggestion.suggestedProgressPercent}%
                  </span>
                </>
              )}
            </>
          )}
          {suggestion.suggestedStatus &&
            suggestion.suggestedStatus !== goal.status && (
              <>
                {" "}
                · status <span aria-hidden="true">→</span>
                <span className="sr-only">changes to</span>{" "}
                <span className="font-semibold text-forest">
                  {STATUS_LABELS[suggestion.suggestedStatus] ??
                    suggestion.suggestedStatus}
                </span>
              </>
            )}
        </div>

        <form action={handleApply} className="space-y-4">
          {hasMetric ? (
            <div>
              <label className={labelClass}>{goal.metricName} (current)</label>
              <input
                type="number"
                name="metricCurrentValue"
                step="any"
                defaultValue={
                  suggestion.suggestedMetricCurrentValue ??
                  goal.metricCurrentValue ??
                  undefined
                }
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
                defaultValue={
                  suggestion.suggestedProgressPercent ?? goal.progressPercent
                }
                className={inputClass}
              />
            </div>
          )}
          <div>
            <label className={labelClass}>Status</label>
            <select
              name="status"
              defaultValue={suggestion.suggestedStatus ?? goal.status}
              className={inputClass}
            >
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Note</label>
            <textarea
              name="note"
              rows={2}
              defaultValue={suggestion.suggestedNote}
              className={inputClass}
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={handleDismiss}
              disabled={isPending}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone-500 hover:bg-stone-100 hover:text-danger"
            >
              Dismiss
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100"
              >
                Later
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-xl bg-forest px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_rgba(61,24,55,0.25)] hover:bg-forest-light disabled:opacity-50"
              >
                {isPending ? "Applying..." : "Apply update"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
}
