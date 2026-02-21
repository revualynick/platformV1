"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/modal";
import { addValue, editValue } from "./actions";

type Value = { id: string; name: string; description: string; active: boolean };

interface ValuesCardProps {
  values: Value[];
}

export function ValuesCard({ values }: ValuesCardProps) {
  const [modalState, setModalState] = useState<
    { mode: "closed" } | { mode: "add" } | { mode: "edit"; value: Value }
  >({ mode: "closed" });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const action = modalState.mode === "add" ? addValue : editValue;
      const result = await action(formData);
      if (result.ok) {
        setModalState({ mode: "closed" });
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-base font-semibold text-stone-800">
          Core Values
        </h3>
        <button
          onClick={() => setModalState({ mode: "add" })}
          className="rounded-xl bg-forest/[0.06] px-4 py-2 text-xs font-medium text-forest hover:bg-forest/10"
        >
          + Add Value
        </button>
      </div>
      <div className="space-y-2">
        {values.map((value, i) => (
          <div
            key={value.id}
            className="group flex items-center gap-4 rounded-xl px-4 py-3 transition-colors hover:bg-stone-50"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-forest/[0.06] text-xs font-bold text-forest">
              {i + 1}
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium text-stone-800">
                {value.name}
              </p>
              <p className="text-xs text-stone-400">{value.description}</p>
            </div>
            <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={() => setModalState({ mode: "edit", value })}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z"
                  />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Modal */}
      {(modalState.mode === "add" || modalState.mode === "edit") && (
        <Modal
          open
          onClose={() => { setModalState({ mode: "closed" }); setError(null); }}
          title={modalState.mode === "add" ? "Add Value" : "Edit Value"}
        >
          <form action={handleSubmit}>
            {modalState.mode === "edit" && (
              <input type="hidden" name="id" value={modalState.value.id} />
            )}
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-600">
                  Name
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  defaultValue={modalState.mode === "edit" ? modalState.value.name : ""}
                  className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest"
                  placeholder="e.g. Integrity"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-600">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={3}
                  defaultValue={modalState.mode === "edit" ? modalState.value.description : ""}
                  className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest"
                  placeholder="Brief description of this value"
                />
              </div>
            </div>
            {error && (
              <p className="mt-3 text-xs text-danger">{error}</p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setModalState({ mode: "closed" }); setError(null); }}
                className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-xl bg-forest shadow-[0_8px_20px_rgba(61,24,55,0.25)] px-4 py-2 text-xs font-medium text-white hover:bg-forest-light disabled:opacity-50"
              >
                {isPending ? "Saving..." : modalState.mode === "add" ? "Add Value" : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
