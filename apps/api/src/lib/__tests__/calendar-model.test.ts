import { describe, it, expect } from "vitest";
import type { LLMCompletionRequest } from "@revualy/ai-core";
import {
  buildModelInput,
  gateProposals,
  proposeCheckins,
  renderPrompt,
  type MeetingRow,
  type Person,
  type Proposal,
} from "../calendar-model.js";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-09-25T12:00:00Z");
const rae: Person = { id: "rae", email: "rae@acme.test", name: "Rae Reviewer" };
const jon: Person = { id: "jon", email: "jon@acme.test", name: "Jon Smith" };
const amy: Person = { id: "amy", email: "amy@acme.test", name: "Amy Jones" };
const kim: Person = { id: "kim", email: "kim@acme.test", name: "Kim Lee" };

function meeting(id: string, over: Partial<MeetingRow> & { hoursAgo?: number; minutes?: number } = {}): MeetingRow {
  const { hoursAgo = 24, minutes = 30, ...rest } = over;
  const startAt = new Date(now.getTime() - hoursAgo * HOUR);
  return {
    id,
    title: "Q3 planning",
    attendees: [rae.email, jon.email, amy.email],
    declined: [],
    visibility: "default",
    startAt,
    endAt: new Date(startAt.getTime() + minutes * 60_000),
    ...rest,
  };
}

function proposal(over: Partial<Proposal> = {}): Proposal {
  return {
    event_index: 1,
    subject_index: 1,
    reason: "A working session with a small group",
    focus: "how clearly Jon shared his updates",
    sensitivity: "low",
    title_safe: true,
    priority: 4,
    ...over,
  };
}

function input(meetings: MeetingRow[], colleagues: Person[] = [jon, amy, kim]) {
  return buildModelInput(rae, meetings, colleagues, now, "Europe/London");
}

describe("calendar model: what the model is shown", () => {
  it("drops private, confidential, declined, short, future and old meetings before the model sees them", () => {
    const ok = meeting("ok");
    const built = input([
      ok,
      meeting("private", { visibility: "private", title: "Secret thing" }),
      meeting("confidential", { visibility: "confidential" }),
      meeting("declined", { declined: [rae.email] }),
      meeting("short", { minutes: 5 }),
      meeting("future", { hoursAgo: -3 }),
      meeting("old", { hoursAgo: 24 * 8 }),
    ]);
    expect(built.meetings.map((m) => m.id)).toEqual(["ok"]);
    expect(renderPrompt(built).user).not.toContain("Secret thing");
  });

  it("lists colleagues as first name and number, outside guests as a count, never emails", () => {
    const built = input([meeting("m", { attendees: [rae.email, jon.email, "guest@other.test", "vendor@other.test"] })]);
    const { user } = renderPrompt(built);
    expect(user).toContain("Jon (P1)");
    expect(user).toContain("2 outside guests");
    expect(user).not.toMatch(/@/);
    expect(user).not.toContain("Smith");
  });
});

describe("calendar model: the gate", () => {
  const group = meeting("group");

  it("accepts a proposal about a real attendee of a real group meeting", () => {
    const [d] = gateProposals(input([group]), [proposal()]);
    expect(d).toMatchObject({ accepted: true, rejectionReason: null, titleSafe: true });
    expect(d.subject?.id).toBe("jon");
    expect(d.event?.id).toBe("group");
  });

  it("rejects invented meetings and people", () => {
    const built = input([group]);
    const decisions = gateProposals(built, [
      proposal({ event_index: 7 }),
      proposal({ event_index: 0 }),
      proposal({ subject_index: 9 }),
      proposal({ subject_index: -1 }),
    ]);
    expect(decisions.map((d) => d.rejectionReason)).toEqual(["invented_meeting", "invented_meeting", "invented_person", "invented_person"]);
    expect(decisions.every((d) => !d.accepted)).toBe(true);
  });

  it("rejects a real colleague who was not in that meeting", () => {
    const built = input([group, meeting("other", { attendees: [rae.email, kim.email, amy.email] })]);
    const kimIndex = built.people.findIndex((p) => p.id === "kim") + 1;
    expect(gateProposals(built, [proposal({ event_index: 1, subject_index: kimIndex })])[0].rejectionReason).toBe("not_in_meeting");
  });

  it("rejects anything the model rates high sensitivity", () => {
    expect(gateProposals(input([group]), [proposal({ sensitivity: "high" })])[0].rejectionReason).toBe("high_sensitivity");
    expect(gateProposals(input([group]), [proposal({ sensitivity: "medium" })])[0].accepted).toBe(true);
  });

  it("never makes a peer check-in from a two-person meeting", () => {
    const oneToOne = meeting("pair", { attendees: [rae.email, jon.email] });
    expect(gateProposals(input([oneToOne]), [proposal()])[0].rejectionReason).toBe("one_to_one");
  });

  it("rejects a meeting the subject declined (via usable)", () => {
    const declined = meeting("d", { declined: [jon.email] });
    expect(gateProposals(input([declined]), [proposal()])[0].rejectionReason).toBe("not_usable");
  });

  it("rejects private meetings and self-review even if handed to the gate directly", () => {
    const priv = { ...input([group]), meetings: [meeting("p", { visibility: "private" })] };
    expect(gateProposals(priv, [proposal()])[0].rejectionReason).toBe("not_usable");
    const selfIn = { ...input([group]), people: [rae] };
    expect(gateProposals(selfIn, [proposal()])[0].rejectionReason).toBe("self");
  });

  it("rejects a focus with sensitive wording, and duplicates", () => {
    const decisions = gateProposals(input([group]), [
      proposal({ focus: "how Jon is coping with his health" }),
      proposal(),
      proposal(),
    ]);
    expect(decisions.map((d) => d.rejectionReason)).toEqual(["sensitive_wording", null, "duplicate"]);
  });

  it("uses the title only when the model AND safeMeetingTitle both allow it", () => {
    const plain = input([group]);
    expect(gateProposals(plain, [proposal({ title_safe: false })])[0]).toMatchObject({ accepted: true, titleSafe: false });
    const hr = input([meeting("hr", { title: "HR: team restructure" })]);
    expect(gateProposals(hr, [proposal({ title_safe: true })])[0]).toMatchObject({ accepted: true, titleSafe: false });
    expect(gateProposals(plain, [proposal({ title_safe: true })])[0].titleSafe).toBe(true);
  });
});

describe("calendar model: talking to the model", () => {
  const quiet = { warn: () => {} };
  const reply = (content: string) => ({ content, usage: { inputTokens: 1, outputTokens: 1 }, model: "claude-haiku-4-5", latencyMs: 1 });

  it("asks the fast tier with a JSON schema, and gates what comes back", async () => {
    const requests: LLMCompletionRequest[] = [];
    const llm = {
      complete: async (req: LLMCompletionRequest) => {
        requests.push(req);
        return reply(JSON.stringify({ proposals: [proposal(), proposal({ subject_index: 42 })] }));
      },
    };
    const res = await proposeCheckins(llm, input([meeting("g")]), { logger: quiet });
    expect(requests[0]).toMatchObject({ tier: "fast", jsonMode: true });
    expect(requests[0].jsonSchema).toBeDefined();
    expect(requests[0].effort).toBeUndefined();
    expect(res.model).toBe("claude-haiku-4-5");
    expect(res.decisions.map((d) => d.accepted)).toEqual([true, false]);
  });

  it("retries once on invalid output, then proposes nothing", async () => {
    let calls = 0;
    const llm = {
      complete: async () => {
        calls++;
        return reply(JSON.stringify({ proposals: [{ event_index: "one" }] }));
      },
    };
    const res = await proposeCheckins(llm, input([meeting("g")]), { logger: quiet });
    expect(calls).toBe(2);
    expect(res.decisions).toEqual([]);
    expect(res.model).toBeNull();
  });

  it("does not call the model when there is nothing to propose from", async () => {
    let calls = 0;
    const llm = { complete: async () => (calls++, reply("{}")) };
    await proposeCheckins(llm, input([meeting("pair", { visibility: "private" })]), { logger: quiet });
    expect(calls).toBe(0);
  });

  it("caps the number of proposals it keeps", async () => {
    const llm = { complete: async () => reply(JSON.stringify({ proposals: [proposal(), proposal({ subject_index: 2 }), proposal({ subject_index: 1, event_index: 1 })] })) };
    const res = await proposeCheckins(llm, input([meeting("g")]), { maxProposals: 2, logger: quiet });
    expect(res.decisions).toHaveLength(2);
  });
});
