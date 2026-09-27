import { describe, it, expect, afterEach } from "vitest";
import {
  computeReleases,
  latestReleaseBoundary,
  nextReleaseBoundary,
  stripMeetingReferences,
  RELEASE_EPOCH,
  RELEASE_PERIOD_DAYS,
} from "@revualy/shared";
import { reviewerRef, reviewerLabel, pseudonymSecret } from "../pseudonym.js";

const DAY = 24 * 60 * 60 * 1000;
const epoch = new Date(RELEASE_EPOCH);
const at = (days: number) => new Date(RELEASE_EPOCH + days * DAY);

describe("reviewer pseudonyms", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("is stable per person and differs between people and orgs", () => {
    const a = reviewerRef("org-1", "8f2a0c4e-0000-4000-8000-000000000001");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(reviewerRef("org-1", "8F2A0C4E-0000-4000-8000-000000000001")).toBe(a);
    expect(reviewerRef("org-1", "8f2a0c4e-0000-4000-8000-000000000002")).not.toBe(a);
    expect(reviewerRef("org-2", "8f2a0c4e-0000-4000-8000-000000000001")).not.toBe(a);
    expect(reviewerLabel(a)).toBe(`Reviewer ${a.slice(0, 8)}`);
  });

  it("fails closed outside tests when the secret is missing or short", () => {
    delete process.env.REVIEWER_PSEUDONYM_SECRET;
    process.env.NODE_ENV = "production";
    process.env.VITEST = "false";
    expect(() => pseudonymSecret()).toThrow(/not set/);
    process.env.REVIEWER_PSEUDONYM_SECRET = "short";
    expect(() => reviewerRef("o", "u")).toThrow(/shorter than 32/);
    process.env.REVIEWER_PSEUDONYM_SECRET = "x".repeat(32);
    expect(() => reviewerRef("o", "u")).not.toThrow();
  });
});

describe("release batches", () => {
  it("boundaries fall every period from the epoch", () => {
    expect(latestReleaseBoundary(at(3))).toEqual(epoch);
    expect(latestReleaseBoundary(at(RELEASE_PERIOD_DAYS))).toEqual(at(RELEASE_PERIOD_DAYS));
    expect(nextReleaseBoundary(epoch)).toEqual(at(RELEASE_PERIOD_DAYS));
  });

  it("withholds a batch below three distinct reviewers, however many entries", () => {
    const entries = [
      { id: "1", reviewerRef: "a", createdAt: at(1) },
      { id: "2", reviewerRef: "a", createdAt: at(2) },
      { id: "3", reviewerRef: "b", createdAt: at(3) },
    ];
    expect(computeReleases(entries, at(60)).size).toBe(0);
  });

  it("releases at the next boundary, not on arrival", () => {
    const entries = [
      { id: "1", reviewerRef: "a", createdAt: at(1) },
      { id: "2", reviewerRef: "b", createdAt: at(2) },
      { id: "3", reviewerRef: "c", createdAt: at(3) },
    ];
    expect(computeReleases(entries, at(13)).size).toBe(0);
    const released = computeReleases(entries, at(14));
    expect([...released.values()].map((d) => d.getTime())).toEqual(Array(3).fill(at(14).getTime()));
  });

  it("carries a small batch over until the pool reaches three reviewers", () => {
    const entries = [
      { id: "1", reviewerRef: "a", createdAt: at(1) },
      { id: "2", reviewerRef: "b", createdAt: at(2) },
      { id: "3", reviewerRef: "c", createdAt: at(20) },
      // Next fortnight: one reviewer alone is not released on its own.
      { id: "4", reviewerRef: "a", createdAt: at(30) },
    ];
    const released = computeReleases(entries, at(60));
    expect(released.get("1")).toEqual(at(28));
    expect(released.get("3")).toEqual(at(28));
    expect(released.has("4")).toBe(false);
  });
});

describe("stripMeetingReferences", () => {
  it("removes meeting names, days, dates and times", () => {
    const out = stripMeetingReferences(
      "Sam explained the roadmap clearly on the Acme call last week. During Tuesday's planning meeting she kept everyone on track. On 3 March at 2pm she ran the demo well.",
    );
    expect(out).not.toMatch(/acme|call|tuesday|planning|march|2pm/i);
    expect(out).toMatch(/explained the roadmap clearly/);
    expect(out).toMatch(/kept everyone on track/);
  });

  it("removes known labels such as the anchor meeting's title", () => {
    const out = stripMeetingReferences("Great energy in Project Falcon kickoff sync, very clear.", ["Project Falcon kickoff"]);
    expect(out).not.toMatch(/falcon/i);
    expect(out).toMatch(/very clear/);
  });

  it("leaves plain feedback alone", () => {
    const text = "Sam gives clear, specific feedback and follows through.";
    expect(stripMeetingReferences(text)).toBe(text);
  });
});

describe("stripMeetingReferences keeps ordinary phrases (review finding 2026-09-28)", () => {
  it.each([
    ["He is at his best on the whiteboard in a session with customers.", "He is at his best on the whiteboard in a session with customers."],
    ["Sarah gives clear feedback in code review and mentors juniors.", "Sarah gives clear feedback in code review and mentors juniors."],
    ["In the team he was always helpful and calm during planning.", "In the team he was always helpful and calm during planning."],
    ["Sam is thorough. On the Acme call on Tuesday she was clear.", "Sam is thorough. She was clear."],
    ["During Tuesday's planning meeting she kept everyone on track.", "She kept everyone on track."],
    ["In our 1:1 last week he raised a good point.", "He raised a good point."],
    ["During the product demo he answered every question.", "He answered every question."],
    ["In our weekly sync he unblocked two people.", "He unblocked two people."],
  ])("%j", (input, expected) => {
    expect(stripMeetingReferences(input)).toBe(expected);
  });
});
