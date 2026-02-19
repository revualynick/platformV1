import type { LLMGateway } from "@revualy/ai-core";

export interface ReflectionExtraction {
  mood: string;
  highlights: string;
  challenges: string;
  goalForNextWeek: string;
  engagementScore: number;
}

const VALID_MOODS = ["energized", "focused", "reflective", "tired", "optimistic", "stressed"];

export async function extractReflectionData(
  llm: LLMGateway,
  messages: Array<{ role: string; content: string }>,
): Promise<ReflectionExtraction> {
  const transcript = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const response = await llm.complete({
    messages: [
      {
        role: "system",
        content: `Analyze this self-reflection conversation and extract structured data.

Return JSON with these fields:
- "mood": one of "energized", "focused", "reflective", "tired", "optimistic", "stressed" — pick the one that best matches the person's overall tone
- "highlights": 1-3 sentence summary of what went well this week
- "challenges": 1-3 sentence summary of difficulties or blockers
- "goalForNextWeek": 1-2 sentence summary of their intention for next week
- "engagementScore": 0-100 rating of how engaged and thoughtful the reflection was (consider detail, specificity, self-awareness)

If a field isn't discussed, use a reasonable empty value ("" for strings, 50 for score).

Conversation:
${transcript}`,
      },
    ],
    tier: "fast",
    maxTokens: 500,
    temperature: 0,
    jsonMode: true,
  });

  try {
    const parsed = JSON.parse(response.content);
    return {
      mood: VALID_MOODS.includes(parsed.mood) ? parsed.mood : "reflective",
      highlights: typeof parsed.highlights === "string" ? parsed.highlights.slice(0, 2000) : "",
      challenges: typeof parsed.challenges === "string" ? parsed.challenges.slice(0, 2000) : "",
      goalForNextWeek: typeof parsed.goalForNextWeek === "string" ? parsed.goalForNextWeek.slice(0, 2000) : "",
      engagementScore: Math.max(0, Math.min(100, Number(parsed.engagementScore) || 50)),
    };
  } catch {
    return {
      mood: "reflective",
      highlights: "",
      challenges: "",
      goalForNextWeek: "",
      engagementScore: 50,
    };
  }
}
