"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startAssessment, submitAssessment } from "../../actions";

interface Question {
  id: string;
  framework: string;
  questionType: string;
  text: string;
  options: Array<{ key: string; text: string }>;
  sortOrder: number;
}

interface Props {
  framework: string;
  context: string;
  questions: Question[];
  title: string;
  subtitle: string;
}

const COLOUR_OPTION_STYLES = [
  "border-red-200 hover:border-red-400 hover:bg-red-50/50",
  "border-blue-200 hover:border-blue-400 hover:bg-blue-50/50",
  "border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50/50",
  "border-amber-200 hover:border-amber-400 hover:bg-amber-50/50",
];

const COLOUR_SELECTED_STYLES = [
  "border-red-400 bg-red-50 ring-1 ring-red-200",
  "border-blue-400 bg-blue-50 ring-1 ring-blue-200",
  "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200",
  "border-amber-400 bg-amber-50 ring-1 ring-amber-200",
];

export function QuizWizard({ framework, context, questions, title, subtitle }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<"intro" | "quiz" | "submitting">("intro");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const question = questions[currentIndex];
  const totalQuestions = questions.length;
  const answeredCount = Object.keys(responses).length;
  const progress = totalQuestions > 0 ? (currentIndex / totalQuestions) * 100 : 0;
  const isLastQuestion = currentIndex === totalQuestions - 1;
  const hasAnswered = question ? !!responses[question.id] : false;

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const result = await startAssessment(framework, context);
      if (!result.success) {
        setError(result.error ?? "Failed to start assessment");
        return;
      }
      setSessionId(result.sessionId!);
      setPhase("quiz");
    });
  }

  function handleSelect(optionKey: string) {
    if (!question) return;
    setResponses((prev) => ({ ...prev, [question.id]: optionKey }));
  }

  function handleNext() {
    if (isLastQuestion) {
      handleSubmit();
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }

  function handleBack() {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  }

  function handleSubmit() {
    if (!sessionId) return;
    setError(null);
    setPhase("submitting");

    startTransition(async () => {
      const result = await submitAssessment(sessionId, responses);
      if (!result.success) {
        setError(result.error ?? "Failed to submit assessment");
        setPhase("quiz");
        return;
      }
      router.push(`/dashboard/profile/results/${result.sessionId}`);
    });
  }

  // Intro screen
  if (phase === "intro") {
    return (
      <div className="rounded-2xl border border-stone-200/80 bg-white p-8 shadow-sm">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-forest/10 text-2xl text-forest">
            {framework === "colour" ? "◐" : "◇"}
          </div>
          <h1 className="font-display text-2xl font-semibold text-stone-900">
            {title}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-stone-500">
            {subtitle}
          </p>
          <div className="mt-2 text-xs text-stone-400">
            {totalQuestions} questions
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={handleStart}
            disabled={isPending}
            className="rounded-xl bg-forest px-8 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(61,24,55,0.25)] hover:bg-forest-light transition-colors disabled:opacity-50"
          >
            {isPending ? "Starting..." : "Begin Assessment"}
          </button>
        </div>
      </div>
    );
  }

  // Submitting screen
  if (phase === "submitting") {
    return (
      <div className="rounded-2xl border border-stone-200/80 bg-white p-8 shadow-sm">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-stone-200 border-t-forest" />
          <h2 className="font-display text-xl font-semibold text-stone-900">
            Calculating your profile...
          </h2>
          <p className="mt-2 text-sm text-stone-500">
            Scoring {answeredCount} responses across {framework === "colour" ? "4" : "6"} dimensions
          </p>
        </div>
        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    );
  }

  // Quiz question
  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-stone-400">
          <span>Question {currentIndex + 1} of {totalQuestions}</span>
          <span>{answeredCount} answered</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
          <div
            className="h-full rounded-full bg-forest transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question card */}
      <div
        key={question.id}
        className="rounded-2xl border border-stone-200/80 bg-white p-8 shadow-sm"
      >
        {/* Question type badge */}
        <div className="mb-4">
          <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-stone-500">
            {question.questionType === "scenario" ? "Scenario" : "Choose one"}
          </span>
        </div>

        {/* Question text */}
        <h2 className="font-display text-lg font-semibold leading-relaxed text-stone-900">
          {question.text}
        </h2>

        {/* Options */}
        <div className="mt-6 space-y-3">
          {question.options.map((option, i) => {
            const isSelected = responses[question.id] === option.key;
            const baseStyle = framework === "colour"
              ? COLOUR_OPTION_STYLES[i % 4]
              : "border-stone-200 hover:border-forest/40 hover:bg-forest/5";
            const selectedStyle = framework === "colour"
              ? COLOUR_SELECTED_STYLES[i % 4]
              : "border-forest bg-forest/5 ring-1 ring-forest/20";

            return (
              <button
                key={option.key}
                type="button"
                onClick={() => handleSelect(option.key)}
                className={`w-full rounded-xl border-2 px-5 py-4 text-left text-sm transition-all duration-150 ${
                  isSelected ? selectedStyle : baseStyle
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${
                      isSelected
                        ? "border-current bg-current text-white"
                        : "border-stone-300 text-stone-400"
                    }`}
                    style={
                      isSelected
                        ? {
                            backgroundColor:
                              framework === "colour"
                                ? ["#ef4444", "#3b82f6", "#10b981", "#f59e0b"][i % 4]
                                : "#51224A",
                            borderColor:
                              framework === "colour"
                                ? ["#ef4444", "#3b82f6", "#10b981", "#f59e0b"][i % 4]
                                : "#51224A",
                          }
                        : undefined
                    }
                  >
                    {option.key.toUpperCase()}
                  </span>
                  <span className={isSelected ? "font-medium text-stone-900" : "text-stone-700"}>
                    {option.text}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleBack}
          disabled={currentIndex === 0}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone-500 hover:text-stone-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Back
        </button>

        <button
          type="button"
          onClick={handleNext}
          disabled={!hasAnswered || isPending}
          className="rounded-xl bg-forest px-6 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(61,24,55,0.25)] hover:bg-forest-light transition-colors disabled:opacity-50"
        >
          {isPending
            ? "Saving..."
            : isLastQuestion
              ? `Submit (${answeredCount}/${totalQuestions})`
              : "Next"}
        </button>
      </div>

      {/* Quick-nav dots */}
      <div className="flex justify-center gap-1.5">
        {questions.map((q, i) => {
          const answered = !!responses[q.id];
          const isCurrent = i === currentIndex;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => setCurrentIndex(i)}
              className={`h-2 rounded-full transition-all duration-200 ${
                isCurrent
                  ? "w-6 bg-forest"
                  : answered
                    ? "w-2 bg-forest/40"
                    : "w-2 bg-stone-200"
              }`}
              aria-label={`Question ${i + 1}`}
            />
          );
        })}
      </div>
    </div>
  );
}
