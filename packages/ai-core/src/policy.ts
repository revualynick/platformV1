import type { Decision } from "./decide.js";

/**
 * Decision policy: what code does with a decision. The caller declares the
 * thresholds; these pure functions apply them. The model never chooses the
 * action, so every branch can be unit-tested without a model.
 *
 * Rules are checked in order; the first that matches wins. A rule matches
 * when the value fits `when` and the confidence is at least `minConfidence`.
 * No match gives `otherwise` (usually the careful path); a failed decision
 * gives `onFailure`.
 *
 * Example (concern routing, not wired in yet):
 *
 *   const policy: DecisionPolicy<Concern, Route> = {
 *     rules: [
 *       { when: "none", minConfidence: 0.9, action: "script" },
 *       { when: ["privacy", "off_script"], minConfidence: 0, action: "reference_standard" },
 *       { when: ["wellbeing", "conduct", "safety"], minConfidence: 0, action: "reference_advanced" },
 *     ],
 *     otherwise: "reference_advanced",
 *     onFailure: "reference_advanced",
 *   };
 */

/** A number range for scores; one value or a list of values for choices. */
export type ValueMatch<V> = [V] extends [number] ? { min?: number; max?: number } : V | readonly V[];

export interface PolicyRule<V, A extends string> {
  when: ValueMatch<V>;
  /** Accept only at or above this confidence (0 accepts any). */
  minConfidence: number;
  action: A;
  /** Short label for logs ("confident none"). */
  label?: string;
}

export interface DecisionPolicy<V, A extends string> {
  rules: ReadonlyArray<PolicyRule<V, A>>;
  /** When no rule matches (typically: not confident enough, escalate). */
  otherwise: A;
  /** When the decision itself failed (invalid output, model down, refusal). */
  onFailure: A;
}

export interface PolicyOutcome<A extends string> {
  action: A;
  /** Which rule fired: its index, "otherwise" or "failure". */
  via: number | "otherwise" | "failure";
  /** A plain explanation for logs. */
  reason: string;
}

export function valueMatches<V>(when: ValueMatch<V>, value: V): boolean {
  if (typeof value === "number") {
    const range = when as { min?: number; max?: number };
    return (range.min === undefined || value >= range.min) && (range.max === undefined || value <= range.max);
  }
  if (Array.isArray(when)) return (when as readonly V[]).includes(value);
  return when === value;
}

/** Throws on thresholds outside 0 to 1, so a typo fails at start-up, not in a live turn. */
export function validatePolicy<V, A extends string>(policy: DecisionPolicy<V, A>): void {
  policy.rules.forEach((r, i) => {
    if (!(r.minConfidence >= 0 && r.minConfidence <= 1)) {
      throw new Error(`policy rule ${i} (${r.label ?? r.action}): minConfidence must be 0 to 1, got ${r.minConfidence}`);
    }
  });
}

export function applyPolicy<V, A extends string>(policy: DecisionPolicy<V, A>, decision: Decision<V>): PolicyOutcome<A> {
  if (!decision.ok) {
    return { action: policy.onFailure, via: "failure", reason: `decision failed (${decision.reason}): ${decision.error}` };
  }
  for (let i = 0; i < policy.rules.length; i++) {
    const rule = policy.rules[i];
    if (valueMatches(rule.when, decision.value) && decision.confidence >= rule.minConfidence) {
      return {
        action: rule.action,
        via: i,
        reason: `${String(decision.value)} at ${decision.confidence.toFixed(2)} >= ${rule.minConfidence} (${rule.label ?? `rule ${i}`})`,
      };
    }
  }
  return {
    action: policy.otherwise,
    via: "otherwise",
    reason: `${String(decision.value)} at ${decision.confidence.toFixed(2)} met no rule`,
  };
}
