import { describe, it, expect } from "vitest";
import { EVAL_ORG, fixedTail, supportSignpost } from "../bot-references.js";

/**
 * Support signposting's fixed wording (docs/bot/concerns-playbook.md, Nick
 * 2026-09-27): point to someone at the organisation who is better placed to
 * support them, with the organisation's own details, and pass nothing on.
 */

describe("support signpost", () => {
  it("names the organisation's contact and details, and says nothing was passed on", () => {
    const text = supportSignpost("wellbeing", EVAL_ORG);
    expect(text).toContain("I'm only a feedback assistant");
    expect(text).toContain(`${EVAL_ORG.supportContact} is better placed to support you`);
    expect(text).toContain(EVAL_ORG.supportDetails);
    expect(text).toContain("I haven't passed anything on");
    expect(text).not.toMatch(/reply yes|would you like me to/i);
    // The outside-work line is for safety only.
    expect(text).not.toContain(EVAL_ORG.supportOutside);
  });

  it("safety adds the organisation's outside-work line", () => {
    const text = supportSignpost("safety", EVAL_ORG);
    expect(text).toContain(EVAL_ORG.supportOutside);
    expect(fixedTail("safety", EVAL_ORG)).toBe(text);
  });

  it("never invents a resource when the organisation gave none", () => {
    const bare = { ...EVAL_ORG, supportContact: null, supportDetails: "", supportOutside: "" };
    const text = supportSignpost("safety", bare);
    expect(text).toContain("Your HR team can tell you what support is available.");
    expect(text).not.toMatch(/Samaritans|111|999|911|emergency/i);
  });

  it("conduct says where to raise it and passes nothing on", () => {
    const text = fixedTail("conduct", EVAL_ORG);
    expect(text).toContain(`raise this with ${EVAL_ORG.hrContact}`);
    expect(text).toContain("I haven't passed anything on");
    expect(text).not.toMatch(/reply yes|pass it on to them for you/i);
  });
});
