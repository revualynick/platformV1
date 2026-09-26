import { describe, it, expect } from "vitest";
import { safeMeetingTitle, whenLabel, meetingLabel } from "../meeting-anchor.js";
import { getInteractionIntro } from "../conversation-orchestrator.js";

describe("safeMeetingTitle", () => {
  it("keeps an ordinary group meeting title", () => {
    expect(safeMeetingTitle("Q3 planning", 5)).toBe("Q3 planning");
  });

  it("never uses the title of a two-person meeting", () => {
    expect(safeMeetingTitle("Roadmap review", 2)).toBeNull();
  });

  it.each([
    "Jon / HR",
    "Disciplinary meeting",
    "Performance improvement plan",
    "1:1 Sam",
    "Catch up with Priya",
    "Interview: senior engineer",
    "Doctor",
    "Confidential: restructure",
    "Salary review",
    "Exit interview: Sam",
    "Jon leaving drinks",
  ])("drops a sensitive title: %s", (title) => {
    expect(safeMeetingTitle(title, 6)).toBeNull();
  });

  it("keeps work titles that only look sensitive (calendar model evaluation, 2026-09-26)", () => {
    expect(safeMeetingTitle("Exit criteria review for launch", 5)).toBe("Exit criteria review for launch");
  });

  it("drops empty, untitled and very long titles", () => {
    expect(safeMeetingTitle("  ", 4)).toBeNull();
    expect(safeMeetingTitle("(No title)", 4)).toBeNull();
    expect(safeMeetingTitle("x".repeat(61), 4)).toBeNull();
  });
});

describe("whenLabel", () => {
  const now = new Date("2026-09-25T15:00:00Z"); // a Friday
  it("says earlier today, yesterday, or the weekday", () => {
    expect(whenLabel(new Date("2026-09-25T09:00:00Z"), now, "Europe/London")).toBe("earlier today");
    expect(whenLabel(new Date("2026-09-24T09:00:00Z"), now, "Europe/London")).toBe("yesterday");
    expect(whenLabel(new Date("2026-09-23T09:00:00Z"), now, "Europe/London")).toBe("on Wednesday");
  });

  it("uses the reviewer's timezone, not the server's", () => {
    // At 02:00 UTC Friday, a meeting at 20:00 UTC Thursday was last night
    // in London but this morning in Sydney.
    const early = new Date("2026-09-25T02:00:00Z");
    const meeting = new Date("2026-09-24T20:00:00Z");
    expect(whenLabel(meeting, early, "Europe/London")).toBe("yesterday");
    expect(whenLabel(meeting, early, "Australia/Sydney")).toBe("earlier today");
  });
});

describe("meetingLabel and the opening", () => {
  const now = new Date("2026-09-25T15:00:00Z");
  it("names a safe group meeting, and falls back to a generic label otherwise", () => {
    const group = { title: "Q3 planning", attendees: ["a", "b", "c"], startAt: new Date("2026-09-23T10:00:00Z") };
    expect(meetingLabel(group, "Jon", now, "Europe/London")).toBe('the "Q3 planning" call on Wednesday');
    expect(meetingLabel({ ...group, title: "Jon / HR" }, "Jon", now, "Europe/London")).toBe("your call with Jon on Wednesday");
  });

  it("an anchored opening says the meeting came from their calendar", () => {
    const intro = getInteractionIntro("peer_review", "Jon", 'the "Q3 planning" call on Wednesday');
    expect(intro).toContain('starting with the "Q3 planning" call on Wednesday');
    expect(intro).toContain("from your calendar");
    expect(intro).toContain("see the themes, not your name");
  });

  it("an unanchored opening is unchanged", () => {
    expect(getInteractionIntro("peer_review", "Jon")).not.toContain("calendar");
  });
});
