"use client";

import { useRef, useState, useTransition } from "react";
import { createManagerQuestionnaireAction } from "@/app/(manager)/team/questions/actions";

export function CreateQuestionnaireModal() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [themes, setThemes] = useState([{ intent: "", dataGoal: "" }]);
  const formRef = useRef<HTMLFormElement>(null);

  function addTheme() {
    setThemes([...themes, { intent: "", dataGoal: "" }]);
  }

  function removeTheme(index: number) {
    setThemes(themes.filter((_, i) => i !== index));
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await createManagerQuestionnaireAction(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        formRef.current?.reset();
        setThemes([{ intent: "", dataGoal: "" }]);
        setTimeout(() => {
          setOpen(false);
          setSuccess(false);
        }, 1500);
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-forest px-5 py-2.5 text-sm font-medium text-white hover:bg-forest-light"
      >
        Create Questionnaire
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={() => !isPending && setOpen(false)}
      />

      <div className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl border border-stone-200/60 bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-stone-900">
            Create Questionnaire
          </h3>
          <button
            onClick={() => !isPending && setOpen(false)}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
          >
            ✕
          </button>
        </div>

        {success ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-forest/10 text-xl text-forest">
              ✓
            </div>
            <p className="text-sm font-medium text-stone-700">Questionnaire created!</p>
          </div>
        ) : (
          <form ref={formRef} action={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-stone-400">
                Name
              </label>
              <input
                name="name"
                required
                placeholder="e.g. Weekly Code Review"
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-stone-400">
                Category
              </label>
              <select
                name="category"
                required
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest"
              >
                <option value="peer_review">Peer Review</option>
                <option value="self_reflection">Self-Reflection</option>
                <option value="three_sixty">360 Review</option>
                <option value="pulse_check">Pulse Check</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                name="verbatim"
                id="verbatim"
                className="h-4 w-4 rounded border-stone-300 text-forest focus:ring-forest"
              />
              <label htmlFor="verbatim" className="text-sm text-stone-600">
                Verbatim mode (exact phrasing, no AI adaptation)
              </label>
            </div>

            {/* Themes */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-medium uppercase tracking-wider text-stone-400">
                  Themes
                </label>
                <button
                  type="button"
                  onClick={addTheme}
                  className="text-xs font-medium text-forest hover:text-forest-light"
                >
                  + Add theme
                </button>
              </div>

              <div className="space-y-3">
                {themes.map((_, i) => (
                  <div key={i} className="rounded-xl border border-stone-100 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-stone-300">
                        Theme {i + 1}
                      </span>
                      {themes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTheme(i)}
                          className="text-[10px] text-stone-400 hover:text-red-500"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <input
                      name={`theme_intent_${i}`}
                      placeholder="Intent (e.g. Surface collaboration quality)"
                      className="mb-2 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-800 outline-none focus:border-forest"
                    />
                    <input
                      name={`theme_dataGoal_${i}`}
                      placeholder="Data goal (e.g. Assess how well the person works with others)"
                      className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-800 outline-none focus:border-forest"
                    />
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

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
                className="rounded-xl bg-forest px-5 py-2.5 text-sm font-medium text-white hover:bg-forest-light disabled:opacity-50"
              >
                {isPending ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
