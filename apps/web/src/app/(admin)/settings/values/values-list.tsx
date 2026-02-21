"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/modal";
import { addValue, editValue, removeValue } from "../actions";

type Value = { id: string; name: string; description: string; active: boolean };
type ScoreEntry = { value: string; score: number };

interface ValuesListProps {
  values: Value[];
  scores: ScoreEntry[];
}

export function ValuesList({ values, scores }: ValuesListProps) {
  const [modalState, setModalState] = useState<
    { mode: "closed" } | { mode: "add" } | { mode: "edit"; value: Value } | { mode: "delete"; value: Value }
  >({ mode: "closed" });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const action =
        modalState.mode === "add"
          ? addValue
          : modalState.mode === "edit"
            ? editValue
            : removeValue;
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
          Values
        </h3>
        <button
          onClick={() => setModalState({ mode: "add" })}
          className="rounded-xl bg-forest/[0.06] px-4 py-2 text-xs font-medium text-forest hover:bg-forest/10"
        >
          + Add Value
        </button>
      </div>
      <div className="space-y-2">
        {values.map((value, i) => {
          const score = scores.find((v) => v.value === value.name);
          return (
            <div
              key={value.id}
              className="group flex items-center gap-4 rounded-xl px-4 py-4 transition-colors hover:bg-stone-50"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-forest/[0.06] text-sm font-bold text-forest">
                {i + 1}
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-stone-800">
                    {value.name}
                  </p>
                  {value.active && (
                    <span className="rounded-full bg-positive/10 px-2 py-0.5 text-[10px] font-medium text-positive">
                      Active
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-stone-400">
                  {value.description}
                </p>
              </div>
              {score && (
                <div className="text-right">
                  <p
                    className={`font-display text-lg font-semibold tabular-nums ${
                      score.score >= 80
                        ? "text-forest"
                        : score.score >= 60
                          ? "text-warning"
                          : "text-danger"
                    }`}
                  >
                    {score.score}
                  </p>
                  <p className="text-[10px] text-stone-400">avg score</p>
                </div>
              )}
              <div className="flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
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
                <button
                  onClick={() => setModalState({ mode: "delete", value })}
                  className="rounded-lg p-1.5 text-stone-400 hover:bg-danger/10 hover:text-danger"
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
                      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                    />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
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

      {/* Delete confirmation */}
      {modalState.mode === "delete" && (
        <Modal
          open
          onClose={() => { setModalState({ mode: "closed" }); setError(null); }}
          title="Remove Value"
        >
          <p className="text-sm text-stone-600">
            Are you sure you want to deactivate{" "}
            <span className="font-medium text-stone-800">{modalState.value.name}</span>?
            It will be hidden from active tracking but data will be preserved.
          </p>
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
            <form action={handleSubmit}>
              <input type="hidden" name="id" value={modalState.value.id} />
              <button
                type="submit"
                disabled={isPending}
                className="rounded-xl bg-danger px-4 py-2 text-xs font-medium text-white hover:bg-danger/90 disabled:opacity-50"
              >
                {isPending ? "Removing..." : "Remove"}
              </button>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}
