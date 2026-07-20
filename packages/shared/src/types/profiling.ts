// ── Profiling Frameworks ────────────────────────────────

export type ProfilingFramework = "colour" | "cdm";

export type AssessmentQuestionType = "forced_choice" | "scenario";

export type AssessmentContext = "onboarding" | "quarterly" | "coaching" | "retake";

export type ProfileSource = "assessment" | "behavioral";

export type GoalDirection = "increase" | "decrease";

export type ProfileGoalStatus = "active" | "achieved" | "paused";

// ── Colour Profiling (Communication Style) ─────────────

export type ColourDimension = "red" | "yellow" | "green" | "blue";

export interface ColourDimensions {
  /** Direct, results-driven, competitive */
  red: number;
  /** Enthusiastic, collaborative, expressive */
  yellow: number;
  /** Patient, supportive, harmony-seeking */
  green: number;
  /** Analytical, precise, methodical */
  blue: number;
}

export const COLOUR_DIMENSION_LABELS: Record<ColourDimension, { name: string; description: string }> = {
  red: { name: "Fiery Red", description: "Direct, results-driven, competitive" },
  yellow: { name: "Sunshine Yellow", description: "Enthusiastic, collaborative, expressive" },
  green: { name: "Earth Green", description: "Patient, supportive, harmony-seeking" },
  blue: { name: "Cool Blue", description: "Analytical, precise, methodical" },
};

// ── Critical Decision Making (CDM) ─────────────────────

export type CdmDimension =
  | "inquiryVsAdvocacy"
  | "conflictTolerance"
  | "frameFlexibility"
  | "analysisVsAction"
  | "cogDiversitySeeking"
  | "postMortemOrientation";

export interface CdmDimensions {
  /** 0 = pure advocacy, 1 = pure inquiry */
  inquiryVsAdvocacy: number;
  /** 0 = avoids conflict, 1 = welcomes dissent */
  conflictTolerance: number;
  /** 0 = locks into frame early, 1 = reframes readily */
  frameFlexibility: number;
  /** 0 = leaps to action, 1 = over-deliberates */
  analysisVsAction: number;
  /** 0 = confirms existing views, 1 = actively seeks opposing views */
  cogDiversitySeeking: number;
  /** 0 = moves on after deciding, 1 = systematically reviews decisions */
  postMortemOrientation: number;
}

export const CDM_DIMENSION_LABELS: Record<CdmDimension, { name: string; low: string; high: string }> = {
  inquiryVsAdvocacy: { name: "Inquiry vs Advocacy", low: "Advocacy-dominant", high: "Inquiry-dominant" },
  conflictTolerance: { name: "Conflict Tolerance", low: "Conflict-averse", high: "Dissent-welcoming" },
  frameFlexibility: { name: "Frame Flexibility", low: "Locks early", high: "Reframes readily" },
  analysisVsAction: { name: "Analysis vs Action", low: "Action-biased", high: "Analysis-biased" },
  cogDiversitySeeking: { name: "Cognitive Diversity", low: "Confirmation-seeking", high: "Diversity-seeking" },
  postMortemOrientation: { name: "Post-Mortem Orientation", low: "Forward-looking", high: "Review-oriented" },
};

// ── Unified Types ──────────────────────────────────────

export type ProfileDimensions = ColourDimensions | CdmDimensions;

export interface AssessmentOptionScore {
  [dimension: string]: number;
}

export interface AssessmentOption {
  key: string;
  text: string;
  scores: AssessmentOptionScore;
}

export interface AssessmentResponses {
  [questionId: string]: string; // questionId → selected option key
}
