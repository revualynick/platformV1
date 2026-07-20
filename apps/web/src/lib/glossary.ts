/**
 * Single source of truth for every metric and term shown in the UI.
 * Surfaces render these through <InfoHint entry="..."> so a definition
 * is written once and stays consistent everywhere it appears.
 */

export interface GlossaryEntry {
  term: string;
  short: string;
  long?: string;
}

export const GLOSSARY = {
  engagementScore: {
    term: "Engagement Score",
    short:
      "How thoughtfully you engage in feedback conversations, scored 0–100.",
    long: "Based on the depth and specificity of your feedback responses — concrete examples, actionable detail, and consistency. 80+ is strong, 60–79 is solid, below 60 usually means short or vague replies.",
  },
  interactions: {
    term: "Interactions",
    short:
      "Feedback conversations you complete each week — peer reviews, reflections, and check-ins.",
    long: "The weekly target (usually 3) keeps feedback flowing without overload. Progress resets each Monday.",
  },
  avgQuality: {
    term: "Average Quality",
    short:
      "The average engagement score across all your feedback, out of 100.",
  },
  progress: {
    term: "Progress",
    short: "How close this goal is to done, 0–100%.",
    long: "Updated manually at check-ins, or derived automatically when the goal tracks a metric (e.g. NPS 42 → 55).",
  },
  alignment: {
    term: "Alignment",
    short:
      "The average progress of the goals laddered up to this one — informational, it never overwrites the goal's own progress.",
  },
  laddering: {
    term: "Ladders up",
    short:
      "Every goal connects upward: your goals ladder to team goals, team goals ladder to org goals — so individual work visibly adds up to company outcomes.",
  },
  cycle: {
    term: "Goal cycle",
    short:
      "The time period goals live in — usually a quarter (e.g. Q3 2026). Admins define cycles; personal goals sit outside them.",
  },
  colourProfile: {
    term: "Colour Profile",
    short:
      "Your communication style across four energies: Red (direct, results-driven), Yellow (enthusiastic, expressive), Green (patient, supportive), Blue (analytical, precise).",
  },
  cdm: {
    term: "Critical Decision Making (CDM)",
    short:
      "How you make decisions — how you gather information, weigh options, handle dissent, and review outcomes.",
  },
  sentiment: {
    term: "Sentiment",
    short:
      "Whether feedback reads as positive, neutral, negative, or mixed — analyzed from the conversation text.",
  },
  streak: {
    term: "Streak",
    short: "Consecutive weeks hitting the weekly interaction target.",
  },
  participationRate: {
    term: "Participation rate",
    short: "The share of the team who gave or received feedback this period.",
  },
  behavioralDrift: {
    term: "Behavioral drift",
    short:
      "The gap between someone's self-assessed style and the style observed in their actual feedback behavior — useful as a coaching conversation starter, not a verdict.",
  },
  severityLevels: {
    term: "Flag severity",
    short:
      "Coaching: worth a supportive 1:1. Warning: a pattern to document and watch. Critical: needs immediate HR/admin follow-up.",
  },
  engagementThresholds: {
    term: "Engagement thresholds",
    short:
      "70+ is on track. 50–69 needs attention — a good moment to schedule 1:1s. Below 50 usually calls for immediate coaching.",
  },
  checkInSuggestions: {
    term: "Check-in suggestions",
    short:
      "Goal updates extracted from Google Meet check-in transcripts. They're only ever suggestions — nothing changes until the goal owner or manager reviews and applies them.",
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;
