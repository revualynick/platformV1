import type { PlanTrace } from "../../src/lib/turn-planner.js";
import type { Snapshot } from "./snapshots.js";
import { LEAK_TERMS } from "./snapshots.js";

/**
 * Hard rules, checked in code. A result passes a rule or it does not; the
 * judge's score only matters among results that pass. `null` = not
 * applicable (e.g. no question when the plan is to close).
 */

export interface CheckResult {
  /** The model produced a usable plan on the first attempt. */
  validFirstTry: boolean;
  /** The model never produced a usable plan: the fallback ran. */
  fallback: boolean;
  /** The rules had to change the model's proposed action. */
  overridden: boolean;
  qualityMatch: boolean | null;
  actionMatch: boolean;
  oneQuestion: boolean | null;
  shortEnough: boolean | null;
  noReveal: boolean | null;
  selfNoThirdPerson: boolean | null;
  mustNotContain: boolean | null;
  /** Account or machine details in the reply: a harness artefact, reported apart from bot failures. */
  leak: boolean;
}

export const HARD_RULES: Array<keyof CheckResult> = [
  "fallback",
  "actionMatch",
  "oneQuestion",
  "shortEnough",
  "noReveal",
  "selfNoThirdPerson",
  "mustNotContain",
];

const REVEAL = /\b(questionnaire|system prompt|my instructions|as an ai|language model|theme[s]?\b)/i;

export function check(snapshot: Snapshot, trace: PlanTrace): CheckResult {
  const { plan, proposal, attempts } = trace;
  const q = plan.question;
  const text = (q ?? "").toLowerCase();
  const words = q ? q.trim().split(/\s+/).length : 0;
  const sentences = q ? q.split(/(?<=[.!?])\s+/).filter((s) => s.trim()).length : 0;

  return {
    validFirstTry: attempts[0]?.error === null,
    fallback: plan.judgedBy === "fallback",
    overridden: proposal !== null && proposal.action !== plan.action,
    qualityMatch: snapshot.expect.quality ? proposal?.quality === snapshot.expect.quality : null,
    actionMatch: snapshot.expect.actions.includes(plan.action),
    // One question: at most one "?" and no list.
    oneQuestion: q ? (q.match(/\?/g) ?? []).length <= 1 && !/^\s*([-*•]|\d+[.)])\s/m.test(q) : null,
    // The prompt asks for under 2 sentences; allow a short lead-in.
    shortEnough: q ? words <= 45 && sentences <= 2 : null,
    noReveal: q ? !REVEAL.test(q) : null,
    selfNoThirdPerson:
      snapshot.input.interactionType === "self_reflection" && q
        ? !new RegExp(`\\b${snapshot.input.subjectName}\\b(?!,)`, "i").test(q.replace(/^(hi|hey|hello)\s+\w+[,!]?\s*/i, ""))
        : null,
    mustNotContain: snapshot.expect.mustNotContain
      ? !snapshot.expect.mustNotContain.some((s) => text.includes(s.toLowerCase()))
      : null,
    leak: LEAK_TERMS.some((s) => text.includes(s)),
  };
}

/** A result passes when every applicable hard rule holds (fallback must be false). */
export function passes(c: CheckResult): boolean {
  return (
    !c.fallback &&
    c.actionMatch &&
    c.oneQuestion !== false &&
    c.shortEnough !== false &&
    c.noReveal !== false &&
    c.selfNoThirdPerson !== false &&
    c.mustNotContain !== false
  );
}
