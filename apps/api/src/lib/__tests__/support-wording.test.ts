import { describe, it, expect } from "vitest";
import { EVAL_ORG, fixedTail, parseConsent, supportOffer, supportReplies } from "../bot-references.js";

/**
 * The support handover's fixed wording and consent rules
 * (docs/bot/concerns-playbook.md, Nick 2026-09-27).
 */

describe("parseConsent", () => {
  it.each([
    ["yes", "yes"],
    ["Yes please", "yes"],
    ["yeah ok", "yes"],
    ["ok", "yes"],
    ["Sure, that would help", "yes"],
    ["please do", "yes"],
    ["y", "yes"],
    ["no", "no"],
    ["No thanks", "no"],
    ["nah I'm fine", "no"],
    ["I'm ok thanks", "no"],
    ["not now", "no"],
    ["please don't", "unclear"],
    ["no, please do", "unclear"],
    ["yes but not today", "unclear"],
    ["maybe", "unclear"],
    ["what do you mean?", "unclear"],
    ["", "unclear"],
    ["yesterday was rough", "unclear"],
    ["nothing really", "unclear"],
  ])("%j -> %s", (text, expected) => {
    expect(parseConsent(text)).toBe(expected);
  });
});

describe("support offer wording", () => {
  const noContact = { ...EVAL_ORG, supportContact: null };

  it("offers the contact, says what is passed on, and asks for yes or no", () => {
    const text = supportOffer("wellbeing", EVAL_ORG);
    expect(text).toContain("I'm only a feedback assistant");
    expect(text).toContain(`ask ${EVAL_ORG.supportContact} to get in touch with you in the next couple of working days`);
    expect(text).toContain("not anything you've written here");
    expect(text).toContain("Reply yes or no");
    expect(text).toContain(EVAL_ORG.supportDetails);
    // The outside-work line is for safety only.
    expect(text).not.toContain(EVAL_ORG.supportOutside);
  });

  it("safety asks for today and includes the organisation's outside-work line", () => {
    const text = supportOffer("safety", EVAL_ORG);
    expect(text).toContain("get in touch with you today");
    expect(text).toContain(EVAL_ORG.supportOutside);
    expect(fixedTail("safety", EVAL_ORG)).toBe(text);
  });

  it("without a support contact there is no offer, only details", () => {
    const text = supportOffer("safety", noContact);
    expect(text).not.toContain("Reply yes or no");
    expect(text).toContain(EVAL_ORG.supportDetails);
    expect(text).toContain("no need to reply");
  });

  it("never invents a resource when the organisation gave none", () => {
    const bare = { ...EVAL_ORG, supportDetails: "", supportOutside: "" };
    const text = supportOffer("safety", bare);
    expect(text).not.toMatch(/Samaritans|999|911|emergency/i);
  });

  it("the replies say exactly what happened", () => {
    expect(supportReplies.yes("safety", EVAL_ORG)).toContain("I haven't passed on anything you wrote");
    expect(supportReplies.no(EVAL_ORG)).toContain("I won't pass anything on");
    expect(supportReplies.giveUp(EVAL_ORG)).toContain("won't pass anything on");
    expect(supportReplies.unavailable(noContact)).toContain("haven't passed anything on");
  });
});
