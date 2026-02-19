import { eq, and, gte, lte, sql } from "drizzle-orm";
import {
  feedbackEntries,
  users,
  teams,
  escalations,
  engagementScores,
} from "@revualy/db";
import type { TenantDb } from "@revualy/db";

// ── Types ──────────────────────────────────────────────

export interface CalibrationReport {
  weekStarting: string;
  orgStats: {
    avgEngagementScore: number;
    avgSentimentDistribution: Record<string, number>;
    totalFeedbackCount: number;
    totalReviewerCount: number;
  };
  reviewerAnalysis: Array<{
    reviewerId: string;
    reviewerName: string;
    feedbackCount: number;
    avgEngagementScore: number;
    sentimentDistribution: Record<string, number>;
    flagRate: number;
    bias: "lenient" | "severe" | "neutral";
    deviationFromMean: number;
  }>;
  teamComparison: Array<{
    teamId: string;
    teamName: string;
    memberCount: number;
    avgEngagementScore: number;
    sentimentDistribution: Record<string, number>;
    deviationFromOrgMean: number;
  }>;
  alerts: Array<{
    type: "reviewer_bias" | "team_deviation";
    subjectId: string;
    subjectName: string;
    message: string;
    severity: "info" | "warning" | "critical";
  }>;
}

// ── Helpers ────────────────────────────────────────────

function computeStdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const sumSquares = values.reduce((acc, v) => acc + (v - mean) ** 2, 0);
  return Math.sqrt(sumSquares / values.length);
}

function sentimentToNumeric(sentiment: string): number {
  switch (sentiment) {
    case "positive":
      return 1;
    case "neutral":
      return 0;
    case "negative":
      return -1;
    default:
      return 0;
  }
}

function computeSentimentDistribution(
  sentiments: string[],
): Record<string, number> {
  const total = sentiments.length;
  if (total === 0) return { positive: 0, neutral: 0, negative: 0 };
  const counts: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
  for (const s of sentiments) {
    const key = s in counts ? s : "neutral";
    counts[key]++;
  }
  return {
    positive: Math.round((counts.positive / total) * 1000) / 1000,
    neutral: Math.round((counts.neutral / total) * 1000) / 1000,
    negative: Math.round((counts.negative / total) * 1000) / 1000,
  };
}

function alertSeverity(absDeviation: number): "info" | "warning" | "critical" {
  if (absDeviation >= 2) return "critical";
  if (absDeviation >= 1.5) return "warning";
  return "info";
}

// ── Main Engine ────────────────────────────────────────

export async function generateCalibrationReport(
  db: TenantDb,
  weekStarting: string,
): Promise<CalibrationReport> {
  const weekStart = new Date(weekStarting);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const weekStartStr = weekStart.toISOString();
  const weekEndStr = weekEnd.toISOString();

  // ── 1. Fetch all feedback for the week ────────────────
  const weekFeedback = await db
    .select({
      id: feedbackEntries.id,
      reviewerId: feedbackEntries.reviewerId,
      subjectId: feedbackEntries.subjectId,
      sentiment: feedbackEntries.sentiment,
      engagementScore: feedbackEntries.engagementScore,
    })
    .from(feedbackEntries)
    .where(
      and(
        gte(feedbackEntries.createdAt, new Date(weekStartStr)),
        lte(feedbackEntries.createdAt, new Date(weekEndStr)),
      ),
    );

  // ── 2. Fetch escalations linked to this week's feedback
  const feedbackIds = weekFeedback.map((f) => f.id);

  let escalationFeedbackIds: Set<string> = new Set();
  if (feedbackIds.length > 0) {
    const escalationRows = await db
      .select({ feedbackEntryId: escalations.feedbackEntryId })
      .from(escalations)
      .where(
        sql`${escalations.feedbackEntryId} IN (${sql.join(
          feedbackIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
      );
    escalationFeedbackIds = new Set(
      escalationRows
        .map((r) => r.feedbackEntryId)
        .filter((id): id is string => id !== null),
    );
  }

  // ── 3. Fetch all users with team info ─────────────────
  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      teamId: users.teamId,
    })
    .from(users)
    .where(eq(users.isActive, true));

  const userMap = new Map(allUsers.map((u) => [u.id, u]));

  // ── 4. Fetch all teams ────────────────────────────────
  const allTeams = await db.select({ id: teams.id, name: teams.name }).from(teams);
  const teamMap = new Map(allTeams.map((t) => [t.id, t]));

  // ── 5. Compute org-level stats ────────────────────────
  const totalFeedbackCount = weekFeedback.length;
  const allSentiments = weekFeedback.map((f) => f.sentiment);
  const allEngagementScores = weekFeedback.map((f) => f.engagementScore);
  const orgAvgEngagement =
    allEngagementScores.length > 0
      ? allEngagementScores.reduce((a, b) => a + b, 0) / allEngagementScores.length
      : 0;
  const orgAvgSentimentNumeric =
    allSentiments.length > 0
      ? allSentiments.map(sentimentToNumeric).reduce((a, b) => a + b, 0) /
        allSentiments.length
      : 0;
  const orgSentimentDistribution = computeSentimentDistribution(allSentiments);

  // ── 6. Per-reviewer analysis ──────────────────────────
  const reviewerGroups = new Map<
    string,
    { sentiments: string[]; scores: number[]; feedbackIds: string[] }
  >();

  for (const f of weekFeedback) {
    let group = reviewerGroups.get(f.reviewerId);
    if (!group) {
      group = { sentiments: [], scores: [], feedbackIds: [] };
      reviewerGroups.set(f.reviewerId, group);
    }
    group.sentiments.push(f.sentiment);
    group.scores.push(f.engagementScore);
    group.feedbackIds.push(f.id);
  }

  const reviewerSentimentNumerics: number[] = [];
  const reviewerAnalysis: CalibrationReport["reviewerAnalysis"] = [];

  for (const [reviewerId, group] of reviewerGroups) {
    const user = userMap.get(reviewerId);
    const avgScore =
      group.scores.reduce((a, b) => a + b, 0) / group.scores.length;
    const sentimentNumeric =
      group.sentiments.map(sentimentToNumeric).reduce((a, b) => a + b, 0) /
      group.sentiments.length;
    reviewerSentimentNumerics.push(sentimentNumeric);

    const escalatedCount = group.feedbackIds.filter((id) =>
      escalationFeedbackIds.has(id),
    ).length;
    const flagRate =
      group.feedbackIds.length > 0
        ? Math.round((escalatedCount / group.feedbackIds.length) * 1000) / 1000
        : 0;

    reviewerAnalysis.push({
      reviewerId,
      reviewerName: user?.name ?? "Unknown",
      feedbackCount: group.sentiments.length,
      avgEngagementScore: Math.round(avgScore * 1000) / 1000,
      sentimentDistribution: computeSentimentDistribution(group.sentiments),
      flagRate,
      bias: "neutral",
      deviationFromMean: 0,
    });
  }

  // Compute std dev and classify bias
  const sentimentStdDev = computeStdDev(
    reviewerSentimentNumerics,
    orgAvgSentimentNumeric,
  );
  const engagementStdDev = computeStdDev(
    allEngagementScores,
    orgAvgEngagement,
  );

  const alerts: CalibrationReport["alerts"] = [];

  for (let i = 0; i < reviewerAnalysis.length; i++) {
    const ra = reviewerAnalysis[i];
    const group = reviewerGroups.get(ra.reviewerId)!;
    const sentimentNumeric =
      group.sentiments.map(sentimentToNumeric).reduce((a, b) => a + b, 0) /
      group.sentiments.length;

    const deviation =
      sentimentStdDev > 0
        ? (sentimentNumeric - orgAvgSentimentNumeric) / sentimentStdDev
        : 0;
    ra.deviationFromMean = Math.round(deviation * 1000) / 1000;

    if (deviation > 1) {
      ra.bias = "lenient";
      const sev = alertSeverity(Math.abs(deviation));
      alerts.push({
        type: "reviewer_bias",
        subjectId: ra.reviewerId,
        subjectName: ra.reviewerName,
        message: `Reviewer "${ra.reviewerName}" shows leniency bias (${ra.deviationFromMean} std dev above org mean)`,
        severity: sev,
      });
    } else if (deviation < -1) {
      ra.bias = "severe";
      const sev = alertSeverity(Math.abs(deviation));
      alerts.push({
        type: "reviewer_bias",
        subjectId: ra.reviewerId,
        subjectName: ra.reviewerName,
        message: `Reviewer "${ra.reviewerName}" shows severity bias (${Math.abs(ra.deviationFromMean)} std dev below org mean)`,
        severity: sev,
      });
    }
  }

  // ── 7. Cross-team comparison ──────────────────────────
  // Group feedback subjects by team
  const teamGroups = new Map<
    string,
    { sentiments: string[]; scores: number[]; memberIds: Set<string> }
  >();

  for (const f of weekFeedback) {
    const subject = userMap.get(f.subjectId);
    if (!subject?.teamId) continue;
    const teamId = subject.teamId;

    let group = teamGroups.get(teamId);
    if (!group) {
      group = { sentiments: [], scores: [], memberIds: new Set() };
      teamGroups.set(teamId, group);
    }
    group.sentiments.push(f.sentiment);
    group.scores.push(f.engagementScore);
    group.memberIds.add(f.subjectId);
  }

  const teamComparison: CalibrationReport["teamComparison"] = [];

  for (const [teamId, group] of teamGroups) {
    const team = teamMap.get(teamId);
    const avgScore =
      group.scores.reduce((a, b) => a + b, 0) / group.scores.length;
    const deviation =
      engagementStdDev > 0
        ? (avgScore - orgAvgEngagement) / engagementStdDev
        : 0;
    const roundedDeviation = Math.round(deviation * 1000) / 1000;

    teamComparison.push({
      teamId,
      teamName: team?.name ?? "Unknown",
      memberCount: group.memberIds.size,
      avgEngagementScore: Math.round(avgScore * 1000) / 1000,
      sentimentDistribution: computeSentimentDistribution(group.sentiments),
      deviationFromOrgMean: roundedDeviation,
    });

    if (Math.abs(deviation) > 1) {
      const direction = deviation > 0 ? "above" : "below";
      const sev = alertSeverity(Math.abs(deviation));
      alerts.push({
        type: "team_deviation",
        subjectId: teamId,
        subjectName: team?.name ?? "Unknown",
        message: `Team "${team?.name ?? teamId}" avg engagement is ${Math.abs(roundedDeviation)} std dev ${direction} org mean`,
        severity: sev,
      });
    }
  }

  return {
    weekStarting,
    orgStats: {
      avgEngagementScore: Math.round(orgAvgEngagement * 1000) / 1000,
      avgSentimentDistribution: orgSentimentDistribution,
      totalFeedbackCount,
      totalReviewerCount: reviewerGroups.size,
    },
    reviewerAnalysis,
    teamComparison,
    alerts,
  };
}
