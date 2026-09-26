"use client";

import { useState, useTransition } from "react";
import type { IngestionMode } from "@/lib/api";
import type { ActionResult } from "@/lib/one-on-one-import-actions";
import { MODE_DESCRIPTION, MODE_LABEL } from "@/components/one-on-one-imports/labels";

const ALL: IngestionMode[] = ["manual", "semi_automatic", "automatic"];

export function ModeLimitsForm({
  maxMode,
  defaultMode,
  automaticAvailable,
  saveAction,
}: {
  maxMode: IngestionMode;
  defaultMode: IngestionMode;
  automaticAvailable: boolean;
  saveAction: (formData: FormData) => Promise<ActionResult>;
}) {
  const [max, setMax] = useState<IngestionMode>(maxMode);
  const [def, setDef] = useState<IngestionMode>(defaultMode);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const rank = (m: IngestionMode) => ALL.indexOf(m);
  const defaults = ALL.filter((m) => rank(m) <= rank(max) && (m !== "automatic" || automaticAvailable));

  function pickMax(m: IngestionMode) {
    setMax(m);
    if (rank(def) > rank(m)) setDef(m);
  }

  function submit() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("maxMode", max);
    fd.set("defaultMode", def);
    startTransition(async () => {
      const result = await saveAction(fd);
      if (!result.ok) setError(result.error);
      else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  }

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="text-xs font-medium uppercase tracking-wider text-stone-400">
          Most automatic mode managers may use
        </legend>
        <div className="mt-2 space-y-2">
          {ALL.map((m) => {
            const unavailable = m === "automatic" && !automaticAvailable;
            return (
              <label
                key={m}
                className={`flex cursor-pointer gap-3 rounded-xl border px-4 py-3 ${
                  max === m ? "border-forest bg-forest/5" : "border-stone-200"
                } ${unavailable ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <input
                  type="radio"
                  name="maxMode"
                  value={m}
                  checked={max === m}
                  disabled={unavailable}
                  onChange={() => pickMax(m)}
                  className="mt-1 accent-forest"
                />
                <span>
                  <span className="text-sm font-medium text-stone-800">
                    {m === "manual" ? "Manual only" : `Up to ${MODE_LABEL[m].toLowerCase()}`}
                  </span>
                  {unavailable && <span className="ml-2 text-xs text-stone-400">Not available yet</span>}
                  <span className="mt-0.5 block text-xs text-stone-500">{MODE_DESCRIPTION[m]}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="block">
        <span className="block text-xs font-medium uppercase tracking-wider text-stone-400">
          Default for managers who haven't chosen
        </span>
        <select
          value={def}
          onChange={(e) => setDef(e.target.value as IngestionMode)}
          className="mt-2 block w-full rounded-xl border border-stone-200 bg-surface px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest sm:w-72"
        >
          {defaults.map((m) => (
            <option key={m} value={m}>
              {MODE_LABEL[m]}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="rounded-xl bg-forest px-4 py-2.5 text-sm font-medium text-white hover:bg-forest/90 disabled:opacity-50"
        >
          {isPending ? "Saving..." : saved ? "Saved ✓" : "Save"}
        </button>
        <span className="text-xs text-stone-400">
          Lowering the limit moves managers above it down to the limit straight away.
        </span>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
