import { getQuestionnaires, getOrgConfig } from "@/lib/api";
import {
  questionnaires as mockQuestionnaires,
  aiDiscoveredThemes,
} from "@/lib/mock-data";
import { QuestionnairesList } from "./questionnaires-list";

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

async function loadQuestionnaires(): Promise<QData[]> {
  try {
    const [{ data: rows }, { coreValues }] = await Promise.all([
      getQuestionnaires(),
      getOrgConfig(),
    ]);
    const valueMap = new Map(coreValues.map((v) => [v.id, v.name]));
    return rows.map((q) => ({
      id: q.id,
      name: q.name,
      category: q.category,
      source: q.source,
      active: q.isActive,
      verbatim: q.verbatim,
      description: "",
      themes: q.themes.map((t) => ({
        id: t.id,
        intent: t.intent,
        dataGoal: t.dataGoal,
        examplePhrasings: t.examplePhrasings,
        coreValue: t.coreValueId ? valueMap.get(t.coreValueId) ?? null : null,
      })),
      timesUsed: 0,
      lastUsed: "-",
    }));
  } catch {
    return mockQuestionnaires;
  }
}

const categoryStyles: Record<string, { bg: string; text: string; label: string }> = {
  peer_review: { bg: "bg-forest/10", text: "text-forest", label: "Peer Review" },
  self_reflection: { bg: "bg-violet-100", text: "text-violet-700", label: "Self Reflection" },
  three_sixty: { bg: "bg-sky-100", text: "text-sky-700", label: "360 Review" },
  pulse_check: { bg: "bg-amber/10", text: "text-warning", label: "Pulse Check" },
};

const aiStatusStyles: Record<string, { bg: string; text: string; label: string }> = {
  suggested: { bg: "bg-violet-50", text: "text-violet-600", label: "Suggested" },
  accepted: { bg: "bg-positive/10", text: "text-positive", label: "Accepted" },
  dismissed: { bg: "bg-stone-100", text: "text-stone-400", label: "Dismissed" },
};

export default async function QuestionsPage() {
  const questionnaires = await loadQuestionnaires();
  const activeQuestionnaires = questionnaires.filter((q) => q.active);
  const totalThemes = questionnaires.reduce((sum, q) => sum + q.themes.length, 0);
  const pendingAiThemes = aiDiscoveredThemes.filter((t) => t.status === "suggested");

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Configuration</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Questionnaires
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">
          Questionnaires define the <em>direction</em> of data collection, not rigid scripts.
          Each theme describes what you want to learn — the AI rewords questions naturally
          based on context, relationship history, and conversational flow.
        </p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "Questionnaires",
            value: questionnaires.length.toString(),
            sub: `${activeQuestionnaires.length} active`,
            color: "text-stone-900",
          },
          {
            label: "Themes",
            value: totalThemes.toString(),
            sub: "Data collection directions",
            color: "text-forest",
          },
          {
            label: "AI Discoveries",
            value: aiDiscoveredThemes.length.toString(),
            sub: `${pendingAiThemes.length} pending review`,
            color: "text-violet-600",
          },
          {
            label: "Interactions",
            value: questionnaires
              .reduce((sum, q) => sum + q.timesUsed, 0)
              .toString(),
            sub: "Total uses all time",
            color: "text-forest",
          },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className="card-enter rounded-2xl border border-stone-200/60 bg-white p-5"
            style={{
              animationDelay: `${i * 80}ms`,
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
              {stat.label}
            </span>
            <p className={`mt-1 font-display text-2xl font-semibold ${stat.color}`}>
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-stone-400">{stat.sub}</p>
          </div>
        ))}
      </div>

      <QuestionnairesList questionnaires={questionnaires} />

      {/* AI Discovered Themes */}
      <div
        className="card-enter"
        style={{ animationDelay: "700ms" }}
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-stone-900">
              AI-Discovered Themes
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Patterns detected from team communications and feedback data.
              Accept to add to a questionnaire, or dismiss.
            </p>
          </div>
          {pendingAiThemes.length > 0 && (
            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-600">
              {pendingAiThemes.length} pending
            </span>
          )}
        </div>

        <div className="space-y-4">
          {aiDiscoveredThemes.map((theme, i) => {
            const status = aiStatusStyles[theme.status];
            const cat = categoryStyles[theme.suggestedFor];
            const isDismissed = theme.status === "dismissed";

            return (
              <div
                key={theme.id}
                className={`card-enter rounded-2xl border p-6 transition-all ${
                  isDismissed
                    ? "border-stone-100 bg-stone-50/50 opacity-50"
                    : theme.status === "suggested"
                      ? "border-violet-200/60 bg-gradient-to-r from-violet-50/40 to-transparent"
                      : "border-stone-200/60 bg-white"
                }`}
                style={{
                  animationDelay: `${800 + i * 80}ms`,
                  boxShadow: isDismissed ? undefined : "var(--shadow-sm)",
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-violet-100 text-[10px] text-violet-500">
                        ✦
                      </span>
                      <h4 className="text-sm font-semibold text-stone-800">
                        {theme.intent}
                      </h4>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${status.bg} ${status.text}`}>
                        {status.label}
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${cat.bg} ${cat.text}`}>
                        {cat.label}
                      </span>
                    </div>

                    <p className="mt-2 text-xs leading-relaxed text-stone-500">
                      {theme.discoveredFrom}
                    </p>

                    {/* Example phrasings */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {theme.examplePhrasings.map((p, pi) => (
                        <span
                          key={pi}
                          className="rounded-lg bg-white/80 px-3 py-1.5 text-xs italic text-stone-500 shadow-sm"
                        >
                          &ldquo;{p}&rdquo;
                        </span>
                      ))}
                    </div>

                    {/* Meta */}
                    <div className="mt-3 flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-stone-400">Confidence</span>
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-100">
                          <div
                            className={`h-full rounded-full ${
                              theme.confidence >= 0.85
                                ? "bg-forest"
                                : theme.confidence >= 0.7
                                  ? "bg-warning"
                                  : "bg-stone-300"
                            }`}
                            style={{ width: `${theme.confidence * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] tabular-nums text-stone-400">
                          {Math.round(theme.confidence * 100)}%
                        </span>
                      </div>
                      <span className="text-[10px] text-stone-300">&middot;</span>
                      <span className="text-[10px] text-stone-400">
                        {theme.relatedCommsCount} related signals
                      </span>
                      <span className="text-[10px] text-stone-300">&middot;</span>
                      <span className="text-[10px] text-stone-400">
                        {theme.discoveredAt}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  {theme.status === "suggested" && (
                    <div className="flex shrink-0 flex-col gap-2">
                      <button className="rounded-xl bg-forest px-4 py-2 text-xs font-medium text-white hover:bg-forest-light">
                        Accept
                      </button>
                      <button className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-500 hover:bg-stone-50">
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* How it works — explanatory card */}
      <div
        className="card-enter mt-10 rounded-2xl border border-forest/10 bg-forest/[0.02] p-6"
        style={{ animationDelay: "1000ms" }}
      >
        <h4 className="font-display text-sm font-semibold text-forest">
          How AI Rewording Works
        </h4>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {[
            {
              step: "1",
              title: "You define themes",
              desc: "Each theme describes what data you want to collect — the intent and goal, not exact words.",
            },
            {
              step: "2",
              title: "AI adapts phrasing",
              desc: "During conversations, AI rewords themes naturally based on context and relationship. Toggle verbatim mode when HR needs consistent wording.",
            },
            {
              step: "3",
              title: "AI discovers new themes",
              desc: "The AI analyzes team comms and feedback patterns to suggest new themes you might not have considered.",
            },
          ].map((item) => (
            <div key={item.step} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forest/10 text-xs font-bold text-forest">
                {item.step}
              </span>
              <div>
                <p className="text-sm font-medium text-stone-700">{item.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
