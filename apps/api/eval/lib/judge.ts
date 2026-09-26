import { readFileSync } from "node:fs";
import { z } from "zod";
import type { PlanTrace } from "../../src/lib/turn-planner.js";
import type { Backend } from "./backends.js";
import type { Snapshot } from "./snapshots.js";

/**
 * The judge: a fixed, versioned rubric (judge/rubric-vN.md), scored by a
 * different model from the bot so it is not marking its own homework. It
 * never sees which backend or prompt variant produced the turn. The tuning
 * loop may not edit the rubric; a new rubric is a new version, decided by
 * a person.
 */

export const RUBRIC_VERSION = "v1";
const RUBRIC = readFileSync(new URL(`../judge/rubric-${RUBRIC_VERSION}.md`, import.meta.url), "utf8");

const scoresSchema = z.object({
  judgement: z.number().min(1).max(5),
  action_fit: z.number().min(1).max(5),
  builds_on_reply: z.number().min(1).max(5),
  warmth: z.number().min(1).max(5),
  clarity: z.number().min(1).max(5),
  safety: z.number().min(1).max(5),
  overall: z.number().min(1).max(5),
  issues: z.array(z.string()).max(5).default([]),
});
export type JudgeScores = z.infer<typeof scoresSchema>;
export const SCORE_KEYS = ["judgement", "action_fit", "builds_on_reply", "warmth", "clarity", "safety", "overall"] as const;

const JUDGE_SCHEMA = {
  type: "object",
  properties: Object.fromEntries([
    ...SCORE_KEYS.map((k) => [k, { type: "integer", minimum: 1, maximum: 5 }]),
    ["issues", { type: "array", items: { type: "string" } }],
  ]),
  required: [...SCORE_KEYS, "issues"],
  additionalProperties: false,
};

const LABEL: Record<string, string> = {
  peer_review: "peer review about a colleague",
  three_sixty: "360 review about a colleague",
  self_reflection: "weekly self-reflection",
  pulse_check: "team pulse check",
};

function describe(snapshot: Snapshot, trace: PlanTrace): string {
  const i = snapshot.input;
  const allowed = [
    i.canContinue && i.currentTheme && i.followUpsOnTheme < 1 ? "follow up on the current topic" : null,
    i.canContinue && i.nextTheme ? "move on to the next topic" : null,
    "close the conversation",
  ].filter(Boolean);
  const transcript = i.history.map((m) => `${m.role === "assistant" ? "BOT" : "PERSON"}: ${m.content}`).join("\n");
  const p = trace.plan;
  return [
    `Check-in: ${LABEL[i.interactionType] ?? i.interactionType}${i.interactionType === "self_reflection" ? "" : ` (the colleague is ${i.subjectName})`}.`,
    `Current topic: ${i.currentTheme ? `${i.currentTheme.intent} (${i.currentTheme.dataGoal})` : "none"}.`,
    `Next topic: ${i.nextTheme ? `${i.nextTheme.intent} (${i.nextTheme.dataGoal})` : "none"}.`,
    `The bot was allowed to: ${allowed.join("; ")}.`,
    "",
    "Conversation so far:",
    transcript,
    "",
    `Bot's judgement of the latest reply: ${p.quality}`,
    `Bot's action: ${p.action}`,
    `Bot's next message: ${p.question ?? "(closing message, sent from a fixed template)"}`,
  ].join("\n");
}

export async function judgeTurn(judge: Backend, snapshot: Snapshot, trace: PlanTrace, tier: "advanced" | "standard" = "advanced"): Promise<JudgeScores> {
  return judgeDescription(judge, describe(snapshot, trace), tier);
}

/** Judge any described turn against the fixed rubric, with the given judge model tier. */
export async function judgeDescription(judge: Backend, description: string, tier: "advanced" | "standard" = "advanced"): Promise<JudgeScores> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await judge.complete({
        tier,
        effort: "medium",
        maxTokens: 400,
        jsonMode: true,
        jsonSchema: JUDGE_SCHEMA,
        messages: [
          { role: "system", content: RUBRIC },
          { role: "user", content: description },
        ],
      });
      return scoresSchema.parse(JSON.parse(res.content));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
