"use client";

import { useEffect, useState } from "react";

interface DismissibleCardProps {
  /** Stable id — dismissal persists as localStorage "revualy.dismissed.<id>". */
  id: string;
  title: string;
  children: React.ReactNode;
  dismissLabel?: string;
}

/**
 * First-run explainer card. Renders nothing until mounted (avoids a
 * hydration flash), and stays dismissed across visits per browser.
 */
export function DismissibleCard({
  id,
  title,
  children,
  dismissLabel = "Got it",
}: DismissibleCardProps) {
  const storageKey = `revualy.dismissed.${id}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(storageKey) === null);
    } catch {
      setVisible(true); // storage unavailable — still show the content
    }
  }, [storageKey]);

  function dismiss() {
    try {
      localStorage.setItem(storageKey, new Date().toISOString());
    } catch {
      // storage unavailable — dismiss for this render only
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="mb-6 rounded-2xl border border-forest/20 bg-forest/[0.04] p-5"
      role="note"
      aria-label={title}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-stone-900">
            {title}
          </h2>
          <div className="mt-1.5 space-y-1.5 text-sm text-stone-600">
            {children}
          </div>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100"
        >
          {dismissLabel}
        </button>
      </div>
    </div>
  );
}
