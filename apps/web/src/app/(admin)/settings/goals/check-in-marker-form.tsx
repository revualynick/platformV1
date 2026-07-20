"use client";

import { useState, useTransition } from "react";

type ActionResult = { ok: true } | { ok: false; error: string };

export function CheckInMarkerForm({
  currentMarker,
  saveAction,
}: {
  currentMarker: string;
  saveAction: (formData: FormData) => Promise<ActionResult>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveAction(formData);
      if (!result.ok) setError(result.error);
      else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex items-end gap-3">
      <div className="flex-1">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-stone-400">
          Check-in title marker
        </label>
        <input
          name="checkInTitleMarker"
          defaultValue={currentMarker}
          maxLength={100}
          required
          className="w-full rounded-xl border border-stone-200 bg-surface px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest"
        />
        <p className="mt-1 text-xs text-stone-400">
          Google Meet events whose title contains this marker are treated as
          goal check-ins and their transcripts feed suggested updates.
        </p>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50"
      >
        {isPending ? "Saving..." : saved ? "Saved ✓" : "Save"}
      </button>
    </form>
  );
}
