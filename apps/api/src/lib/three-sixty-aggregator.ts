import { eq, and } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import {
  threeSixtyReviews,
  threeSixtyResponses,
  feedbackEntries,
  feedbackValueScores,
  coreValues,
  users,
} from "@revualy/db";
import type { ThreeSixtyAggregation } from "@revualy/shared";

export async function aggregateThreeSixtyReview(
  db: TenantDb,
  reviewId: string,
): Promise<ThreeSixtyAggregation> {
  // 1. Fetch the review
  const [review] = await db
    .select()
    .from(threeSixtyReviews)
    .where(eq(threeSixtyReviews.id, reviewId));

  if (!review) {
    throw Object.assign(new Error("Review not found"), { statusCode: 404 });
  }

  // Get subject name
  const [subject] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, review.subjectId));

  const subjectName = subject?.name ?? "Unknown";

  // 2. Fetch all completed responses with their feedback entries
  const completedResponses = await db
    .select({
      response: threeSixtyResponses,
      feedbackEntry: feedbackEntries,
    })
    .from(threeSixtyResponses)
    .leftJoin(
      feedbackEntries,
      eq(threeSixtyResponses.feedbackEntryId, feedbackEntries.id),
    )
    .where(
      and(
        eq(threeSixtyResponses.reviewId, reviewId),
        eq(threeSixtyResponses.status, "completed"),
      ),
    );

  // 3. Aggregate engagement scores and sentiment distribution
  let totalEngagement = 0;
  let engagementCount = 0;
  const sentimentCounts: Record<string, number> = {};
  const summaries: string[] = [];
  const feedbackEntryIds: string[] = [];

  for (const row of completedResponses) {
    const entry = row.feedbackEntry;
    if (!entry) continue;

    feedbackEntryIds.push(entry.id);
    totalEngagement += entry.engagementScore;
    engagementCount++;

    const sentiment = entry.sentiment ?? "neutral";
    sentimentCounts[sentiment] = (sentimentCounts[sentiment] ?? 0) + 1;

    if (entry.aiSummary) {
      summaries.push(entry.aiSummary);
    }
  }

  const avgEngagementScore =
    engagementCount > 0 ? totalEngagement / engagementCount : 0;

  // Normalize sentiment distribution to percentages
  const totalSentiments = Object.values(sentimentCounts).reduce(
    (a, b) => a + b,
    0,
  );
  const sentimentDistribution: Record<string, number> = {};
  for (const [key, count] of Object.entries(sentimentCounts)) {
    sentimentDistribution[key] =
      totalSentiments > 0
        ? Math.round((count / totalSentiments) * 100)
        : 0;
  }

  // 4. Aggregate value scores
  const valueScoreMap = new Map<
    string,
    { totalScore: number; count: number; valueId: string }
  >();

  if (feedbackEntryIds.length > 0) {
    for (const entryId of feedbackEntryIds) {
      const scores = await db
        .select({
          score: feedbackValueScores.score,
          coreValueId: feedbackValueScores.coreValueId,
        })
        .from(feedbackValueScores)
        .where(eq(feedbackValueScores.feedbackEntryId, entryId));

      for (const s of scores) {
        const existing = valueScoreMap.get(s.coreValueId);
        if (existing) {
          existing.totalScore += s.score;
          existing.count++;
        } else {
          valueScoreMap.set(s.coreValueId, {
            totalScore: s.score,
            count: 1,
            valueId: s.coreValueId,
          });
        }
      }
    }
  }

  // Resolve core value names
  const valueScores: ThreeSixtyAggregation["valueScores"] = [];
  for (const [, data] of valueScoreMap) {
    const [cv] = await db
      .select({ name: coreValues.name })
      .from(coreValues)
      .where(eq(coreValues.id, data.valueId));

    valueScores.push({
      valueName: cv?.name ?? "Unknown",
      avgScore: data.count > 0 ? data.totalScore / data.count : 0,
      evidenceCount: data.count,
    });
  }

  // Sort by average score descending
  valueScores.sort((a, b) => b.avgScore - a.avgScore);

  // 5. Extract strengths and growth areas from summaries
  const strengths = extractThemes(summaries, "positive");
  const growthAreas = extractThemes(summaries, "constructive");

  // 6. Generate overall summary
  const overallSummary = generateSummary(
    subjectName,
    completedResponses.length,
    avgEngagementScore,
    sentimentDistribution,
    strengths,
    growthAreas,
  );

  return {
    subjectId: review.subjectId,
    subjectName,
    reviewerCount: completedResponses.length,
    avgEngagementScore: Math.round(avgEngagementScore * 100) / 100,
    sentimentDistribution,
    valueScores,
    strengths,
    growthAreas,
    overallSummary,
  };
}

function extractThemes(
  summaries: string[],
  type: "positive" | "constructive",
): string[] {
  if (summaries.length === 0) return [];

  // Simple keyword-based extraction from feedback summaries.
  // In production, this would use the LLM gateway for proper theme extraction.
  const positiveIndicators = [
    "strength",
    "excels",
    "strong",
    "effective",
    "positive",
    "great",
    "excellent",
    "impressive",
    "supportive",
    "collaborative",
  ];
  const constructiveIndicators = [
    "improve",
    "growth",
    "develop",
    "challenge",
    "could",
    "should",
    "better",
    "opportunity",
    "area",
    "gap",
  ];

  const indicators =
    type === "positive" ? positiveIndicators : constructiveIndicators;
  const themes: string[] = [];

  for (const summary of summaries) {
    const sentences = summary.split(/[.!?]+/).filter((s) => s.trim());
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if (indicators.some((ind) => lower.includes(ind))) {
        const trimmed = sentence.trim();
        if (trimmed.length > 10 && themes.length < 3) {
          themes.push(trimmed);
        }
      }
    }
    if (themes.length >= 3) break;
  }

  return themes.slice(0, 3);
}

function generateSummary(
  subjectName: string,
  reviewerCount: number,
  avgEngagement: number,
  sentimentDist: Record<string, number>,
  strengths: string[],
  growthAreas: string[],
): string {
  const parts: string[] = [];

  parts.push(
    `360 review for ${subjectName} based on ${reviewerCount} reviewer${reviewerCount === 1 ? "" : "s"}.`,
  );

  parts.push(
    `Average engagement score: ${Math.round(avgEngagement * 100) / 100}.`,
  );

  if (Object.keys(sentimentDist).length > 0) {
    const sentimentParts = Object.entries(sentimentDist)
      .sort(([, a]: [string, number], [, b]: [string, number]) => b - a)
      .map(([key, pct]) => `${key} ${pct}%`);
    parts.push(`Sentiment breakdown: ${sentimentParts.join(", ")}.`);
  }

  if (strengths.length > 0) {
    parts.push(`Key strengths identified: ${strengths.length}.`);
  }

  if (growthAreas.length > 0) {
    parts.push(`Growth areas identified: ${growthAreas.length}.`);
  }

  return parts.join(" ");
}
