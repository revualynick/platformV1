import { describe, it, expect } from "vitest";
import { nextPreferredSendTime, localWeekday } from "../interaction-scheduler.js";

const at = (iso: string) => new Date(iso);
const WEEKEND = [0, 6];

describe("nextPreferredSendTime", () => {
  it("London: the 04:00 UTC pass schedules 10:00 local the same day", () => {
    // Friday 25 Sep 2026, BST (UTC+1)
    const sendAt = nextPreferredSendTime(at("2026-09-25T04:00:00Z"), "Europe/London", "10:00");
    expect(sendAt.toISOString()).toBe("2026-09-25T09:00:00.000Z");
    expect(WEEKEND.includes(localWeekday(sendAt, "Europe/London"))).toBe(false);
  });

  it("regression (review B1): a 10:00 UTC Friday run would land on Saturday, which is now caught", () => {
    const sendAt = nextPreferredSendTime(at("2026-09-25T10:00:00Z"), "Europe/London", "10:00");
    expect(sendAt.toISOString()).toBe("2026-09-26T09:00:00.000Z");
    // The quiet-day check now looks at the send day, so this is skipped.
    expect(localWeekday(sendAt, "Europe/London")).toBe(6);
  });

  it("New York: same day at 10:00 EDT", () => {
    const sendAt = nextPreferredSendTime(at("2026-09-25T04:00:00Z"), "America/New_York", "10:00");
    expect(sendAt.toISOString()).toBe("2026-09-25T14:00:00.000Z");
  });

  it("Tokyo: 10:00 JST has passed at 04:00 UTC, so the next day", () => {
    const sendAt = nextPreferredSendTime(at("2026-09-25T04:00:00Z"), "Asia/Tokyo", "10:00");
    expect(sendAt.toISOString()).toBe("2026-09-26T01:00:00.000Z");
    expect(localWeekday(sendAt, "Asia/Tokyo")).toBe(6); // Saturday in Tokyo: quiet by default
  });

  it("handles the October clock change in London", () => {
    // Clocks go back 01:00 UTC on Sun 25 Oct 2026. Saturday 10:30 BST has
    // passed, so the next 10:00 local is Sunday, which is 10:00 UTC (GMT).
    const sendAt = nextPreferredSendTime(at("2026-10-24T09:30:00Z"), "Europe/London", "10:00");
    expect(sendAt.toISOString()).toBe("2026-10-25T10:00:00.000Z");
  });

  it("falls back safely on bad input", () => {
    expect(nextPreferredSendTime(at("2026-09-25T04:00:00Z"), "Not/AZone", "10:00").toISOString()).toBe(
      "2026-09-25T10:00:00.000Z",
    );
    expect(nextPreferredSendTime(at("2026-09-25T04:00:00Z"), "UTC", "10").toISOString()).toBe(
      "2026-09-25T10:00:00.000Z",
    );
    expect(nextPreferredSendTime(at("2026-09-25T04:00:00Z"), "", "25:99").toISOString()).toBe(
      "2026-09-25T10:00:00.000Z",
    );
  });
});

describe("localWeekday", () => {
  it("uses the user's zone, not UTC", () => {
    const lateFridayUtc = at("2026-09-25T23:30:00Z");
    expect(localWeekday(lateFridayUtc, "UTC")).toBe(5);
    expect(localWeekday(lateFridayUtc, "Asia/Tokyo")).toBe(6);
    expect(localWeekday(lateFridayUtc, "America/Los_Angeles")).toBe(5);
  });
});
