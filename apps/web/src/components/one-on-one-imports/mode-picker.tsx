"use client";

import { useState, useTransition } from "react";
import type { IngestionMode, IngestionModeInfo } from "@/lib/api";
import type { ActionResult } from "@/lib/one-on-one-import-actions";
import { MODE_DESCRIPTION, MODE_LABEL, card, cardShadow } from "./labels";

const ALL: IngestionMode[] = ["manual", "semi_automatic", "automatic"];

export function ModePicker({
  info,
  setModeAction,
  connectGoogleHref,
}: {
  info: IngestionModeInfo;
  setModeAction: (mode: IngestionMode | null) => Promise<ActionResult>;
  connectGoogleHref: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function choose(mode: IngestionMode | null) {
    setError(null);
    startTransition(async () => {
      const result = await setModeAction(mode);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className={card} style={cardShadow}>
      <h2 className="font-display text-base font-semibold text-stone-800">How your 1:1 notes come in</h2>
      <p className="mt-1 text-sm text-stone-500">
        Tasks, between-meeting goals and goal suggestions are created from the notes in every mode. Anything about
        wellbeing, conduct or safety is held back.
      </p>

      <div className="mt-4 space-y-2" role="radiogroup" aria-label="1:1 notes mode">
        {ALL.map((mode) => {
          const allowed = info.allowed.includes(mode);
          const selected = info.effective === mode;
          const reason =
            mode === "automatic" && !info.automaticAvailable
              ? "Not available yet"
              : !allowed
                ? "Not allowed by your organisation"
                : null;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!allowed || isPending}
              onClick={() => choose(mode)}
              className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                selected ? "border-forest bg-forest/5" : "border-stone-200 hover:border-forest/40"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-stone-800">{MODE_LABEL[mode]}</span>
                {selected && <span className="text-xs font-medium text-forest">In use</span>}
                {reason && <span className="text-xs text-stone-400">{reason}</span>}
              </div>
              <p className="mt-1 text-xs text-stone-500">{MODE_DESCRIPTION[mode]}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-stone-500">
        {info.choice === null ? (
          <span>You're on your organisation's default ({MODE_LABEL[info.orgDefault]}).</span>
        ) : (
          <button
            type="button"
            onClick={() => choose(null)}
            disabled={isPending}
            className="text-forest underline-offset-2 hover:underline disabled:opacity-50"
          >
            Go back to the organisation default ({MODE_LABEL[info.orgDefault]})
          </button>
        )}
      </div>

      {info.effective === "semi_automatic" && !info.driveConnected && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Semi-automatic needs your Google account connected with access to Drive, so Revualy can read Gemini notes
          after you approve.{" "}
          <a href={connectGoogleHref} className="font-medium underline">
            Connect Google
          </a>
        </p>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
