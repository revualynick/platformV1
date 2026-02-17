"use client";

import { useEffect } from "react";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error.message);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="rounded-2xl border border-stone-200/60 bg-white p-10" style={{ boxShadow: "var(--shadow-sm)" }}>
        <h2 className="font-display text-xl font-semibold text-stone-900">Something went wrong</h2>
        <p className="mt-2 text-sm text-stone-500">An unexpected error occurred while loading settings.</p>
        <button
          onClick={reset}
          className="mt-6 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
