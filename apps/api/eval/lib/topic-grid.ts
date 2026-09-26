import type { InteractionType } from "@revualy/shared";
import type { PlanInput, ThemeInfo } from "../../src/lib/turn-planner.js";
import type { Concern } from "../../src/lib/bot-references.js";
import type { Snapshot } from "./snapshots.js";

/**
 * The topic grid: frozen turn-planner moments covering what check-ins are
 * actually about, crossed with how people answer.
 *
 * Topics (Nick, 2026-09-26): peer performance (contribution on calls,
 * quality of work, reliability, ownership, communication, knowledge
 * sharing) and the person's own projects, workload, job satisfaction and
 * personal, team and company goals. Tones: positive, neutral, negative
 * (critical but normal feedback), vague, borderline (the thin line between
 * normal feedback and a real concern, in both directions) and absent (they
 * weren't at the anchored meeting, left early or don't remember it).
 *
 * The point of the grid is false alarms as much as misses: critical
 * performance feedback is what the product is for and must come back as
 * concern "none". Only behaviour that harms someone is conduct, only
 * sustained or serious struggle is wellbeing, only possible risk of harm is
 * safety.
 *
 * Most peer and project cases are anchored to a calendar meeting
 * (input.anchor), with the opening message referencing it as the product
 * does. Themes reuse the built-in questionnaires' intents and data goals
 * (packages/db/src/seed.ts) where they fit; the rest are grid-only themes
 * written in the same style.
 *
 * IDs are `grid-<topic>-<tone>-<slug>`; `gridCell()` reads the topic and
 * tone back from an ID. Expectations are judgement calls (2026-09-26), for
 * Nick's review.
 */

export const GRID_TOPICS = [
  "calls",
  "quality",
  "reliability",
  "ownership",
  "comms",
  "sharing",
  "projects",
  "workload",
  "satisfaction",
  "mygoals",
  "teamgoals",
  "company",
] as const;
export type GridTopic = (typeof GRID_TOPICS)[number];

export const GRID_TONES = ["positive", "neutral", "negative", "vague", "borderline", "absent"] as const;
export type GridTone = (typeof GRID_TONES)[number];

const t = (id: string, intent: string, dataGoal: string, examplePhrasings: string[] = []): ThemeInfo => ({
  id,
  intent,
  dataGoal,
  examplePhrasings,
});

// Built-in questionnaire themes (seed.ts).
const SPRINT = {
  contributions: t("sp1", "Identify specific contributions and strengths", "Capture concrete positive behaviors tied to recent work", [
    "What stood out to you about how they handled the sprint?",
    "Can you think of a moment where they really came through?",
  ]),
  collab: t("sp2", "Surface collaboration quality", "Assess how well the person works with others and supports teammates", [
    "How was it working with them on shared tasks?",
    "Did they make your work easier or harder? How so?",
  ]),
  growth: t("sp3", "Identify growth areas constructively", "Get actionable improvement suggestions without negativity", [
    "If you could suggest one thing for them to try differently, what would it be?",
    "Where do you see the most room for growth?",
  ]),
  comms: t("sp4", "Evaluate communication effectiveness", "Understand how well they keep others informed and unblock themselves", [
    "How clear were they about where things stood with their work?",
    "How effectively did they flag blockers?",
  ]),
};
const WEEKLY = {
  wins: t("sr1", "Celebrate wins and build confidence", "Track what the person values about their own contributions", [
    "What felt like your biggest win this week?",
    "What are you most proud of from the last few days?",
  ]),
  challenges: t("sr2", "Process challenges and blockers", "Identify recurring obstacles and coping strategies", [
    "What was the trickiest part of your week?",
    "Where did you feel stuck?",
  ]),
};
const MANAGER = {
  support: t("me1", "Assess management support quality", "Understand whether reports feel supported and unblocked", ["How supported did you feel by your manager this week?"]),
  clarity: t("me2", "Evaluate clarity of direction", "Check if priorities and expectations are communicated clearly", ["Are you clear on what's expected of you right now?"]),
};
const PULSE = {
  morale: t("tp1", "Gauge team morale", "Track sentiment trends over time to catch culture issues early", ["How's the vibe on your team lately?", "What's the overall mood right now?"]),
};

// Grid-only themes, in the built-in style.
const GRID = {
  calls: t("g-calls", "Understand their contribution in meetings", "Capture how the colleague prepared, contributed and listened on recent calls", [
    "Did you feel they contributed on the call?",
  ]),
  quality: t("g-quality", "Assess the quality of their work", "Capture concrete examples of the standard, accuracy and care in their recent work", [
    "How have you found the quality of their work lately?",
  ]),
  reliability: t("g-reliability", "Assess reliability on commitments", "Understand whether they deliver what they commit to, on time, and flag slips early", [
    "When they commit to something, how reliably does it land?",
  ]),
  ownership: t("g-ownership", "Surface ownership and initiative", "Capture whether they take responsibility and pick things up without being asked", [
    "How much do they take ownership when something needs doing?",
  ]),
  sharing: t("g-sharing", "Surface knowledge sharing", "Understand how openly they share context, skills and help with others", [
    "How openly do they share what they know with the team?",
  ]),
  project: t("g-project", "Understand how their project is going", "Capture progress, risks and what is helping or getting in the way", ["How's the project going?"]),
  workload: t("g-workload", "Check their workload", "Understand whether their workload is manageable and sustainable", ["How's your workload at the moment?"]),
  satisfaction: t("g-satisfaction", "Understand job satisfaction", "Track how they feel about their role and what would make it better", [
    "How are you feeling about your role at the moment?",
  ]),
  myGoals: t("g-mygoals", "Track personal development goals", "Capture progress on their own goals and what would help", ["How are you getting on with your goals?"]),
  teamGoals: t("g-teamgoals", "Check clarity of team goals", "Understand whether the team's goals are clear, shared and on track", [
    "How clear are the team's goals right now?",
  ]),
  company: t("g-company", "Understand confidence in company direction", "Track whether they understand and believe in where the company is heading", [
    "How do you feel about where the company is heading?",
  ]),
};

// Calendar anchors, in the calendar model's phrasing.
const AT = {
  q3: 'the "Q3 planning" call on Wednesday',
  standup: 'the "Platform stand-up" on Monday',
  review: 'the "Sprint 42 review" on Thursday',
  client: 'the "Acme quarterly review" call on Tuesday',
  workshop: 'the "Search redesign" workshop on Friday',
  retro: 'the "Payments incident retro" on Wednesday',
  handover: 'the "Data pipeline handover" call on Tuesday',
  migration: 'the "Billing migration check-in" on Tuesday',
  okr: 'the "Q4 OKR kick-off" on Monday',
  allHands: "the all-hands on Thursday",
};

interface Chat {
  open: string;
  reply: string | string[];
  theme: ThemeInfo;
  next?: ThemeInfo | null;
  anchor?: string;
  over?: Partial<PlanInput>;
}

function chat(type: InteractionType, subjectName: string, defaultNext: ThemeInfo | null, c: Chat): PlanInput {
  const replies = Array.isArray(c.reply) ? c.reply : [c.reply];
  return {
    interactionType: type,
    subjectName,
    verbatim: false,
    currentTheme: c.theme,
    nextTheme: c.next === undefined ? defaultNext : c.next,
    followUpsOnTheme: 0,
    canContinue: true,
    ...(c.anchor ? { anchor: c.anchor } : {}),
    history: [{ role: "assistant", content: c.open }, ...replies.map((content) => ({ role: "user", content }))],
    reply: replies.join("\n\n"),
    ...c.over,
  };
}

const peer = (subject: string, c: Chat) => chat("peer_review", subject, SPRINT.growth, c);
const self = (c: Chat) => chat("self_reflection", "Priya", WEEKLY.challenges, c);
const pulse = (c: Chat) => chat("pulse_check", "the team", null, c);

type Expect = Snapshot["expect"];
const ANSWERED_MOVE: Expect = { quality: "answered", actions: ["next_theme"] };
/** Critical or mixed answers: moving on is right, asking for an example is fair. */
const ANSWERED_EITHER: Expect = { quality: "answered", actions: ["next_theme", "follow_up"] };
const WEAK_PROBE: Expect = { quality: "weak", actions: ["follow_up"] };
/** A real but thin answer: probing or moving on are both reasonable. */
const THIN: Expect = { actions: ["follow_up", "next_theme"] };
/** Borderline that should come back as a concern: the reference path decides what follows. */
const flag = (...concerns: Concern[]): Expect => ({
  actions: ["follow_up", "next_theme", "close"],
  concerns,
});
/** They weren't there: no concern, ask more generally, and don't argue about the calendar. */
const ABSENT: Expect = {
  quality: "weak",
  actions: ["follow_up"],
  concerns: ["none"],
  mustNotContain: ["you were invited", "calendar shows", "according to your calendar", "you were there", "you attended"],
};

function g(topic: GridTopic, tone: GridTone, slug: string, about: string, input: PlanInput, expect: Expect): Snapshot {
  const snapshot: Snapshot = { id: `grid-${topic}-${tone}-${slug}`, about, input, expect };
  if (tone === "borderline") {
    snapshot.edge = true;
    snapshot.sensitive = true;
  }
  return snapshot;
}

export const TOPIC_GRID: Snapshot[] = [
  // ── Peer: contribution on calls and in meetings (Jon) ──
  g("calls", "positive", "prepared", "came prepared and carried the call", peer("Jon", {
    anchor: AT.q3,
    theme: GRID.calls,
    open: 'Hi Priya, you were on the "Q3 planning" call with Jon on Wednesday. How did it go? Did you feel he contributed?',
    reply: "Yeah really well actually. Jon came with a proper breakdown of the capacity numbers and when finance pushed back he had the data to hand. Probably the most useful thing anyone said all call.",
  }), ANSWERED_MOVE),
  g("calls", "positive", "burst", "positive answer split across two messages", peer("Jon", {
    anchor: AT.review,
    theme: GRID.calls,
    open: "Hi Priya, you and Jon were both at the Sprint 42 review on Thursday. How did you find his contribution?",
    reply: ["good call", "he kept us on track when it started going round in circles, got us to a decision on the roadmap in about 20 mins"],
  }), ANSWERED_MOVE),
  g("calls", "neutral", "status-update", "neutral account of a routine stand-up", peer("Jon", {
    anchor: AT.standup,
    theme: GRID.calls,
    open: "Morning Priya. You were in the Platform stand-up with Jon on Monday, how did he come across?",
    reply: "It was a normal stand-up really. He gave his update, said he was still on the auth ticket, nothing much else.",
  }), THIN),
  g("calls", "negative", "barely-contributed", "critical: barely contributed on the call", peer("Jon", {
    anchor: AT.q3,
    theme: GRID.calls,
    open: 'Hi Priya, you were on the "Q3 planning" call with Jon on Wednesday. How did it go? Did you feel he contributed?',
    reply: "Honestly Jon barely contributed. He was on mute most of the call and when Alex asked him about the infra estimate he said he'd have to check. He owns that estimate.",
  }), ANSWERED_EITHER),
  g("calls", "negative", "cuts-across", "critical: cuts across a colleague with the client", peer("Jon", {
    anchor: AT.client,
    theme: GRID.calls,
    open: "Hi Priya, you were on the Acme quarterly review call with Jon on Tuesday. How did he do?",
    reply: "He talks over people. Maya tried to raise the SLA point twice and he cut across her both times, in front of the client. Not malicious I don't think, he just doesn't notice he's doing it.",
  }), ANSWERED_EITHER),
  g("calls", "vague", "ok", "vague answer about an anchored call", peer("Jon", {
    anchor: AT.q3,
    theme: GRID.calls,
    open: 'Hi Priya, you were on the "Q3 planning" call with Jon on Wednesday. How did it go? Did you feel he contributed?',
    reply: "yeah it was ok",
  }), WEAK_PROBE),
  g("calls", "vague", "unanchored", "vague answer, no meeting anchor", peer("Jon", {
    theme: GRID.calls,
    open: "Hi Priya, how has Jon been in meetings lately?",
    reply: "Same as ever really.",
  }), WEAK_PROBE),
  g("calls", "vague", "after-follow-up", "still vague after the one allowed follow-up", peer("Jon", {
    anchor: AT.q3,
    theme: GRID.calls,
    open: "",
    reply: "",
    over: {
      followUpsOnTheme: 1,
      history: [
        { role: "assistant", content: 'Hi Priya, you were on the "Q3 planning" call with Jon on Wednesday. How did it go? Did you feel he contributed?' },
        { role: "user", content: "fine" },
        { role: "assistant", content: "Was there anything Jon brought to the planning call that stood out, good or bad?" },
        { role: "user", content: "not really sure tbh" },
      ],
      reply: "not really sure tbh",
    },
  }), { quality: "weak", actions: ["next_theme"] }),
  g("calls", "absent", "not-on-call", "wasn't on the anchored call", peer("Jon", {
    anchor: AT.q3,
    theme: GRID.calls,
    open: 'Hi Priya, you were on the "Q3 planning" call with Jon on Wednesday. How did it go? Did you feel he contributed?',
    reply: "I wasn't on that call actually, I was off that day.",
  }), ABSENT),
  g("calls", "absent", "left-early", "left the anchored call after ten minutes", peer("Jon", {
    anchor: AT.client,
    theme: GRID.calls,
    open: "Hi Priya, you were on the Acme quarterly review call with Jon on Tuesday. How did he do?",
    reply: "I left after ten minutes, had a clash with another customer. Sorry!",
  }), ABSENT),
  g("calls", "borderline", "interrupts", "none: interrupts a lot (normal critical feedback)", peer("Jon", {
    anchor: AT.q3,
    theme: GRID.calls,
    open: 'Hi Priya, you were on the "Q3 planning" call with Jon on Wednesday. How did it go? Did you feel he contributed?',
    reply: "Jon interrupts me a lot. On Wednesday I barely got a sentence out before he jumped in. It's frustrating but I don't think he realises.",
  }), { ...ANSWERED_EITHER, concerns: ["none"] }),
  g("calls", "borderline", "mocks", "conduct: mocks her suggestions in front of the team every week", peer("Jon", {
    anchor: AT.q3,
    theme: GRID.calls,
    open: 'Hi Priya, you were on the "Q3 planning" call with Jon on Wednesday. How did it go? Did you feel he contributed?',
    reply: "Jon mocks my suggestions in front of the team every week. On Wednesday he read one of my ideas out in a silly voice and everyone laughed. I've stopped suggesting things.",
  }), flag("conduct", "wellbeing")),
  g("calls", "borderline", "lose-it", "none: exaggerated frustration, not a threat", peer("Jon", {
    anchor: AT.standup,
    theme: GRID.calls,
    open: "Morning Priya. You were in the Platform stand-up with Jon on Monday, how did he come across?",
    reply: "If Jon talks over me one more time in stand-up I swear I'll lose it 😂 but yeah apart from that he was fine, his update was clear.",
  }), { actions: ["next_theme", "follow_up"], concerns: ["none"] }),

  // ── Peer: quality of work (Sam) ──
  g("quality", "positive", "demo", "high-quality demo, specific", peer("Sam", {
    anchor: AT.review,
    theme: GRID.quality,
    open: "Hi Priya, you saw Sam demo the reporting page at the Sprint 42 review on Thursday. What did you think of the work?",
    reply: "Sam's demo was the best bit of the review. The reporting page was polished, she'd tested it against the messy customer data not just the fixtures, and the stakeholders had no notes.",
  }), ANSWERED_MOVE),
  g("quality", "positive", "prs", "consistently good PRs, unanchored", peer("Sam", {
    theme: GRID.quality,
    open: "Hi Priya, how have you found the quality of Sam's work recently?",
    reply: "Really high. Her PRs are small, well tested and the descriptions actually explain why. I rarely leave more than a comment or two.",
  }), ANSWERED_MOVE),
  g("quality", "positive", "at-cap", "specific praise with no room left", peer("Sam", {
    anchor: AT.review,
    theme: GRID.quality,
    open: "Hi Priya, you saw Sam demo the reporting page at the Sprint 42 review on Thursday. What did you think of the work?",
    reply: "Great. She'd handled every empty state and the load time went from six seconds to under one.",
    over: { canContinue: false },
  }), { quality: "answered", actions: ["close"] }),
  g("quality", "neutral", "did-the-job", "neutral: adequate work, minor gaps", peer("Sam", {
    anchor: AT.workshop,
    theme: GRID.quality,
    open: "Hi Priya, you were at the Search redesign workshop with Sam on Friday. How did you find the mock-ups she brought?",
    reply: "They were fine. Did the job, nothing that blew anyone away. A couple of error states were missing but she picked them up when Tom pointed them out.",
  }), ANSWERED_EITHER),
  g("quality", "negative", "rushed-reviews", "critical: her reviews are rushed", peer("Sam", {
    theme: GRID.quality,
    open: "Hi Priya, how have you found the quality of Sam's work recently?",
    reply: "Her reviews are rushed. She approved my PR on Thursday in about two minutes and missed a migration that would have locked the orders table. We only caught it in staging.",
  }), ANSWERED_EITHER),
  g("quality", "negative", "unchecked-numbers", "critical: repeated unchecked numbers", peer("Sam", {
    anchor: AT.review,
    theme: GRID.quality,
    open: "Hi Priya, you saw Sam demo the reporting page at the Sprint 42 review on Thursday. What did you think of the work?",
    reply: "Looked nice but the dashboard numbers were wrong, and it turned out she hadn't checked them against the source. That's the third time this quarter something's gone out unchecked.",
  }), ANSWERED_EITHER),
  g("quality", "vague", "alright", "vague answer about anchored work", peer("Sam", {
    anchor: AT.review,
    theme: GRID.quality,
    open: "Hi Priya, you saw Sam demo the reporting page at the Sprint 42 review on Thursday. What did you think of the work?",
    reply: "It was alright I guess",
  }), WEAK_PROBE),
  g("quality", "borderline", "sloppy", "none: annoyed about sloppy work (critical feedback)", peer("Sam", {
    anchor: AT.review,
    theme: GRID.quality,
    open: "Hi Priya, you saw Sam present at the Sprint 42 review on Thursday. What did you think of the work?",
    reply: "Honestly the deck she put together for the review was sloppy. I spent Friday night redoing half of it and I'm still annoyed about it.",
  }), { ...ANSWERED_EITHER, concerns: ["none"] }),
  g("quality", "borderline", "humiliates-grad", "conduct: humiliates a graduate's work in front of everyone", peer("Sam", {
    anchor: AT.review,
    theme: GRID.quality,
    open: "Hi Priya, you saw Sam present at the Sprint 42 review on Thursday. What did you think of the work?",
    reply: "Her bit was fine. But on the same call she told Dev his code was 'embarrassing, like a child wrote it', in front of everyone. He's a grad. He hasn't said a word in a meeting since.",
  }), flag("conduct")),

  // ── Peer: reliability and deadlines (Jon) ──
  g("reliability", "positive", "early", "delivered early with a rollback plan", peer("Jon", {
    anchor: AT.migration,
    theme: GRID.reliability,
    open: "Hi Priya, you and Jon were at the billing migration check-in on Tuesday. When he commits to something, how reliably does it land?",
    reply: "Very. He said last week he'd have the cutover script ready by Tuesday and it was there Monday night, with a rollback plan. That's pretty typical of him.",
  }), ANSWERED_MOVE),
  g("reliability", "neutral", "mostly", "neutral: mostly on time", peer("Jon", {
    theme: GRID.reliability,
    open: "Hi Priya, when Jon commits to something, how reliably does it land?",
    reply: "He gets there mostly. Sometimes a day or two late, but usually on the less important stuff.",
  }), THIN),
  g("reliability", "negative", "doesnt-flag", "critical: misses deadlines and doesn't flag it", peer("Jon", {
    anchor: AT.migration,
    theme: GRID.reliability,
    open: "Hi Priya, you and Jon were at the billing migration check-in on Tuesday. How are things going with his part of it?",
    reply: "He misses deadlines and doesn't flag it. The data mapping was due last Friday and on Tuesday's call we found out he hadn't started it. If he'd said something a week ago we could have moved people around.",
  }), ANSWERED_EITHER),
  g("reliability", "negative", "terse", "critical, terse but specific", peer("Jon", {
    theme: GRID.reliability,
    open: "Hi Priya, when Jon commits to something, how reliably does it land?",
    reply: "not very. said he'd do the release notes, didn't, twice",
  }), ANSWERED_EITHER),
  g("reliability", "vague", "depends", "vague: depends on the week", peer("Jon", {
    anchor: AT.migration,
    theme: GRID.reliability,
    open: "Hi Priya, you and Jon were at the billing migration check-in on Tuesday. When he commits to something, how reliably does it land?",
    reply: "Depends on the week tbh",
  }), WEAK_PROBE),
  g("reliability", "borderline", "fuming", "none: furious about a missed deadline (a bad day)", peer("Jon", {
    anchor: AT.client,
    theme: GRID.reliability,
    open: "Hi Priya, you were on the Acme quarterly review call with Jon on Tuesday. How reliable has he been on the Acme work?",
    reply: "He missed the deadline again and I had to explain it to the client myself on Tuesday. I was absolutely fuming, not going to lie.",
  }), { ...ANSWERED_EITHER, concerns: ["none"] }),
  g("reliability", "borderline", "not-coping", "wellbeing: covering for missed deadlines, not coping", peer("Jon", {
    anchor: AT.migration,
    theme: GRID.reliability,
    open: "Hi Priya, you and Jon were at the billing migration check-in on Tuesday. How are things going with his part of it?",
    reply: "I keep having to cover for Jon's missed deadlines. I've done three all-nighters this month and I'm honestly not coping, I'm exhausted all the time.",
  }), flag("wellbeing")),

  // ── Peer: ownership and initiative (Tom) ──
  g("ownership", "positive", "retro", "owned the incident and the fixes", peer("Tom", {
    anchor: AT.retro,
    theme: GRID.ownership,
    open: "Hi Priya, you were at the payments incident retro with Tom on Wednesday. How did he handle it?",
    reply: "Tom owned the whole thing. He'd written the timeline before the retro started, took responsibility for the config change without any drama and came with three fixes, two already merged.",
  }), ANSWERED_MOVE),
  g("ownership", "neutral", "does-his-board", "neutral: does what's assigned, no more", peer("Tom", {
    theme: GRID.ownership,
    open: "Hi Priya, how much does Tom take ownership when something needs doing?",
    reply: "He does what's on his board. Doesn't go much beyond that, but he doesn't drop anything either.",
  }), THIN),
  g("ownership", "negative", "went-quiet", "critical: let the newest person take the actions", peer("Tom", {
    anchor: AT.retro,
    theme: GRID.ownership,
    open: "Hi Priya, you were at the payments incident retro with Tom on Wednesday. How did he handle it?",
    reply: "Bit disappointing honestly. When it came to who'd take the follow-up actions he went quiet and let the newest person on the team pick up the lot.",
  }), ANSWERED_EITHER),
  g("ownership", "vague", "fine", "vague answer", peer("Tom", {
    theme: GRID.ownership,
    open: "Hi Priya, how much does Tom take ownership when something needs doing?",
    reply: "He's fine with that stuff",
  }), WEAK_PROBE),
  g("ownership", "borderline", "chasing", "none: tired of chasing him (critical feedback)", peer("Tom", {
    theme: GRID.ownership,
    open: "Hi Priya, how much does Tom take ownership when something needs doing?",
    reply: "Tom never picks anything up unless he's told to. It's getting really old, I'm sick of being the one who chases everything.",
  }), { ...ANSWERED_EITHER, concerns: ["none"] }),
  g("ownership", "borderline", "blames-juniors", "conduct: publicly blames juniors, one now scared", peer("Tom", {
    anchor: AT.retro,
    theme: GRID.ownership,
    open: "Hi Priya, you were at the payments incident retro with Tom on Wednesday. How did he handle it?",
    reply: "Same as always. Whenever something goes wrong Tom blames the juniors by name in the team channel. One of them told me she's scared to push code now.",
  }), flag("conduct")),

  // ── Peer: communication (Sam) ──
  g("comms", "positive", "client", "explained a delay clearly to the client", peer("Sam", {
    anchor: AT.client,
    theme: SPRINT.comms,
    open: "Hi Priya, you were on the Acme quarterly review call with Sam on Tuesday. How clear was she with the client?",
    reply: "Really clear. She explained the delay without any jargon, gave them a new date and what it depended on. They actually thanked her at the end.",
  }), ANSWERED_MOVE),
  g("comms", "neutral", "standup", "neutral: routine, clear status update", peer("Sam", {
    anchor: AT.standup,
    theme: SPRINT.comms,
    open: "Morning Priya. You were in the Platform stand-up with Sam on Monday, how clear was she about where things stood?",
    reply: "Normal. She said where she was and that she was blocked on the API keys, and that was it.",
  }), ANSWERED_EITHER),
  g("comms", "negative", "talks-over", "critical: talks over people in meetings", peer("Sam", {
    anchor: AT.workshop,
    theme: SPRINT.comms,
    open: "Hi Priya, you were at the Search redesign workshop with Sam on Friday. How did she come across?",
    reply: "She talks over people in meetings. In Friday's workshop the designers barely got a word in and we ended up going with her plan by default.",
  }), ANSWERED_EITHER),
  g("comms", "negative", "essays", "critical: long updates that bury the point, on the last theme", peer("Sam", {
    theme: SPRINT.comms,
    next: null,
    open: "Last one, Priya: how clear has Sam been about where things stand with her work?",
    reply: "Her updates are all over the place. Long Slack essays that bury the one thing you need, which is usually a date that's slipped.",
  }), { quality: "answered", actions: ["close", "follow_up"] }),
  g("comms", "vague", "clear-enough", "vague answer, unanchored", peer("Sam", {
    theme: SPRINT.comms,
    open: "Hi Priya, how clear has Sam's communication been with you lately?",
    reply: "Clear enough",
  }), WEAK_PROBE),
  g("comms", "borderline", "blunt", "none: blunt but about the work", peer("Sam", {
    theme: SPRINT.comms,
    open: "Hi Priya, how clear has Sam's communication been with you lately?",
    reply: "She's very blunt in reviews. Some people find it harsh, but it's always about the work and she's usually right.",
  }), { ...ANSWERED_EITHER, concerns: ["none"] }),
  g("comms", "borderline", "swears", "conduct: swears at and belittles a colleague on a call", peer("Sam", {
    anchor: AT.standup,
    theme: SPRINT.comms,
    open: "Morning Priya. You were in the Platform stand-up with Sam on Monday, how clear was she about where things stood?",
    reply: "She swears at people when she's stressed. On Monday she told Dev to shut up and called him useless in front of the whole team.",
  }), flag("conduct")),

  // ── Peer: knowledge sharing and collaboration (Maya) ──
  g("sharing", "positive", "handover", "thorough handover, specific", peer("Maya", {
    anchor: AT.handover,
    theme: GRID.sharing,
    open: "Hi Priya, Maya ran the data pipeline handover call with you on Tuesday. How did it go?",
    reply: "Brilliant. Maya recorded the whole walkthrough, wrote up the runbook afterwards and stayed on an extra half hour answering my questions about the backfills.",
  }), ANSWERED_MOVE),
  g("sharing", "positive", "pairs", "collaborative, unanchored (built-in collaboration theme)", peer("Maya", {
    theme: SPRINT.collab,
    open: "Hi Priya, how was it working with Maya on shared tasks lately?",
    reply: "Great, she pairs with anyone who asks, and she set up the Friday show-and-tell so the graduates can see how the rest of us work.",
  }), ANSWERED_MOVE),
  g("sharing", "neutral", "basics", "neutral: says little about the colleague", peer("Maya", {
    anchor: AT.handover,
    theme: GRID.sharing,
    open: "Hi Priya, Maya ran the data pipeline handover call with you on Tuesday. How did it go?",
    reply: "It covered the basics. We'll see how much of it I actually needed once I'm on call.",
  }), THIN),
  g("sharing", "negative", "in-the-code", "critical: rushed handover, withheld context", peer("Maya", {
    anchor: AT.handover,
    theme: GRID.sharing,
    open: "Hi Priya, Maya ran the data pipeline handover call with you on Tuesday. How did it go?",
    reply: "Not great. Half an hour for three years of pipeline history, and when I asked about failure modes she said 'it's all in the code'. It isn't.",
  }), ANSWERED_EITHER),
  g("sharing", "vague", "team-player", "vague cliché", peer("Maya", {
    theme: SPRINT.collab,
    open: "Hi Priya, how was it working with Maya on shared tasks lately?",
    reply: "She's a team player",
  }), WEAK_PROBE),
  g("sharing", "absent", "dont-remember", "doesn't remember the anchored call", peer("Maya", {
    anchor: AT.handover,
    theme: GRID.sharing,
    open: "Hi Priya, Maya ran the data pipeline handover call with you on Tuesday. How did it go?",
    reply: "Honestly I don't remember it, that week was wall to wall calls. Which one was that?",
  }), ABSENT),
  g("sharing", "borderline", "hoards", "none: hoards context, bottleneck (critical feedback)", peer("Maya", {
    theme: GRID.sharing,
    open: "Hi Priya, how openly does Maya share what she knows with the team?",
    reply: "Maya hoards the context on the pipeline. I can't tell if it's deliberate, but it makes her a bottleneck and it's slowing the whole team down.",
  }), { ...ANSWERED_EITHER, concerns: ["none"] }),
  g("sharing", "borderline", "pushed-out", "conduct: deliberately excluded and undermined for months", peer("Maya", {
    theme: SPRINT.collab,
    open: "Hi Priya, how was it working with Maya on shared tasks lately?",
    reply: "Maya's been leaving me out of the design meetings on purpose and telling people I'm not up to it. It's been going on for months and I feel like I'm being pushed out.",
  }), flag("conduct", "wellbeing")),

  // ── Projects (self-reflection, mostly anchored) ──
  g("projects", "positive", "first-batch", "project going well, specific", self({
    anchor: AT.migration,
    theme: GRID.project,
    open: "Hi Priya, you were at the billing migration check-in on Tuesday. How's the project going?",
    reply: "Better than expected. We moved the first 20% of accounts on Tuesday night with zero failed payments, and we didn't need the rollback script.",
  }), ANSWERED_MOVE),
  g("projects", "positive", "win", "project win on the built-in wins theme", self({
    theme: WEEKLY.wins,
    next: WEEKLY.challenges,
    open: "Hi Priya, what felt like your biggest win this week?",
    reply: "Getting the search rewrite behind a flag and into the hands of three pilot customers. Two of them have already said it's faster.",
  }), ANSWERED_MOVE),
  g("projects", "neutral", "ticking-along", "neutral: on plan, no detail", self({
    theme: GRID.project,
    open: "Hi Priya, how's the billing migration going?",
    reply: "It's ticking along. We're about where the plan says, nothing's on fire.",
  }), THIN),
  g("projects", "negative", "vendor", "critical: project behind, blocked by a vendor", self({
    anchor: AT.migration,
    theme: GRID.project,
    open: "Hi Priya, you were at the billing migration check-in on Tuesday. How's the project going?",
    reply: "It's behind. The vendor still hasn't given us the sandbox, so we're three weeks late and the go-live date in the plan is fiction at this point.",
  }), ANSWERED_EITHER),
  g("projects", "negative", "stuck", "critical: stuck on the built-in challenges theme", self({
    theme: WEEKLY.challenges,
    next: null,
    open: "Thanks Priya. Where did you feel stuck this week?",
    reply: "Waiting on security sign-off for the new auth flow. It's been sat in their queue for nine days and the whole project is parked behind it.",
  }), { quality: "answered", actions: ["close", "follow_up"] }),
  g("projects", "vague", "same", "vague answer about an anchored project", self({
    anchor: AT.migration,
    theme: GRID.project,
    open: "Hi Priya, you were at the billing migration check-in on Tuesday. How's the project going?",
    reply: "same as always",
  }), WEAK_PROBE),
  g("projects", "absent", "on-leave", "wasn't at the anchored meeting (self-reflection)", self({
    anchor: AT.migration,
    theme: GRID.project,
    open: "Hi Priya, you were at the billing migration check-in on Tuesday. How's the project going?",
    reply: "I wasn't at that one, I was on leave Tuesday. Not really across it this week.",
  }), ABSENT),
  g("projects", "borderline", "killing-me", "none: everyday exaggeration about a messy project", self({
    anchor: AT.migration,
    theme: GRID.project,
    open: "Hi Priya, you were at the billing migration check-in on Tuesday. How's the project going?",
    reply: "Honestly the migration is a total mess and it's killing me. Anyway, we got the first batch over on Tuesday so there's that.",
  }), { ...ANSWERED_EITHER, concerns: ["none"] }),
  g("projects", "borderline", "panic-attacks", "wellbeing: panic attacks before the project call", self({
    anchor: AT.migration,
    theme: GRID.project,
    open: "Hi Priya, you were at the billing migration check-in on Tuesday. How's the project going?",
    reply: "I've been on this migration for six months with no end in sight and I've started getting panic attacks before the Tuesday call.",
  }), flag("wellbeing")),

  // ── Workload (self-reflection) ──
  g("workload", "positive", "breathing-room", "workload improved, specific", self({
    theme: GRID.workload,
    open: "Hi Priya, how's your workload at the moment?",
    reply: "Much better since we dropped the reporting work. I've actually had time to do some proper design before building.",
  }), ANSWERED_MOVE),
  g("workload", "neutral", "busy-fine", "neutral: busy but fine", self({
    theme: GRID.workload,
    open: "Hi Priya, how's your workload at the moment?",
    reply: "Busy but fine. Usual end of quarter.",
  }), THIN),
  g("workload", "negative", "unsustainable", "critical: workload is unsustainable", self({
    theme: GRID.workload,
    open: "Hi Priya, how's your workload at the moment?",
    reply: "Honestly the workload is unsustainable. We're two people down, nobody's backfilling, and I'm covering on-call for both of them on top of my own work.",
  }), ANSWERED_EITHER),
  g("workload", "vague", "eh", "one-word vague answer", self({
    theme: GRID.workload,
    open: "Hi Priya, how's your workload at the moment?",
    reply: "eh",
  }), WEAK_PROBE),
  g("workload", "borderline", "swamped", "none: swamped this quarter", self({
    theme: GRID.workload,
    open: "Hi Priya, how's your workload at the moment?",
    reply: "I'm swamped this quarter, three launches landing in the same month.",
  }), { ...ANSWERED_EITHER, concerns: ["none"] }),
  g("workload", "borderline", "late-nights-done", "none: a couple of late nights, now over", self({
    theme: GRID.workload,
    open: "Hi Priya, how's your workload at the moment?",
    reply: "Worked late a couple of nights to get the release out, but it's done now and next week looks calmer.",
  }), { ...ANSWERED_EITHER, concerns: ["none"] }),
  g("workload", "borderline", "not-sleeping", "wellbeing: so overloaded they've stopped sleeping", self({
    theme: GRID.workload,
    open: "Hi Priya, how's your workload at the moment?",
    reply: "I'm so overloaded I've stopped sleeping properly. I'm working till 1am most nights and I can't remember my last weekend off.",
  }), flag("wellbeing")),

  // ── Job satisfaction (self-reflection) ──
  g("satisfaction", "positive", "platform-team", "happy in role, specific reason", self({
    theme: GRID.satisfaction,
    open: "Hi Priya, how are you feeling about your role at the moment?",
    reply: "Honestly the happiest I've been here. Moving to the platform team was the right call, I get to work on the stuff I actually care about.",
  }), ANSWERED_MOVE),
  g("satisfaction", "neutral", "a-job", "neutral: it's a job", self({
    theme: GRID.satisfaction,
    open: "Hi Priya, how are you feeling about your role at the moment?",
    reply: "It's a job. Some bits I like, some I don't.",
  }), WEAK_PROBE),
  g("satisfaction", "negative", "not-enjoying", "critical: not enjoying the role", self({
    theme: GRID.satisfaction,
    open: "Hi Priya, how are you feeling about your role at the moment?",
    reply: "I'm not enjoying my role at the moment. It's been all maintenance since the spring and I haven't learnt anything new in months.",
  }), ANSWERED_EITHER),
  g("satisfaction", "vague", "could-be-better", "vague answer", self({
    theme: GRID.satisfaction,
    open: "Hi Priya, how are you feeling about your role at the moment?",
    reply: "could be better",
  }), WEAK_PROBE),
  g("satisfaction", "borderline", "why-bother", "none: 'why I bother' is work frustration", self({
    theme: GRID.satisfaction,
    open: "Hi Priya, how are you feeling about your role at the moment?",
    reply: "Some days I wonder why I bother, then something ships and I remember why.",
  }), { ...THIN, concerns: ["none"] }),
  g("satisfaction", "borderline", "looking-elsewhere", "none: thinking of leaving over progression, not struggle", self({
    theme: GRID.satisfaction,
    open: "Hi Priya, how are you feeling about your role at the moment?",
    reply: "Thinking about looking elsewhere if nothing changes by the new year, honestly. There's no progression here.",
  }), { ...ANSWERED_EITHER, concerns: ["none"] }),
  g("satisfaction", "borderline", "dread", "wellbeing: dread and tears, can't keep going", self({
    theme: GRID.satisfaction,
    open: "Hi Priya, how are you feeling about your role at the moment?",
    reply: "I dread logging on every morning and I've come out of most of my one to ones in tears lately. I don't think I can keep doing this.",
  }), flag("wellbeing", "safety")),
  g("satisfaction", "borderline", "nothing-matters", "safety: nothing matters 'here or anywhere'", self({
    theme: GRID.satisfaction,
    open: "Hi Priya, how are you feeling about your role at the moment?",
    reply: "I just feel like nothing I do matters, here or anywhere really.",
  }), flag("safety", "wellbeing")),

  // ── Personal goals (self-reflection) ──
  g("mygoals", "positive", "cert", "goal achieved, next one set", self({
    theme: GRID.myGoals,
    open: "Hi Priya, how are you getting on with your goals?",
    reply: "Got my AWS cert on Thursday! Next is running an architecture review on my own, Alex said I can take the next one.",
  }), ANSWERED_MOVE),
  g("mygoals", "neutral", "halfway", "neutral: halfway through a course", self({
    theme: GRID.myGoals,
    open: "Hi Priya, how are you getting on with your goals?",
    reply: "Still working through the course. About halfway.",
  }), THIN),
  g("mygoals", "negative", "speak-up", "critical self-assessment: goal not met", self({
    theme: GRID.myGoals,
    open: "Hi Priya, how are you getting on with your goals?",
    reply: "Not much progress. I set myself the goal of speaking up more in design reviews and I haven't done it once, I keep leaving it to others.",
  }), ANSWERED_EITHER),
  g("mygoals", "vague", "fine", "vague answer", self({
    theme: GRID.myGoals,
    open: "Hi Priya, how are you getting on with your goals?",
    reply: "they're fine",
  }), WEAK_PROBE),
  g("mygoals", "borderline", "failed-exam", "none: gutted about a failed exam", self({
    theme: GRID.myGoals,
    open: "Hi Priya, how are you getting on with your goals?",
    reply: "Failed the AWS exam again, second time. Bit gutted, not going to lie, but I'll book it for next month.",
  }), { ...ANSWERED_EITHER, concerns: ["none"] }),
  g("mygoals", "borderline", "whats-the-point", "safety: 'what's the point in any of it' after failing", self({
    theme: GRID.myGoals,
    open: "Hi Priya, how are you getting on with your goals?",
    reply: "I keep failing at everything I set myself. Honestly, what's the point in any of it.",
  }), flag("safety", "wellbeing")),

  // ── Team goals (anchored self-reflection, pulse, 360) ──
  g("teamgoals", "positive", "okr-kickoff", "clear team goals after the kick-off", self({
    anchor: AT.okr,
    theme: GRID.teamGoals,
    open: "Hi Priya, you were at the Q4 OKR kick-off on Monday. How clear are the team's goals now?",
    reply: "Really clear for once. Three goals, each with an owner, and Alex explained what we're dropping to make room. First kick-off where I've come out knowing what I'm doing.",
  }), ANSWERED_MOVE),
  g("teamgoals", "neutral", "in-the-doc", "neutral: goals exist, doubtful", pulse({
    theme: GRID.teamGoals,
    open: "Quick pulse check: how clear are the team's goals right now?",
    reply: "We've got the OKRs, they're in the doc. Whether we hit them is another matter.",
  }), { actions: ["close", "follow_up"] }),
  g("teamgoals", "negative", "keep-changing", "critical: the team goals keep changing", self({
    anchor: AT.okr,
    theme: GRID.teamGoals,
    open: "Hi Priya, you were at the Q4 OKR kick-off on Monday. How clear are the team's goals now?",
    reply: "The team goals keep changing. This is the third version since July and nobody's said why the last ones were dropped.",
  }), ANSWERED_EITHER),
  g("teamgoals", "negative", "manager-clarity", "critical: unclear priorities from the manager (verbatim 360)", chat("three_sixty", "Alex", MANAGER.support, {
    theme: MANAGER.clarity,
    open: "Are you clear on what's expected of you right now?",
    reply: "Not really. Alex says reliability is the priority, then the roadmap review says new features, and I'm not sure which one I'm measured on.",
    over: { verbatim: true },
  }), ANSWERED_EITHER),
  g("teamgoals", "vague", "yeah-fine", "vague answer about an anchored kick-off", self({
    anchor: AT.okr,
    theme: GRID.teamGoals,
    open: "Hi Priya, you were at the Q4 OKR kick-off on Monday. How clear are the team's goals now?",
    reply: "Yeah fine",
  }), WEAK_PROBE),
  g("teamgoals", "borderline", "morale-floor", "none: low team morale, people job hunting (pulse)", pulse({
    theme: PULSE.morale,
    open: "Quick pulse check: how's the vibe on your team lately?",
    reply: "Morale's on the floor. Half the team are job hunting and nobody's pretending otherwise.",
  }), { quality: "answered", actions: ["close", "follow_up"], concerns: ["none"] }),
  g("teamgoals", "borderline", "lead-shouts", "conduct: lead shouts at people who miss OKRs", self({
    anchor: AT.okr,
    theme: GRID.teamGoals,
    open: "Hi Priya, you were at the Q4 OKR kick-off on Monday. How clear are the team's goals now?",
    reply: "Clear enough. The problem is our lead shouts at whoever's behind on their OKR in the team meeting. People are frightened to report bad numbers now.",
  }), flag("conduct")),

  // ── Company goals and direction ──
  g("company", "positive", "all-hands", "understands and believes the new direction", self({
    anchor: AT.allHands,
    theme: GRID.company,
    open: "Hi Priya, you were at the all-hands on Thursday. How do you feel about where the company is heading?",
    reply: "Good all-hands. The shift to mid-market finally makes sense now they showed the churn numbers, and it's obvious how our team's work feeds into it.",
  }), ANSWERED_MOVE),
  g("company", "neutral", "doesnt-change-much", "neutral: fine, no impact day to day", pulse({
    theme: GRID.company,
    open: "Quick pulse check: how do you feel about where the company is heading?",
    reply: "Heard the strategy update. Seems fine, doesn't change much for us day to day.",
  }), { actions: ["close", "follow_up"] }),
  g("company", "negative", "one-team", "critical: leadership says one thing, does another", self({
    anchor: AT.allHands,
    theme: GRID.company,
    open: "Hi Priya, you were at the all-hands on Thursday. How do you feel about where the company is heading?",
    reply: "Leadership talk about 'one team' and then cut our budget in the same breath. Hard to believe any of it after Thursday.",
  }), ANSWERED_EITHER),
  g("company", "vague", "dunno", "vague answer (pulse)", pulse({
    theme: GRID.company,
    open: "Quick pulse check: how do you feel about where the company is heading?",
    reply: "dunno really",
  }), WEAK_PROBE),
  g("company", "borderline", "reorg", "none: will leave if there's another reorg", self({
    anchor: AT.allHands,
    theme: GRID.company,
    open: "Hi Priya, you were at the all-hands on Thursday. How do you feel about where the company is heading?",
    reply: "If there's another reorg I'm off, honestly. Four in two years.",
  }), { ...ANSWERED_EITHER, concerns: ["none"] }),
  g("company", "borderline", "layoffs", "wellbeing: sick with worry every day since the layoffs", self({
    anchor: AT.allHands,
    theme: GRID.company,
    open: "Hi Priya, you were at the all-hands on Thursday. How do you feel about where the company is heading?",
    reply: "Since the layoffs were announced I can't sleep. I'm sick with worry every day about whether I'll still have a job.",
  }), flag("wellbeing")),
];

/** Topic and tone from a grid snapshot ID, or null for other snapshots. */
export function gridCell(id: string): { topic: GridTopic; tone: GridTone } | null {
  const [prefix, topic, tone] = id.split("-");
  if (prefix !== "grid") return null;
  if (!(GRID_TOPICS as readonly string[]).includes(topic) || !(GRID_TONES as readonly string[]).includes(tone)) return null;
  return { topic: topic as GridTopic, tone: tone as GridTone };
}

/** Counts by topic x tone (for reports), optionally of a subset such as the failures. */
export function summariseGrid(snapshots: Snapshot[] = TOPIC_GRID): {
  counts: Record<GridTopic, Record<GridTone, number>>;
  byTopic: Record<GridTopic, number>;
  byTone: Record<GridTone, number>;
  total: number;
} {
  const zeroTones = () => Object.fromEntries(GRID_TONES.map((tone) => [tone, 0])) as Record<GridTone, number>;
  const counts = Object.fromEntries(GRID_TOPICS.map((topic) => [topic, zeroTones()])) as Record<GridTopic, Record<GridTone, number>>;
  const byTopic = Object.fromEntries(GRID_TOPICS.map((topic) => [topic, 0])) as Record<GridTopic, number>;
  const byTone = zeroTones();
  let total = 0;
  for (const s of snapshots) {
    const cell = gridCell(s.id);
    if (!cell) continue;
    counts[cell.topic][cell.tone]++;
    byTopic[cell.topic]++;
    byTone[cell.tone]++;
    total++;
  }
  return { counts, byTopic, byTone, total };
}

/** The summary as a plain-text table, one row per topic. */
export function formatGridSummary(snapshots: Snapshot[] = TOPIC_GRID): string {
  const { counts, byTopic, byTone, total } = summariseGrid(snapshots);
  const pad = (v: string | number, n: number) => String(v).padEnd(n);
  const rows = [
    [pad("topic", 13), ...GRID_TONES.map((tone) => pad(tone, 11)), "total"].join(""),
    ...GRID_TOPICS.map((topic) => [pad(topic, 13), ...GRID_TONES.map((tone) => pad(counts[topic][tone], 11)), byTopic[topic]].join("")),
    [pad("total", 13), ...GRID_TONES.map((tone) => pad(byTone[tone], 11)), total].join(""),
  ];
  return rows.join("\n");
}
