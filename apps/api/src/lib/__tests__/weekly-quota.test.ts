import { describe, it, expect } from "vitest";
import { weeklyQuota, weeklyTarget } from "../engagement-aggregation.js";
import { selectInteractionType } from "../interaction-scheduler.js";

/** Keep contact low (Nick, 2026-09-26): one peer check-in a week, one or two personal. */
describe("weekly quota", () => {
  it("defaults to one peer and one personal check-in", () => {
    expect(weeklyQuota(null)).toEqual({ peer: 1, personal: 1 });
    expect(weeklyTarget(null)).toBe(2);
  });

  it("allows at most two personal check-ins, however high the preference", () => {
    expect(weeklyQuota({ weeklyInteractionTarget: 3 })).toEqual({ peer: 1, personal: 2 });
    expect(weeklyQuota({ weeklyInteractionTarget: 7 })).toEqual({ peer: 1, personal: 2 });
    expect(weeklyTarget({ weeklyInteractionTarget: 7 })).toBe(3);
  });

  it("never drops below one personal check-in", () => {
    expect(weeklyQuota({ weeklyInteractionTarget: 1 })).toEqual({ peer: 1, personal: 1 });
  });
});

describe("selectInteractionType", () => {
  const quota = { peer: 1, personal: 2 };
  it("schedules the peer check-in first, then personal ones, then nothing", () => {
    expect(selectInteractionType([], quota)).toBe("peer_review");
    expect(selectInteractionType([{ interactionType: "peer_review" }], quota)).toBe("self_reflection");
    expect(selectInteractionType([{ interactionType: "peer_review" }, { interactionType: "self_reflection" }], quota)).toBe("self_reflection");
    expect(
      selectInteractionType([{ interactionType: "peer_review" }, { interactionType: "self_reflection" }, { interactionType: "pulse_check" }], quota),
    ).toBeNull();
  });

  it("never schedules a second peer check-in in a week", () => {
    const week = [{ interactionType: "three_sixty" }, { interactionType: "self_reflection" }, { interactionType: "self_reflection" }];
    expect(selectInteractionType(week, quota)).toBeNull();
  });
});
