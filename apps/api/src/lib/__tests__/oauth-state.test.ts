import { describe, it, expect } from "vitest";
import { signOAuthState, verifyOAuthState, OAUTH_STATE_TTL_MS } from "../oauth-state.js";

const SECRET = "test-secret";
const ALICE = "11111111-1111-4111-8111-111111111111";
const MALLORY = "22222222-2222-4222-8222-222222222222";

describe("OAuth state", () => {
  it("round-trips for the user who started the flow", () => {
    const state = signOAuthState(SECRET, ALICE, "/dashboard/settings");
    expect(verifyOAuthState(SECRET, state, ALICE)).toEqual({
      valid: true,
      returnTo: "/dashboard/settings",
    });
  });

  it("rejects a state issued to someone else (account-linking CSRF)", () => {
    const malloryState = signOAuthState(SECRET, MALLORY, "/dashboard/settings");
    expect(verifyOAuthState(SECRET, malloryState, ALICE)).toEqual({
      valid: false,
      reason: "wrong_user",
    });
  });

  it("rejects an expired state", () => {
    const now = Date.now();
    const state = signOAuthState(SECRET, ALICE, "/x", now);
    expect(verifyOAuthState(SECRET, state, ALICE, now + OAUTH_STATE_TTL_MS + 1)).toEqual({
      valid: false,
      reason: "expired",
    });
  });

  it("rejects a tampered payload or foreign signature", () => {
    const state = signOAuthState(SECRET, ALICE, "/x");
    const [payload, sig] = state.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), u: MALLORY }),
    ).toString("base64url");
    expect(verifyOAuthState(SECRET, `${forged}.${sig}`, MALLORY).valid).toBe(false);
    expect(verifyOAuthState("other-secret", state, ALICE).valid).toBe(false);
    expect(verifyOAuthState(SECRET, "not-a-state", ALICE).valid).toBe(false);
  });

  it("never returns an off-site redirect", () => {
    for (const bad of ["https://evil.example", "//evil.example", "javascript:alert(1)"]) {
      const state = signOAuthState(SECRET, ALICE, bad);
      expect(verifyOAuthState(SECRET, state, ALICE)).toEqual({ valid: true, returnTo: "" });
    }
  });
});
