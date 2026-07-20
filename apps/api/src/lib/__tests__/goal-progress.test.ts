import { describe, it, expect } from "vitest";
import {
  computeEffectiveProgress,
  computeAlignment,
  type GoalProgressFields,
  type GoalStatus,
} from "@revualy/shared";

function goal(overrides: Partial<GoalProgressFields> = {}): GoalProgressFields {
  return {
    progressPercent: 0,
    metricName: null,
    metricStartValue: null,
    metricTargetValue: null,
    metricCurrentValue: null,
    ...overrides,
  };
}

function metricGoal(
  start: number,
  target: number,
  current: number,
): GoalProgressFields {
  return goal({
    metricName: "metric",
    metricStartValue: start,
    metricTargetValue: target,
    metricCurrentValue: current,
  });
}

describe("computeEffectiveProgress", () => {
  it("uses manual progress when no metric is attached", () => {
    expect(computeEffectiveProgress(goal({ progressPercent: 45 }))).toBe(45);
  });

  it("clamps manual progress to 0-100", () => {
    expect(computeEffectiveProgress(goal({ progressPercent: 150 }))).toBe(100);
    expect(computeEffectiveProgress(goal({ progressPercent: -10 }))).toBe(0);
  });

  it("uses manual progress when the metric is only partially set", () => {
    const g = goal({
      progressPercent: 30,
      metricName: "NPS",
      metricStartValue: 40,
      metricTargetValue: null,
      metricCurrentValue: 52,
    });
    expect(computeEffectiveProgress(g)).toBe(30);
  });

  it("derives progress from an increasing metric", () => {
    expect(computeEffectiveProgress(metricGoal(40, 60, 52))).toBe(60);
  });

  it("ignores manual progress when a metric is attached", () => {
    const g = { ...metricGoal(0, 100, 25), progressPercent: 99 };
    expect(computeEffectiveProgress(g)).toBe(25);
  });

  it("derives progress from a decreasing metric (reduce churn)", () => {
    // 8% -> 5%, currently 6.5% = halfway
    expect(computeEffectiveProgress(metricGoal(8, 5, 6.5))).toBe(50);
  });

  it("clamps metric progress below 0 (moved backwards)", () => {
    expect(computeEffectiveProgress(metricGoal(40, 60, 30))).toBe(0);
  });

  it("clamps metric progress above 100 (overshot target)", () => {
    expect(computeEffectiveProgress(metricGoal(40, 60, 75))).toBe(100);
  });

  it("handles target === start: 100 iff reached", () => {
    expect(computeEffectiveProgress(metricGoal(50, 50, 50))).toBe(100);
    expect(computeEffectiveProgress(metricGoal(50, 50, 60))).toBe(100);
    expect(computeEffectiveProgress(metricGoal(50, 50, 40))).toBe(0);
  });

  it("rounds derived progress", () => {
    // (1/3) * 100 = 33.33 -> 33
    expect(computeEffectiveProgress(metricGoal(0, 3, 1))).toBe(33);
  });
});

describe("computeAlignment", () => {
  function child(
    progressPercent: number,
    status: GoalStatus = "on_track",
  ): GoalProgressFields & { status: GoalStatus } {
    return { ...goal({ progressPercent }), status };
  }

  it("returns the mean of children's effective progress", () => {
    expect(computeAlignment([child(20), child(40), child(60)])).toBe(40);
  });

  it("excludes draft and archived children", () => {
    expect(
      computeAlignment([child(50), child(0, "draft"), child(0, "archived")]),
    ).toBe(50);
  });

  it("returns null when there are no children", () => {
    expect(computeAlignment([])).toBeNull();
  });

  it("returns null when all children are draft/archived", () => {
    expect(computeAlignment([child(80, "draft"), child(90, "archived")])).toBeNull();
  });

  it("uses metric-derived progress for metric children", () => {
    const metricChild = { ...metricGoal(0, 10, 5), status: "on_track" as GoalStatus };
    expect(computeAlignment([metricChild, child(75)])).toBe(63); // (50+75)/2 = 62.5 -> 63
  });

  it("counts achieved children (only draft/archived are excluded)", () => {
    expect(computeAlignment([child(100, "achieved"), child(0, "behind")])).toBe(50);
  });
});
