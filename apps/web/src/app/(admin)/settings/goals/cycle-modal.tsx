"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";

type ActionResult = { ok: true } | { ok: false; error: string };

const inputClass =
  "w-full rounded-xl border border-stone-200 bg-surface px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest";
const labelClass =
  "mb-1.5 block text-xs font-medium uppercase tracking-wider text-stone-400";

export function CycleModal({
  createAction,
}: {
  createAction: (formData: FormData) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  // A React 19 form action already runs inside a transition, so await the
  // save directly (a nested startTransition left the router applying an
  // older page tree about one time in five on the production build).
  async function handleSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const result = await createAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100"
      >
        New cycle
      </button>
      <Modal open={open} onClose={() => !isPending && setOpen(false)} title="New goal cycle">
        <form ref={formRef} action={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Name</label>
            <input
              name="name"
              required
              maxLength={100}
              placeholder="e.g. Q4 2026"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Start date</label>
              <input type="date" name="startDate" required className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>End date</label>
              <input type="date" name="endDate" required className={inputClass} />
            </div>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-xl bg-forest px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_rgba(61,24,55,0.25)] hover:bg-forest-light disabled:opacity-50"
            >
              {isPending ? "Creating..." : "Create cycle"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
