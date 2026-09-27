"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revokeGrantAction, liftHoldAction } from "./actions";

export function GrantActions({ id, onHold }: { id: string; onHold: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
      {onHold && (
        <button type="button" disabled={isPending} onClick={() => run(liftHoldAction)} className="text-xs font-medium text-forest hover:text-forest/80 disabled:opacity-50">
          Lift hold
        </button>
      )}
      <button type="button" disabled={isPending} onClick={() => run(revokeGrantAction)} className="text-xs font-medium text-danger hover:opacity-80 disabled:opacity-50">
        End access
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
