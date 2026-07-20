import type {
  ProfilingFramework,
  ColourDimensions,
  CdmDimensions,
} from "@revualy/shared";

interface QuestionRow {
  id: string;
  framework: string;
  options: Array<{ key: string; text: string; scores: Record<string, number> }>;
}

/**
 * Score an assessment session.
 *
 * Takes the question rows and a responses map (questionId → selected option key),
 * aggregates the option scores across all answered questions, and returns
 * normalized dimension scores.
 */
export function scoreAssessment(
  framework: ProfilingFramework,
  questions: QuestionRow[],
  responses: Record<string, string>,
): ColourDimensions | CdmDimensions {
  const totals: Record<string, number> = {};
  let answeredCount = 0;

  for (const question of questions) {
    const selectedKey = responses[question.id];
    if (!selectedKey) continue;

    const option = question.options.find((o) => o.key === selectedKey);
    if (!option) continue;

    answeredCount++;
    for (const [dim, score] of Object.entries(option.scores)) {
      totals[dim] = (totals[dim] ?? 0) + score;
    }
  }

  if (answeredCount === 0) {
    return framework === "colour"
      ? { red: 0.25, yellow: 0.25, green: 0.25, blue: 0.25 }
      : {
          inquiryVsAdvocacy: 0.5,
          conflictTolerance: 0.5,
          frameFlexibility: 0.5,
          analysisVsAction: 0.5,
          cogDiversitySeeking: 0.5,
          postMortemOrientation: 0.5,
        };
  }

  if (framework === "colour") {
    return normalizeColour(totals);
  }
  return normalizeCdm(totals, answeredCount);
}

/**
 * Colour dimensions sum to 1 (proportional blend).
 */
function normalizeColour(totals: Record<string, number>): ColourDimensions {
  const dims = ["red", "yellow", "green", "blue"] as const;
  const raw = dims.map((d) => Math.max(0, totals[d] ?? 0));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;

  return {
    red: round(raw[0] / sum),
    yellow: round(raw[1] / sum),
    green: round(raw[2] / sum),
    blue: round(raw[3] / sum),
  };
}

/**
 * CDM dimensions are independent 0–1 scales (average per dimension).
 */
function normalizeCdm(
  totals: Record<string, number>,
  questionCount: number,
): CdmDimensions {
  const dims = [
    "inquiryVsAdvocacy",
    "conflictTolerance",
    "frameFlexibility",
    "analysisVsAction",
    "cogDiversitySeeking",
    "postMortemOrientation",
  ] as const;

  const result: Record<string, number> = {};
  for (const dim of dims) {
    const raw = (totals[dim] ?? 0) / questionCount;
    result[dim] = round(Math.min(1, Math.max(0, raw)));
  }

  return result as unknown as CdmDimensions;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
