import { describe, expect, it } from "vitest";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "@revualy/shared/server";
import { isMeetingParticipant } from "../../modules/goals/permissions.js";

const SECRET = "test-secret";
const USER = "0b6f1c9e-4a4b-4d7e-9a57-2f3a9c1d5e11";

describe("unsubscribe tokens", () => {
  it("round-trips a user and notification type", () => {
    const token = createUnsubscribeToken(SECRET, USER, "weekly_digest");
    expect(verifyUnsubscribeToken(SECRET, token)).toEqual({ userId: USER, type: "weekly_digest" });
  });

  it("rejects a token signed with another secret", () => {
    const token = createUnsubscribeToken("other", USER, "nudge");
    expect(verifyUnsubscribeToken(SECRET, token)).toBeNull();
  });

  it("rejects a token whose type or user was swapped", () => {
    const token = createUnsubscribeToken(SECRET, USER, "nudge");
    const [, , mac] = token.split(".");
    expect(verifyUnsubscribeToken(SECRET, `${USER}.flag_alert.${mac}`)).toBeNull();
    expect(verifyUnsubscribeToken(SECRET, `1b6f1c9e-4a4b-4d7e-9a57-2f3a9c1d5e11.nudge.${mac}`)).toBeNull();
  });

  it("rejects malformed tokens and a missing secret", () => {
    expect(verifyUnsubscribeToken(SECRET, "")).toBeNull();
    expect(verifyUnsubscribeToken(SECRET, "a.b")).toBeNull();
    expect(verifyUnsubscribeToken(SECRET, `not-a-uuid.nudge.x`)).toBeNull();
    expect(verifyUnsubscribeToken("", createUnsubscribeToken(SECRET, USER, "nudge"))).toBeNull();
  });
});

describe("1:1 suggestions stay in the 1:1", () => {
  const meeting = { organizerId: "manager", subjectUserId: "report" };
  it("lets the two participants see them", () => {
    expect(isMeetingParticipant({ userId: "manager" }, meeting)).toBe(true);
    expect(isMeetingParticipant({ userId: "report" }, meeting)).toBe(true);
  });
  it("excludes skip-levels and admins", () => {
    expect(isMeetingParticipant({ userId: "skip-level" }, meeting)).toBe(false);
    expect(isMeetingParticipant({ userId: "admin" }, { ...meeting, subjectUserId: null })).toBe(false);
  });
});
