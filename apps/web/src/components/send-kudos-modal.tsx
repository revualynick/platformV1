"use client";

import { useRef, useState, useTransition } from "react";
import { sendKudos } from "@/app/(employee)/dashboard/kudos/actions";
import { Modal } from "./modal";

interface User {
  id: string;
  name: string;
}

interface Value {
  id: string;
  name: string;
}

export function SendKudosModal({
  users,
  values,
}: {
  users: User[];
  values: Value[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await sendKudos(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        formRef.current?.reset();
        setTimeout(() => {
          setOpen(false);
          setSuccess(false);
        }, 1500);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-3 rounded-xl bg-forest px-5 py-2.5 text-sm font-medium text-white hover:bg-forest-light shadow-[0_8px_20px_rgba(61,24,55,0.25)]"
      >
        Send Kudos
      </button>

      <Modal
        open={open}
        onClose={() => !isPending && setOpen(false)}
        title="Send Kudos"
      >
        {success ? (
          <div className="py-8 text-center">
            <div
              aria-hidden="true"
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-forest/10 text-xl text-forest"
            >
              ✓
            </div>
            <p className="text-sm font-medium text-stone-700">Kudos sent!</p>
          </div>
        ) : (
          <form ref={formRef} action={handleSubmit} className="space-y-4">
            {/* Receiver */}
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-stone-400">
                Recipient
              </label>
              <select
                name="receiverId"
                required
                className="w-full rounded-xl border border-stone-200 bg-surface px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest"
              >
                <option value="">Select a colleague...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Message */}
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-stone-400">
                Message
              </label>
              <textarea
                name="message"
                required
                rows={3}
                placeholder="What did they do that was great?"
                className="w-full rounded-xl border border-stone-200 bg-surface px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest"
              />
            </div>

            {/* Core Value (optional) */}
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-stone-400">
                Core Value (optional)
              </label>
              <select
                name="coreValueId"
                className="w-full rounded-xl border border-stone-200 bg-surface px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest"
              >
                <option value="">None</option>
                {values.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <p className="text-xs text-red-600">{error}</p>
            )}

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
                className="rounded-xl bg-forest px-5 py-2.5 text-sm font-medium text-white hover:bg-forest-light disabled:opacity-50 shadow-[0_8px_20px_rgba(61,24,55,0.25)]"
              >
                {isPending ? "Sending..." : "Send"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
