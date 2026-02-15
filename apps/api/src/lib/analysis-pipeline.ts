import { eq } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import {
  conversations,
  conversationMessages,
  feedbackEntries,
  feedbackValueScores,
  coreValues,
  escalations,
} from "@revualy/db";
import type { LLMGateway } from "@revualy/ai-core";

/**
 * Run the full analysis pipeline on a closed conversation.
 * Each step runs in parallel; individual failures are logged but don't
 * prevent other steps from completing.
 */
export async function runAnalysisPipeline(
  db: TenantDb,
  llm: LLMGateway,
  conversationId: string,
): Promise<void> {
  // 1. Fetch conversation + messages
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId));

  if (!conversation) throw new Error(`Conversation ${conversationId} not found`);

  const messages = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId))
    .orderBy(conversationMessages.createdAt);

  // Extract user-only messages (the actual feedback content)
  const userMessages = messages.filter((m) => m.role === "user");
  const rawContent = userMessages.map((m) => m.content).join("\n\n");

  if (!rawContent.trim()) return;

  // 2. Fetch org's core values for mapping
  const orgValues = await db
    .select()
    .from(coreValues)
    .where(eq(coreValues.isActive, true));

  // 3. Run analysis steps in parallel with graceful degradation
  const results = await Promise.allSettled([
    analyzeSentiment(llm, rawContent),
    scoreEngagement(llm, rawContent, userMessages.length),
    generateSummary(llm, rawContent, conversation.interactionType),
    detectFlags(llm, rawContent),
    orgValues.length > 0 ? mapCoreValues(llm, rawContent, orgValues) : Promise.resolve([]),
  ]);

  // Extract results with safe defaults for any failures
  const sentimentResult =
    results[0].status === "fulfilled" ? results[0].value : "neutral" as Sentiment;
  const engagementResult =
    results[1].status === "fulfilled"
      ? results[1].value
      : { score: 50, wordCount: rawContent.split(/\s+/).length, hasExamples: false };
  const summaryResult =
    results[2].status === "fulfilled" ? results[2].value : "";
  const flagResult =
    results[3].status === "fulfilled"
      ? results[3].value
      : { shouldFlag: false, severity: "coaching" as const, reason: "", flaggedContent: "" };
  const valuesResult =
    results[4].status === "fulfilled" ? results[4].value : [];

  // Log any failures for debugging
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      const stepNames = ["sentiment", "engagement", "summary", "flags", "values"];
      console.error(`Analysis step "${stepNames[i]}" failed for conversation ${conversationId}:`, r.reason);
    }
  });

  // 4. Create feedback entry
  const [feedbackEntry] = await db
    .insert(feedbackEntries)
    .values({
      conversationId,
      reviewerId: conversation.reviewerId,
      subjectId: conversation.subjectId,
      interactionType: conversation.interactionType,
      rawContent,
      aiSummary: summaryResult,
      sentiment: sentimentResult,
      engagementScore: engagementResult.score,
      wordCount: engagementResult.wordCount,
      hasSpecificExamples: engagementResult.hasExamples,
    })
    .returning();

  // 5. Store value scores
  if (valuesResult.length > 0) {
    await db.insert(feedbackValueScores).values(
      valuesResult.map((v) => ({
        feedbackEntryId: feedbackEntry.id,
        coreValueId: v.coreValueId,
        score: v.score,
        evidence: v.evidence,
      })),
    );
  }

  // 6. Create escalation if flagged
  if (flagResult.shouldFlag) {
    await db.insert(escalations).values({
      feedbackEntryId: feedbackEntry.id,
      severity: flagResult.severity,
      reason: flagResult.reason,
      flaggedContent: flagResult.flaggedContent,
    });
  }
}

// ── Sentiment Analysis ──────────────────────────────────

type Sentiment = "positive" | "neutral" | "negative" | "mixed";

async function analyzeSentiment(
  llm: LLMGateway,
  content: string,
): Promise<Sentiment> {
  const response = await llm.complete({
    messages: [
      {
        role: "system",
        content: `Analyze the overall sentiment of this feedback text. Respond with exactly one word: "positive", "negative", "neutral", or "mixed".

Feedback:
${content}`,
      },
    ],
    tier: "fast",
    maxTokens: 10,
    temperature: 0,
  });

  const result = response.content.trim().toLowerCase();
  if (["positive", "negative", "neutral", "mixed"].includes(result)) {
    return result as Sentiment;
  }
  return "neutral";
}

// ── Engagement Quality Scoring ──────────────────────────

interface EngagementResult {
  score: number; // 0-100
  wordCount: number;
  hasExamples: boolean;
}

async function scoreEngagement(
  llm: LLMGateway,
  content: string,
  messageCount: number,
): Promise<EngagementResult> {
  const wordCount = content.split(/\s+/).filter(Boolean).length;

  const response = await llm.complete({
    messages: [
      {
        role: "system",
        content: `Score this feedback for engagement quality on a 0-100 scale. Consider:
- Word count and detail level (${wordCount} words across ${messageCount} messages)
- Specificity: Does it reference concrete situations, behaviors, or outcomes?
- Examples: Does it include specific examples or anecdotes?
- Elaboration: Does the person go beyond surface-level responses?
- Constructiveness: Is the feedback actionable?

Respond in JSON format: {"score": <number 0-100>, "hasExamples": <boolean>}

Feedback:
${content}`,
      },
    ],
    tier: "fast",
    maxTokens: 50,
    temperature: 0,
    jsonMode: true,
  });

  try {
    const parsed = JSON.parse(response.content);
    return {
      score: Math.max(0, Math.min(100, parsed.score ?? 50)),
      wordCount,
      hasExamples: parsed.hasExamples ?? false,
    };
  } catch {
    // Fallback: heuristic scoring
    let score = 30;
    if (wordCount > 20) score += 15;
    if (wordCount > 50) score += 15;
    if (wordCount > 100) score += 10;
    if (messageCount >= 3) score += 10;
    return { score: Math.min(100, score), wordCount, hasExamples: false };
  }
}

// ── AI Summary ──────────────────────────────────────────

async function generateSummary(
  llm: LLMGateway,
  content: string,
  interactionType: string,
): Promise<string> {
  const response = await llm.complete({
    messages: [
      {
        role: "system",
        content: `Summarize this ${interactionType.replace("_", " ")} feedback in 2-3 sentences. Focus on the key takeaways, specific observations, and any actionable insights. Be concise and neutral.

Feedback:
${content}`,
      },
    ],
    tier: "standard",
    maxTokens: 200,
    temperature: 0.3,
  });

  return response.content.trim();
}

// ── Problematic Language Detection ──────────────────────

interface FlagResult {
  shouldFlag: boolean;
  severity: "coaching" | "warning" | "critical";
  reason: string;
  flaggedContent: string;
}

async function detectFlags(
  llm: LLMGateway,
  content: string,
): Promise<FlagResult> {
  const response = await llm.complete({
    messages: [
      {
        role: "system",
        content: `Analyze this feedback for problematic language or concerning patterns. Look for:
- Personal attacks or harassment
- Discriminatory language (bias based on gender, race, age, etc.)
- Threats or intimidation
- Signs of a toxic work environment (bullying, retaliation)
- Concerning mental health indicators (burnout, distress)

Respond in JSON: {"shouldFlag": boolean, "severity": "coaching"|"warning"|"critical", "reason": "brief explanation", "flaggedContent": "the specific concerning text or empty string"}

Only flag genuine concerns — constructive criticism and negative but professional feedback should NOT be flagged.

Feedback:
${content}`,
      },
    ],
    tier: "standard",
    maxTokens: 200,
    temperature: 0,
    jsonMode: true,
  });

  try {
    const parsed = JSON.parse(response.content);
    return {
      shouldFlag: parsed.shouldFlag ?? false,
      severity: parsed.severity ?? "coaching",
      reason: parsed.reason ?? "",
      flaggedContent: parsed.flaggedContent ?? "",
    };
  } catch {
    return { shouldFlag: false, severity: "coaching", reason: "", flaggedContent: "" };
  }
}

// ── Core Values Mapping ─────────────────────────────────

interface ValueScore {
  coreValueId: string;
  score: number;
  evidence: string;
}

async function mapCoreValues(
  llm: LLMGateway,
  content: string,
  values: Array<{ id: string; name: string; description: string }>,
): Promise<ValueScore[]> {
  const valueList = values
    .map((v) => `- ${v.name}: ${v.description}`)
    .join("\n");

  const response = await llm.complete({
    messages: [
      {
        role: "system",
        content: `Map this feedback to the organization's core values. For each value, score how strongly the feedback relates to it (0.0-1.0) and provide a brief evidence quote.

Core values:
${valueList}

Respond in JSON array format: [{"name": "value name", "score": 0.0-1.0, "evidence": "brief quote or explanation"}]

Only include values with score > 0.1. If the feedback doesn't relate to a value, omit it.

Feedback:
${content}`,
      },
    ],
    tier: "fast",
    maxTokens: 500,
    temperature: 0,
    jsonMode: true,
  });

  try {
    const parsed = JSON.parse(response.content) as Array<{
      name: string;
      score: number;
      evidence: string;
    }>;

    const nameToId = new Map(values.map((v) => [v.name.toLowerCase(), v.id]));

    return parsed
      .filter((v) => v.score > 0.1)
      .map((v) => ({
        coreValueId: nameToId.get(v.name.toLowerCase()) ?? "",
        score: Math.max(0, Math.min(1, v.score)),
        evidence: v.evidence,
      }))
      .filter((v) => v.coreValueId !== "");
  } catch {
    return [];
  }
}
