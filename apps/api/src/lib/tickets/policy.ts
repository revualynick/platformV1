import type { InteractionType } from "@revualy/shared";
import type { TicketType } from "@revualy/db";
import { looksSensitive } from "../meeting-anchor.js";

/**
 * The ticket policy gate (docs/design/privacy-and-agent-access.md, "Ticket
 * policy (first draft)"). The job agent proposes what context a
 * conversation needs; this decides. Pure, so every rule is unit-tested.
 *
 * A proposal names a category and who it is about, as a role in this
 * ticket ("subject", "reviewer", "pair"), never a person id. The gate
 * accepts it only if the ticket type allows that category, about that
 * role, and code can actually supply it. Code then fetches the accepted
 * categories itself, scoped to the ticket's own people: the agent never
 * supplies the content, except one short "angle" line, which is checked
 * for other people's names and sensitive wording.
 *
 * | Ticket type | May contain | Must never contain |
 * |---|---|---|
 * | Peer check-in | subject's first name, shared meeting label (if safe), themes, this conversation's turns | other reviewers' feedback, the subject's self data or 1:1 content, anything about a third person |
 * | Personal check-in | the person's own goals and focus areas, this conversation's turns | anything about colleagues, peer themes about them |
 * | 1:1 follow-up | the pair's tasks and between-meeting goals | anything outside the pair |
 */

/** Everything a job agent might ask for. The last four are never allowed: listed so the gate names what it refused. */
export const CATEGORIES = [
  "subject_name",
  "meeting",
  "meeting_focus",
  "themes",
  "own_goals",
  "focus_areas",
  "pair_tasks",
  "pair_goals",
  "angle",
  "peer_feedback",
  "self_data",
  "one_on_one_content",
  "other_person",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Who an item is about, relative to the ticket. "conversation" is the questionnaire itself. */
export type About = "subject" | "reviewer" | "pair" | "conversation";

export interface TypePolicy {
  /** Category -> the only role it may be about. Anything absent is refused. */
  allowed: Partial<Record<Category, About>>;
  /** Always in the ticket: the conversation cannot run without them. */
  required: Category[];
  /** Added by the deterministic default when available (model down, or no job agent). */
  defaults: Category[];
}

export const POLICY: Record<TicketType, TypePolicy> = {
  peer_checkin: {
    allowed: { subject_name: "subject", meeting: "subject", meeting_focus: "subject", themes: "conversation", angle: "subject" },
    required: ["subject_name", "themes"],
    defaults: ["meeting", "meeting_focus"],
  },
  personal_checkin: {
    allowed: { themes: "conversation", own_goals: "reviewer", focus_areas: "reviewer", angle: "reviewer" },
    required: ["themes"],
    defaults: [],
  },
  one_on_one_followup: {
    allowed: { themes: "conversation", pair_tasks: "pair", pair_goals: "pair", angle: "pair" },
    required: ["themes"],
    defaults: ["pair_tasks", "pair_goals"],
  },
};

export function ticketTypeFor(interactionType: InteractionType): TicketType {
  return interactionType === "peer_review" || interactionType === "three_sixty" ? "peer_checkin" : "personal_checkin";
}

export const MAX_ANGLE_CHARS = 200;

export interface Proposal {
  category: string;
  about: string;
  /** Only read for "angle"; ignored for every other category (code supplies the content). */
  text?: string;
}

export type DropReason =
  | "unknown_category"
  | "not_allowed_for_type"
  | "wrong_person"
  | "unavailable"
  | "no_text"
  | "too_long"
  | "sensitive_wording"
  | "names_someone_else"
  | "duplicate";

export interface GateInput {
  type: TicketType;
  /** Categories code can supply for this ticket (e.g. "meeting" only when a shared meeting resolved). */
  available: ReadonlySet<Category>;
  /** Names of the people in scope (reviewer, and the subject or counterpart): these may appear in an angle. */
  inScopeNames: string[];
  /** Names of everyone else in the organisation: none may appear in an angle. */
  otherNames: string[];
}

export interface AcceptedItem {
  category: Category;
  about: About;
  /** Angle only. */
  text?: string;
}

export interface DroppedItem {
  category: string;
  about: string;
  reason: DropReason;
}

export interface GateResult {
  accepted: AcceptedItem[];
  dropped: DroppedItem[];
}

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Words of a name, lower-case, at least two letters (so initials do not match everything). */
function nameWords(names: string[]): Set<string> {
  const out = new Set<string>();
  for (const n of names) {
    for (const w of n.toLowerCase().split(/[^\p{L}'-]+/u)) if (w.length >= 2) out.add(w);
  }
  return out;
}

/** The gate. Pure: same input, same verdict. */
export function gateProposals(input: GateInput, proposals: Proposal[]): GateResult {
  const policy = POLICY[input.type];
  const inScope = nameWords(input.inScopeNames);
  const others = [...nameWords(input.otherNames)].filter((w) => !inScope.has(w));
  const otherSet = new Set(others);
  const seen = new Set<string>();
  const accepted: AcceptedItem[] = [];
  const dropped: DroppedItem[] = [];

  for (const p of proposals) {
    const category = String(p.category ?? "").trim().toLowerCase();
    const about = String(p.about ?? "").trim().toLowerCase();
    const drop = (reason: DropReason) => dropped.push({ category: category.slice(0, 40), about: about.slice(0, 40), reason });

    if (!(CATEGORIES as readonly string[]).includes(category)) {
      drop("unknown_category");
      continue;
    }
    const cat = category as Category;
    const role = policy.allowed[cat];
    if (!role) {
      drop("not_allowed_for_type");
      continue;
    }
    if (about !== role) {
      drop("wrong_person");
      continue;
    }
    if (!input.available.has(cat)) {
      drop("unavailable");
      continue;
    }
    let text: string | undefined;
    if (cat === "angle") {
      text = String(p.text ?? "")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) {
        drop("no_text");
        continue;
      }
      if (text.length > MAX_ANGLE_CHARS) {
        drop("too_long");
        continue;
      }
      if (looksSensitive(text)) {
        drop("sensitive_wording");
        continue;
      }
      const words = text.toLowerCase().split(/[^\p{L}'-]+/u);
      if (EMAIL.test(text) || UUID.test(text) || words.some((w) => otherSet.has(w) || otherSet.has(w.replace(/'s$/, "")))) {
        drop("names_someone_else");
        continue;
      }
    }
    if (seen.has(cat)) {
      drop("duplicate");
      continue;
    }
    seen.add(cat);
    accepted.push(text === undefined ? { category: cat, about: role } : { category: cat, about: role, text });
  }
  return { accepted, dropped };
}

/** What the ticket holds when there is no job agent, or the model is unavailable. */
export function defaultProposals(type: TicketType, available: ReadonlySet<Category>): Proposal[] {
  const policy = POLICY[type];
  return [...policy.required, ...policy.defaults]
    .filter((c) => available.has(c))
    .map((c) => ({ category: c, about: policy.allowed[c]! }));
}

/**
 * The final verdict: the required categories always, plus whatever the
 * agent proposed (or the defaults when it proposed nothing usable), all
 * through the same gate.
 */
export function decideTicketItems(input: GateInput, agentProposals: Proposal[] | null): GateResult {
  const policy = POLICY[input.type];
  const required = policy.required.filter((c) => input.available.has(c)).map((c) => ({ category: c, about: policy.allowed[c]! }));
  const proposals = agentProposals ?? defaultProposals(input.type, input.available);
  const result = gateProposals(input, [...required, ...proposals]);
  // A required item proposed again by the agent is not a refusal worth logging.
  const requiredSet = new Set<string>(policy.required);
  return { accepted: result.accepted, dropped: result.dropped.filter((d) => !(d.reason === "duplicate" && requiredSet.has(d.category))) };
}
