"use client";

import { useRef, useState, useTransition } from "react";
import { Modal } from "@/components/modal";

type ActionResult = { ok: true } | { ok: false; error: string };

interface Option {
  id: string;
  label: string;
}

interface CreateGoalModalProps {
  /** Which level this modal creates. Drives the visible fields. */
  level: "org" | "team" | "individual" | "personal";
  buttonLabel: string;
  /** Parent goals to ladder to (org goals for team level, team goals for individual). */
  parentOptions?: Option[];
  /** Teams the creator may target (team level only). */
  teamOptions?: Option[];
  /** People the goal can be created for (managers creating for reports). */
  ownerOptions?: Option[];
  cycleId?: string | null;
  cycleName?: string;
  createAction: (formData: FormData) => Promise<ActionResult>;
}

const inputClass =
  "w-full rounded-xl border border-stone-200 bg-surface px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest";
const labelClass =
  "mb-1.5 block text-xs font-medium uppercase tracking-wider text-stone-400";

export function CreateGoalModal({
  level,
  buttonLabel,
  parentOptions = [],
  teamOptions = [],
  ownerOptions = [],
  cycleId,
  cycleName,
  createAction,
}: CreateGoalModalProps) {
  const [open, setOpen] = useState(false);
  const [withMetric, setWithMetric] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const needsCycle = level !== "personal";
  const needsParent = level === "team" || level === "individual";

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createAction(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        formRef.current?.reset();
        setWithMetric(false);
        setOpen(false);
      }
    });
  }

  if (needsCycle && !cycleId) {
    return (
      <span className="text-xs text-stone-400">
        No active goal cycle — ask an admin to create one.
      </span>
    );
  }
  if (needsParent && parentOptions.length === 0) {
    return (
      <span className="text-xs text-stone-400">
        {level === "team"
          ? "No org goals to ladder to yet."
          : "No team goals to ladder to yet."}
      </span>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-forest px-4 py-2 text-sm font-medium text-white shadow-[0_8px_20px_rgba(61,24,55,0.25)] hover:bg-forest-light"
      >
        {buttonLabel}
      </button>

      <Modal
        open={open}
        onClose={() => !isPending && setOpen(false)}
        title={buttonLabel}
      >
        <form ref={formRef} action={handleSubmit} className="space-y-4">
          <input type="hidden" name="level" value={level} />
          {cycleId && <input type="hidden" name="cycleId" value={cycleId} />}

          {cycleName && (
            <p className="text-xs text-stone-400">Cycle: {cycleName}</p>
          )}

          <div>
            <label className={labelClass}>Title</label>
            <input
              name="title"
              required
              maxLength={255}
              placeholder={
                level === "personal"
                  ? "e.g. Learn Python"
                  : "What does success look like?"
              }
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea name="description" rows={2} className={inputClass} />
          </div>

          {needsParent && (
            <div>
              <label className={labelClass}>
                Ladders to {level === "team" ? "org goal" : "team goal"}
              </label>
              <select name="parentGoalId" required className={inputClass}>
                {parentOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {level === "team" && teamOptions.length > 0 && (
            <div>
              <label className={labelClass}>Team</label>
              <select name="teamId" required className={inputClass}>
                {teamOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {ownerOptions.length > 0 && (
            <div>
              <label className={labelClass}>Owner</label>
              <select name="ownerId" className={inputClass}>
                {ownerOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {level === "personal" && (
            <div>
              <label className={labelClass}>Target date (optional)</label>
              <input type="date" name="targetDate" className={inputClass} />
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 text-sm text-stone-600">
              <input
                type="checkbox"
                checked={withMetric}
                onChange={(e) => setWithMetric(e.target.checked)}
                className="accent-forest"
              />
              Track with a measurable metric
            </label>
          </div>

          {withMetric && (
            <div className="space-y-3 rounded-xl border border-stone-200/60 bg-stone-50/50 p-3">
              <div>
                <label className={labelClass}>Metric name</label>
                <input
                  name="metricName"
                  placeholder="e.g. NPS"
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Start value</label>
                  <input type="number" name="metricStartValue" step="any" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Target value</label>
                  <input type="number" name="metricTargetValue" step="any" className={inputClass} />
                </div>
              </div>
            </div>
          )}

          {level === "personal" && (
            <label className="flex items-center gap-2 text-sm text-stone-600">
              <input type="checkbox" name="shareWithManager" className="accent-forest" />
              Share with my manager
            </label>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
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
              {isPending ? "Creating..." : "Create goal"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
