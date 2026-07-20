"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/modal";
import { reviewFlagAction } from "./actions";

interface FlagReviewButtonsProps {
  escalationId: string;
  subjectName: string;
  status: string;
}

const COPY = {
  investigate: {
    title: "Open investigation?",
    body: "This marks the flag as under investigation and makes it visible to admins for follow-up. An audit note records that you opened it.",
    confirm: "Open investigation",
  },
  dismiss: {
    title: "Dismiss this flag?",
    body: "Use this for false positives — it closes the flag as reviewed with an audit note. This can't be undone from here.",
    confirm: "Dismiss flag",
  },
} as const;

export function FlagReviewButtons({
  escalationId,
  subjectName,
  status,
}: FlagReviewButtonsProps) {
  const [confirming, setConfirming] = useState<"investigate" | "dismiss" | null>(
    null,
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openConfirm(action: "investigate" | "dismiss") {
    setNote("");
    setError(null);
    setConfirming(action);
  }

  function handleConfirm() {
    if (!confirming) return;
    setError(null);
    startTransition(async () => {
      const result = await reviewFlagAction(
        escalationId,
        confirming,
        note.trim() || undefined,
      );
      if (!result.ok) {
        setError(result.error);
      } else {
        setConfirming(null);
        setNote("");
      }
    });
  }

  const copy = confirming ? COPY[confirming] : null;

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        {status === "investigating" ? (
          <span className="rounded-full bg-sky-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-sky-600">
            Under investigation
          </span>
        ) : (
          <button
            onClick={() => openConfirm("investigate")}
            className="rounded-xl bg-surface px-4 py-2 text-xs font-medium text-stone-700 shadow-sm hover:shadow-md"
          >
            Investigate
          </button>
        )}
        <button
          onClick={() => openConfirm("dismiss")}
          className="rounded-xl border border-stone-200 bg-surface px-4 py-2 text-xs font-medium text-stone-500 hover:bg-stone-50"
        >
          Dismiss
        </button>
      </div>
      {error && !confirming && <p className="mt-2 text-xs text-danger">{error}</p>}

      <Modal
        open={confirming !== null}
        onClose={() => !isPending && setConfirming(null)}
        title={copy?.title ?? ""}
      >
        <div className="space-y-4">
          <p className="text-xs text-stone-400">Flag about {subjectName}</p>
          <p className="text-sm text-stone-600">{copy?.body}</p>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-stone-400">
              Note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Context for the audit trail"
              className="w-full rounded-xl border border-stone-200 bg-surface px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest"
            />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setConfirming(null)}
              disabled={isPending}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending}
              className="rounded-xl bg-forest px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_rgba(61,24,55,0.25)] hover:bg-forest-light disabled:opacity-50"
            >
              {isPending ? "Saving..." : copy?.confirm}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
