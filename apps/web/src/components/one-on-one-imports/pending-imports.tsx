"use client";

import { useState, useTransition } from "react";
import type { PendingImport } from "@/lib/api";
import type { ActionResult } from "@/lib/one-on-one-import-actions";
import { card, cardShadow, formatDate } from "./labels";

export function PendingImports({
  imports,
  decideAction,
}: {
  imports: PendingImport[];
  decideAction: (id: string, action: "approve" | "decline") => Promise<ActionResult>;
}) {
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function decide(id: string, action: "approve" | "decline") {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await decideAction(id, action);
      if (!result.ok) setError(result.error);
      setBusyId(null);
    });
  }

  return (
    <div className={card} style={cardShadow}>
      <h2 className="font-display text-base font-semibold text-stone-800">Waiting for your approval</h2>
      <p className="mt-1 text-sm text-stone-500">
        1:1s found in your calendar. Nothing is read until you approve; declining means Revualy never reads that
        meeting.
      </p>
      {imports.length === 0 ? (
        <p className="mt-4 text-sm text-stone-400">Nothing waiting.</p>
      ) : (
        <ul className="mt-4 divide-y divide-stone-100">
          {imports.map((imp) => (
            <li key={imp.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-stone-800">
                  {imp.subjectName ? `1:1 with ${imp.subjectName}` : imp.title}
                </p>
                <p className="text-xs text-stone-400">
                  {formatDate(imp.eventStart)}
                  {imp.detectedBy === "marker" ? " · marked as a check-in" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => decide(imp.id, "approve")}
                  disabled={isPending}
                  className="rounded-lg bg-forest px-3 py-1.5 text-xs font-medium text-white hover:bg-forest/90 disabled:opacity-50"
                >
                  {busyId === imp.id && isPending ? "Saving..." : "Approve"}
                </button>
                <button
                  type="button"
                  onClick={() => decide(imp.id, "decline")}
                  disabled={isPending}
                  className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
