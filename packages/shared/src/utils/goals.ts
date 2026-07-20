import { clamp } from "./index.js";
import type { GoalStatus } from "../types/goals.js";

export interface GoalProgressFields {
  progressPercent: number;
  metricName: string | null;
  metricStartValue: number | null;
  metricTargetValue: number | null;
  metricCurrentValue: number | null;
}

/**
 * Effective progress of a goal. When a metric is attached, progress is
 * derived from it and the manual progressPercent is ignored; otherwise
 * the manual value is used.
 *
 * Works for decreasing metrics too (target < start, e.g. "reduce churn
 * 8% -> 5%"). When target === start the metric can't express progress:
 * 100 iff current has reached the target, else 0.
 */
export function computeEffectiveProgress(goal: GoalProgressFields): number {
  const { metricName, metricStartValue, metricTargetValue, metricCurrentValue } =
    goal;
  if (
    metricName === null ||
    metricStartValue === null ||
    metricTargetValue === null ||
    metricCurrentValue === null
  ) {
    return clamp(Math.round(goal.progressPercent), 0, 100);
  }
  if (metricTargetValue === metricStartValue) {
    const reached =
      metricTargetValue >= metricStartValue
        ? metricCurrentValue >= metricTargetValue
        : metricCurrentValue <= metricTargetValue;
    return reached ? 100 : 0;
  }
  const ratio =
    (metricCurrentValue - metricStartValue) /
    (metricTargetValue - metricStartValue);
  return clamp(Math.round(ratio * 100), 0, 100);
}

/** Statuses excluded from a parent's alignment aggregate. */
const NON_COUNTED_STATUSES: GoalStatus[] = ["draft", "archived"];

/**
 * Informational rollup shown next to a parent goal's own progress:
 * mean effective progress of counted children, or null when no child
 * counts. Never applied back onto the parent's progressPercent.
 */
export function computeAlignment(
  children: Array<GoalProgressFields & { status: GoalStatus }>,
): number | null {
  const counted = children.filter(
    (c) => !NON_COUNTED_STATUSES.includes(c.status),
  );
  if (counted.length === 0) return null;
  const total = counted.reduce((sum, c) => sum + computeEffectiveProgress(c), 0);
  return Math.round(total / counted.length);
}
