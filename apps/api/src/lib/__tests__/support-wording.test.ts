import { describe, it, expect } from "vitest";
import { DEFAULT_WORDING, EVAL_ORG, fixedTail, renderWording, supportSignpost, unknownPlaceholders } from "../bot-references.js";

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
    expect(text).toContain("Your HR team is better placed to support you");
    expect(text).not.toMatch(/Samaritans|111|999|911|emergency/i);
  });

  it("conduct says where to raise it and passes nothing on", () => {
    const text = fixedTail("conduct", EVAL_ORG);
    expect(text).toContain(`raise this with ${EVAL_ORG.hrContact}`);
    expect(text).toContain("I haven't passed anything on");
    expect(text).not.toMatch(/reply yes|pass it on to them for you/i);
  });
});

describe("the organisation's own wording", () => {
  it("replaces the default, with placeholders filled", () => {
    const org = { ...EVAL_ORG, wording: { support: "Please talk to {contact}. {details} {outside}" } };
    expect(supportSignpost("wellbeing", org)).toBe(`Please talk to ${EVAL_ORG.supportContact}. ${EVAL_ORG.supportDetails}`);
    expect(supportSignpost("safety", org)).toBe(`Please talk to ${EVAL_ORG.supportContact}. ${EVAL_ORG.supportDetails} ${EVAL_ORG.supportOutside}`);
    // Conduct keeps the default until they change it too.
    expect(fixedTail("conduct", org)).toBe(renderWording(DEFAULT_WORDING.conduct, { ...org, supportContact: org.hrContact }, { outside: false }));
  });

  it("capitalises the fallback contact only at the start of a sentence, and leaves their text alone", () => {
    const org = { ...EVAL_ORG, supportContact: null, wording: { support: "{contact} can help, e.g. with leave. Or ask {contact}." } };
    expect(supportSignpost("wellbeing", org)).toBe("Your HR team can help, e.g. with leave. Or ask your HR team.");
  });

  it("refuses unknown placeholders", () => {
    expect(unknownPlaceholders("Talk to {contact} or {manager}.")).toEqual(["{manager}"]);
    expect(unknownPlaceholders(DEFAULT_WORDING.support)).toEqual([]);
    expect(unknownPlaceholders(DEFAULT_WORDING.conduct)).toEqual([]);
  });

  it("inserts the organisation's text literally, including $ signs", () => {
    const org = { ...EVAL_ORG, supportDetails: "Calls cost $$0 and $& nothing." };
    expect(supportSignpost("wellbeing", org)).toContain("Calls cost $$0 and $& nothing.");
  });
});
