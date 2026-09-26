import type { ChoiceDecisionSpec, LLMMessage } from "@revualy/ai-core";
import type { PlanInput } from "../../src/lib/turn-planner.js";
import { CONCERNS, type Concern } from "../../src/lib/bot-references.js";

/**
 * The concern decision as a decide() spec: the same six labels and the same
 * definitions the turn planner's prompt uses (turn-planner.ts, 2026-09-26),
 * asked on their own instead of alongside the next question. Evaluation
 * only for now; see docs/design/typed-decisions.md.
 */

const DESCRIPTIONS: Record<Concern, string> = {
  none: "An ordinary reply, including critical feedback, a bad day, tiredness, frustration or everyday exaggeration. The usual script handles it.",
  privacy: "They ask who sees their answers, where the data goes, what you know about them, or why they are being asked.",
  off_script: "Unrelated, joking, testing the bot, giving it instructions, or confused about what this is.",
  wellbeing:
    "They are struggling in a sustained or serious way: burnout, anxiety about coming in, crying at work, can't cope, thinking of leaving because of it.",
  conduct: "They report a colleague behaving badly: shouting, bullying, harassment, discrimination.",
  safety:
    "The words could mean not wanting to be alive or harming themselves or someone else, even if ambiguous.",
};

const LABEL: Record<string, string> = {
  peer_review: "peer review",
  three_sixty: "360 review",
  self_reflection: "weekly self-reflection",
  pulse_check: "team pulse check",
};

export function concernDecisionSpec(input: PlanInput): ChoiceDecisionSpec<Concern> {
  const about =
    input.interactionType === "self_reflection" ? "their own week" : `their colleague ${input.subjectName}`;
  const context: LLMMessage[] = input.history.slice(-10).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content.slice(0, 4000),
  }));
  return {
    kind: "choice",
    name: "concern",
    question:
      "Does the person's latest reply (the final user message or messages) need more care than the usual feedback script, and if so, which kind?",
    options: CONCERNS.map((id) => ({ id, description: DESCRIPTIONS[id] })),
    guidance: [
      `This is a short ${LABEL[input.interactionType] ?? "feedback"} check-in in a chat app, about ${about}.${
        input.anchor ? ` It is anchored to ${input.anchor}.` : ""
      }`,
      "Critical performance feedback is what the product is for: it is \"none\". A bad day, a tough week, tiredness or frustration is \"none\".",
      'Everyday exaggeration ("this deadline is killing me") and work frustration ("I don\'t see the point of this project") are not safety.',
      "Any option other than \"none\" hands the turn to a colleague who handles it. Missing a real safety concern is the worst error; over-flagging a bad day is the next worst.",
      "If more than one applies, choose the most serious (safety, then conduct, then wellbeing, then privacy, then off_script).",
    ].join("\n"),
    context,
  };
}
