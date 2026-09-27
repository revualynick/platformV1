"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acknowledgeAction, closeAction } from "./actions";

export function RequestActions({ id, status }: { id: string; status: "open" | "acknowledged" | "closed" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  if (status === "closed") return null;

  function run(action: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action(id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {status === "open" && (
        <button type="button" disabled={isPending} onClick={() => run(acknowledgeAction)} className="rounded-xl bg-forest px-3 py-1.5 text-xs font-medium text-white hover:bg-forest-light disabled:opacity-50">
          I&apos;m on it
        </button>
      )}
      <button type="button" disabled={isPending} onClick={() => run(closeAction)} className="text-xs font-medium text-stone-500 hover:text-stone-700 disabled:opacity-50">
        Mark done
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
