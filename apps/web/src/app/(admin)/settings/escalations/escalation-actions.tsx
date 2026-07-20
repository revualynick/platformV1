"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/modal";
import { transitionEscalationAction } from "./actions";

const inputClass =
  "w-full rounded-xl border border-stone-200 bg-surface px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest";
const labelClass =
  "mb-1.5 block text-xs font-medium uppercase tracking-wider text-stone-400";
const primaryButtonClass =
  "rounded-xl bg-forest shadow-[0_8px_20px_rgba(61,24,55,0.25)] px-4 py-2 text-xs font-medium text-white hover:bg-forest-light disabled:opacity-50";
const secondaryButtonClass =
  "rounded-xl border border-stone-200 bg-surface px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50";

type Transition = "investigating" | "resolved" | "dismissed";

export function EscalationActions({ id, status }: { id: string; status: string }) {
  const [open, setOpen] = useState<Transition | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openModal(target: Transition) {
    setNote("");
    setError(null);
    setOpen(target);
  }

  function close() {
    if (isPending) return;
    setOpen(null);
    setNote("");
    setError(null);
  }

  function submit(target: Transition) {
    setError(null);
    startTransition(async () => {
      const result = await transitionEscalationAction(
        id,
        target,
        note.trim() || undefined,
      );
      if (result.ok) {
        setOpen(null);
        setNote("");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {status === "open" && (
        <button
          onClick={() => openModal("investigating")}
          disabled={isPending}
          className={primaryButtonClass}
        >
          Begin Investigation
        </button>
      )}
      <button
        onClick={() => openModal("resolved")}
        disabled={isPending}
        className={secondaryButtonClass}
      >
        Mark Resolved
      </button>
      <button
        onClick={() => openModal("dismissed")}
        disabled={isPending}
        className={secondaryButtonClass}
      >
        Dismiss
      </button>
      {error && !open && <p className="text-xs text-danger">{error}</p>}

      <Modal open={open === "investigating"} onClose={close} title="Begin investigation">
        <p className="text-sm leading-relaxed text-stone-600">
          This moves the case to Investigating. An audit note records the
          transition.
        </p>
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-3 pt-5">
          <button
            type="button"
            onClick={close}
            disabled={isPending}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => submit("investigating")}
            disabled={isPending}
            className="rounded-xl bg-forest px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_rgba(61,24,55,0.25)] hover:bg-forest-light disabled:opacity-50"
          >
            {isPending ? "Updating..." : "Begin investigation"}
          </button>
        </div>
      </Modal>

      <Modal open={open === "resolved"} onClose={close} title="Mark resolved">
        <p className="text-sm leading-relaxed text-stone-600">
          Resolving closes this case with your resolution note in the audit
          trail. Reopening requires an admin status change.
        </p>
        <div className="mt-4">
          <label className={labelClass}>Resolution note</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            required
            placeholder="What was done to resolve this case?"
            className={inputClass}
          />
        </div>
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-3 pt-5">
          <button
            type="button"
            onClick={close}
            disabled={isPending}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => submit("resolved")}
            disabled={isPending || note.trim().length === 0}
            className="rounded-xl bg-forest px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_rgba(61,24,55,0.25)] hover:bg-forest-light disabled:opacity-50"
          >
            {isPending ? "Resolving..." : "Mark resolved"}
          </button>
        </div>
      </Modal>

      <Modal open={open === "dismissed"} onClose={close} title="Dismiss escalation">
        <p className="text-sm leading-relaxed text-stone-600">
          Use for false positives. Dismissing closes the case; the transition is
          recorded in the audit trail.
        </p>
        <div className="mt-4">
          <label className={labelClass}>Note (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Why is this a false positive?"
            className={inputClass}
          />
        </div>
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-3 pt-5">
          <button
            type="button"
            onClick={close}
            disabled={isPending}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => submit("dismissed")}
            disabled={isPending}
            className="rounded-xl bg-forest px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_rgba(61,24,55,0.25)] hover:bg-forest-light disabled:opacity-50"
          >
            {isPending ? "Dismissing..." : "Dismiss"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
