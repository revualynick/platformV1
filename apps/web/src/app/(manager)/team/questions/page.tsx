import { getManagerQuestionnaires } from "@/lib/api";
import { questionnaires as mockQuestionnaires } from "@/lib/mock-data";
import { CreateQuestionnaireModal } from "@/components/create-questionnaire-modal";

const categoryLabels: Record<string, string> = {
  peer_review: "Peer Review",
  self_reflection: "Self-Reflection",
  three_sixty: "360 Review",
  pulse_check: "Pulse Check",
};

const categoryColors: Record<string, string> = {
  peer_review: "bg-forest/10 text-forest",
  self_reflection: "bg-violet-100 text-violet-700",
  three_sixty: "bg-sky-100 text-sky-700",
  pulse_check: "bg-amber-100 text-amber-700",
};

async function loadQuestionnaires() {
  try {
    const result = await getManagerQuestionnaires();
    if (result.data.length > 0) {
      return {
        teamQuestions: result.data.filter((q) => q.createdByUserId !== null),
        orgQuestions: result.data.filter((q) => q.createdByUserId === null),
      };
    }
  } catch {
    // fall through
  }

  // Mock fallback
  return {
    teamQuestions: [],
    orgQuestions: mockQuestionnaires.map((q) => ({
      ...q,
      isActive: q.active ?? true,
      source: q.source,
      createdAt: "",
      updatedAt: "",
      themes: q.themes.map((t) => ({
        ...t,
        questionnaireId: q.id,
        coreValueId: null,
        sortOrder: 0,
        createdAt: "",
      })),
      createdByUserId: null,
      teamScope: null,
    })),
  };
}

export default async function QuestionsPage() {
  const { teamQuestions, orgQuestions } = await loadQuestionnaires();

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-10 flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-stone-400">Question Bank</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
            Questions
          </h1>
        </div>
        <CreateQuestionnaireModal />
      </div>

      {/* My Team Questions */}
      <div className="mb-10">
        <h2 className="mb-4 font-display text-lg font-semibold text-stone-800">
          My Team Questions
        </h2>
        {teamQuestions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-200 p-8 text-center">
            <p className="text-sm text-stone-400">
              No team-specific questionnaires yet. Create one to customize how your team gives feedback.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {teamQuestions.map((q, i) => (
              <div
                key={q.id}
                className="card-enter rounded-2xl border border-stone-200/60 bg-white p-5"
                style={{ animationDelay: `${i * 80}ms`, boxShadow: "var(--shadow-sm)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-semibold text-stone-800">{q.name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${categoryColors[q.category] ?? "bg-stone-100 text-stone-600"}`}>
                        {categoryLabels[q.category] ?? q.category}
                      </span>
                      {q.verbatim && (
                        <span className="rounded-full bg-terracotta/10 px-2 py-0.5 text-[10px] font-medium text-terracotta">
                          Verbatim
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-stone-400">
                      {q.themes.length} theme{q.themes.length !== 1 ? "s" : ""}
                    </p>
                    <div className="mt-3 space-y-1.5">
                      {q.themes.slice(0, 3).map((t) => (
                        <p key={t.id} className="text-xs text-stone-500">
                          <span className="text-stone-300 mr-1.5">—</span>
                          {t.intent}
                        </p>
                      ))}
                      {q.themes.length > 3 && (
                        <p className="text-xs text-stone-400">
                          +{q.themes.length - 3} more
                        </p>
                      )}
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${q.isActive ? "bg-forest/10 text-forest" : "bg-stone-100 text-stone-400"}`}>
                    {q.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Org-Wide Questions */}
      <div>
        <h2 className="mb-4 font-display text-lg font-semibold text-stone-800">
          Org-Wide Questions
        </h2>
        <div className="space-y-3">
          {orgQuestions.map((q, i) => (
            <div
              key={q.id}
              className="card-enter rounded-2xl border border-stone-200/60 bg-white p-5"
              style={{ animationDelay: `${(teamQuestions.length + i) * 80}ms`, boxShadow: "var(--shadow-sm)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-stone-800">{q.name}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${categoryColors[q.category] ?? "bg-stone-100 text-stone-600"}`}>
                      {categoryLabels[q.category] ?? q.category}
                    </span>
                    {q.verbatim && (
                      <span className="rounded-full bg-terracotta/10 px-2 py-0.5 text-[10px] font-medium text-terracotta">
                        Verbatim
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-stone-400">
                    {q.themes.length} theme{q.themes.length !== 1 ? "s" : ""}
                    <span className="ml-2 text-stone-300">{q.source}</span>
                  </p>
                  <div className="mt-3 space-y-1.5">
                    {q.themes.slice(0, 2).map((t) => (
                      <p key={t.id} className="text-xs text-stone-500">
                        <span className="text-stone-300 mr-1.5">—</span>
                        {t.intent}
                      </p>
                    ))}
                    {q.themes.length > 2 && (
                      <p className="text-xs text-stone-400">
                        +{q.themes.length - 2} more
                      </p>
                    )}
                  </div>
                </div>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500">
                  Org-wide
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
