"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/modal";
import { addQuestionnaire, editQuestionnaire, toggleVerbatim } from "../actions";

type QTheme = {
  id: string;
  intent: string;
  dataGoal: string;
  examplePhrasings: string[];
  coreValue: string | null;
};

type QData = {
  id: string;
  name: string;
  category: string;
  source: string;
  active: boolean;
  verbatim: boolean;
  description: string;
  themes: QTheme[];
  timesUsed: number;
  lastUsed: string;
};

const categoryStyles: Record<string, { bg: string; text: string; label: string }> = {
  peer_review: { bg: "bg-forest/10", text: "text-forest", label: "Peer Review" },
  self_reflection: { bg: "bg-violet-100", text: "text-violet-700", label: "Self Reflection" },
  three_sixty: { bg: "bg-sky-100", text: "text-sky-700", label: "360 Review" },
  pulse_check: { bg: "bg-amber/10", text: "text-warning", label: "Pulse Check" },
};

const sourceStyles: Record<string, { bg: string; text: string; label: string }> = {
  built_in: { bg: "bg-stone-100", text: "text-stone-500", label: "Built-in" },
  custom: { bg: "bg-terracotta/10", text: "text-terracotta", label: "Custom" },
  imported: { bg: "bg-sky-50", text: "text-sky-600", label: "Imported" },
};

const categories = [
  { value: "peer_review", label: "Peer Review" },
  { value: "self_reflection", label: "Self Reflection" },
  { value: "three_sixty", label: "360 Review" },
  { value: "pulse_check", label: "Pulse Check" },
];

interface QuestionnairesListProps {
  questionnaires: QData[];
}

export function QuestionnairesList({ questionnaires }: QuestionnairesListProps) {
  const [modalState, setModalState] = useState<
    { mode: "closed" } | { mode: "add" } | { mode: "edit"; q: QData }
  >({ mode: "closed" });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const action = modalState.mode === "add" ? addQuestionnaire : editQuestionnaire;
      const result = await action(formData);
      if (result.ok) {
        setModalState({ mode: "closed" });
      } else {
        setError(result.error);
      }
    });
  }

  function handleToggleVerbatim(q: QData) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", q.id);
      fd.set("verbatim", (!q.verbatim).toString());
      await toggleVerbatim(fd);
    });
  }

  return (
    <>
      {/* Actions bar */}
      <div
        className="card-enter mb-6 flex flex-wrap items-center gap-3"
        style={{ animationDelay: "250ms" }}
      >
        <button
          onClick={() => setModalState({ mode: "add" })}
          className="rounded-xl bg-forest shadow-[0_8px_20px_rgba(61,24,55,0.25)] px-4 py-2.5 text-xs font-medium text-white hover:bg-forest-light"
        >
          + New Questionnaire
        </button>
        <button className="rounded-xl border border-stone-200 bg-surface px-4 py-2.5 text-xs font-medium text-stone-600 hover:bg-stone-50">
          <span className="mr-1.5">↑</span>
          Import Plain Text
        </button>
      </div>

      {/* Questionnaire cards */}
      <div className="mb-10 space-y-5">
        {questionnaires.map((q, qi) => {
          const cat = categoryStyles[q.category];
          const src = sourceStyles[q.source];
          return (
            <div
              key={q.id}
              className={`card-enter rounded-2xl border bg-surface transition-all ${
                q.active
                  ? "border-stone-200/60 hover:border-stone-300/60 hover:shadow-md"
                  : "border-dashed border-stone-200 opacity-60"
              }`}
              style={{
                animationDelay: `${300 + qi * 80}ms`,
                boxShadow: q.active ? "var(--shadow-sm)" : undefined,
              }}
            >
              {/* Questionnaire header */}
              <div className="flex items-start justify-between p-6 pb-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-display text-base font-semibold text-stone-800">
                      {q.name}
                    </h3>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${cat?.bg} ${cat?.text}`}>
                      {cat?.label}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${src?.bg} ${src?.text}`}>
                      {src?.label}
                    </span>
                    {!q.active && (
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-400">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-stone-500">{q.description}</p>
                </div>
                <div className="flex items-center gap-4 text-right">
                  {/* Verbatim toggle */}
                  <div className="flex flex-col items-end gap-1">
                    <button
                      onClick={() => handleToggleVerbatim(q)}
                      disabled={isPending}
                      className={`relative h-5 w-9 rounded-full transition-colors ${
                        q.verbatim ? "bg-terracotta" : "bg-stone-200"
                      } disabled:opacity-50`}
                      title={
                        q.verbatim
                          ? "Verbatim mode: AI uses exact wording"
                          : "Adaptive mode: AI rewords naturally"
                      }
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow-sm transition-transform ${
                          q.verbatim ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                    <span className={`text-[10px] font-medium ${q.verbatim ? "text-terracotta" : "text-stone-400"}`}>
                      {q.verbatim ? "Verbatim" : "Adaptive"}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs tabular-nums text-stone-400">
                      {q.timesUsed} uses
                    </p>
                    <p className="text-[10px] text-stone-300">
                      Last: {q.lastUsed}
                    </p>
                  </div>
                  <button
                    onClick={() => setModalState({ mode: "edit", q })}
                    className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Verbatim banner when active */}
              {q.verbatim && (
                <div className="mx-6 mb-2 flex items-center gap-2 rounded-lg bg-terracotta/[0.06] px-3 py-2">
                  <svg className="h-3.5 w-3.5 shrink-0 text-terracotta" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  <p className="text-[11px] text-terracotta">
                    <span className="font-medium">Verbatim mode</span> — AI will use exact wording from the first example phrasing. Ensures consistent data collection for HR benchmarking.
                  </p>
                </div>
              )}

              {/* Themes */}
              <div className="border-t border-stone-100 px-6 py-4">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  {q.themes.length} Theme{q.themes.length !== 1 ? "s" : ""}
                  <span className="ml-2 font-normal normal-case tracking-normal text-stone-300">
                    {q.verbatim
                      ? "— exact wording locked"
                      : "— AI adapts phrasing per conversation"}
                  </span>
                </p>
                <div className="space-y-3">
                  {q.themes.map((theme) => (
                    <div
                      key={theme.id}
                      className="group rounded-xl border border-stone-100 p-4 transition-colors hover:border-stone-200 hover:bg-stone-50/50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-forest/60" />
                            <p className="text-sm font-medium text-stone-800">
                              {theme.intent}
                            </p>
                            {theme.coreValue && (
                              <span className="rounded-full bg-forest/[0.06] px-2 py-0.5 text-[10px] font-medium text-forest">
                                {theme.coreValue}
                              </span>
                            )}
                          </div>
                          <p className="ml-3.5 mt-1 text-xs text-stone-400">
                            Goal: {theme.dataGoal}
                          </p>
                        </div>
                      </div>
                      {/* Example phrasings */}
                      <div className="ml-3.5 mt-3">
                        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-stone-300">
                          {q.verbatim ? "Exact wording" : "Example phrasings"}
                        </p>
                        <div className="space-y-1">
                          {theme.examplePhrasings.map((phrasing, pi) => (
                            <p
                              key={pi}
                              className={`text-xs leading-relaxed ${
                                q.verbatim && pi === 0
                                  ? "font-medium text-stone-600"
                                  : q.verbatim
                                    ? "italic text-stone-300 line-through decoration-stone-200"
                                    : "italic text-stone-400"
                              }`}
                            >
                              {q.verbatim && pi === 0 && (
                                <span className="mr-1.5 inline-block rounded bg-terracotta/10 px-1 py-px text-[9px] font-semibold uppercase text-terracotta no-underline">
                                  locked
                                </span>
                              )}
                              &ldquo;{phrasing}&rdquo;
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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
          title={modalState.mode === "add" ? "New Questionnaire" : "Edit Questionnaire"}
        >
          <form action={handleSubmit}>
            {modalState.mode === "edit" && (
              <input type="hidden" name="id" value={modalState.q.id} />
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
                  defaultValue={modalState.mode === "edit" ? modalState.q.name : ""}
                  className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest"
                  placeholder="e.g. Quarterly 360 Review"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-600">
                  Category
                </label>
                <select
                  name="category"
                  required
                  defaultValue={modalState.mode === "edit" ? modalState.q.category : ""}
                  className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest"
                >
                  <option value="" disabled>Select a category</option>
                  {categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              {modalState.mode === "add" && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-stone-600">
                    Source
                  </label>
                  <select
                    name="source"
                    defaultValue="custom"
                    className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest"
                  >
                    <option value="custom">Custom</option>
                    <option value="built_in">Built-in</option>
                    <option value="imported">Imported</option>
                  </select>
                </div>
              )}
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
                {isPending ? "Saving..." : modalState.mode === "add" ? "Create" : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
