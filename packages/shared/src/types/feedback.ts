import type {
  UUID,
  ISODateTime,
  InteractionType,
  FeedbackSentiment,
  EscalationSeverity,
} from "./common.js";

export interface FeedbackEntry {
  id: UUID;
  conversationId: UUID;
  reviewerId: UUID;
  subjectId: UUID;
  interactionType: InteractionType;
  rawContent: string; // encrypted at rest
  aiSummary: string;
  sentiment: FeedbackSentiment;
  engagementScore: number; // 0-100
  wordCount: number;
  hasSpecificExamples: boolean;
  embedding: number[] | null; // pgvector
  createdAt: ISODateTime;
}

export interface FeedbackValueScore {
  id: UUID;
  feedbackEntryId: UUID;
  coreValueId: UUID;
  score: number; // 0-1
  evidence: string;
}

export interface Kudos {
  id: UUID;
  giverId: UUID;
  receiverId: UUID;
  message: string;
  coreValueId: UUID | null;
  source: "chat" | "dashboard";
  createdAt: ISODateTime;
}

export interface Escalation {
  id: UUID;
  feedbackEntryId: UUID | null;
  reporterId: UUID;
  subjectId: UUID;
  type: "harassment" | "bias" | "retaliation" | "other";
  severity: EscalationSeverity;
  status: "open" | "investigating" | "resolved" | "dismissed";
  reason: string;
  description: string | null;
  flaggedContent: string;
  resolution: string | null;
  resolvedAt: ISODateTime | null;
  resolvedById: UUID | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface EscalationAuditEntry {
  id: UUID;
  escalationId: UUID;
  action: string;
  performedBy: UUID;
  notes: string | null;
  createdAt: ISODateTime;
}

export type SelfReflectionStatus = "pending" | "in_progress" | "completed" | "skipped";

export type ReflectionMood =
  | "energized"
  | "focused"
  | "reflective"
  | "tired"
  | "optimistic"
  | "stressed";

export interface SelfReflection {
  id: UUID;
  userId: UUID;
  conversationId: UUID | null;
  weekStarting: string;
  status: SelfReflectionStatus;
  mood: string | null;
  highlights: string | null;
  challenges: string | null;
  goalForNextWeek: string | null;
  engagementScore: number | null;
  promptTheme: string | null;
  completedAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ReflectionStats {
  totalCompleted: number;
  avgEngagementScore: number | null;
  currentStreak: number;
  topMood: string | null;
}

export interface ThreeSixtyAggregation {
  subjectId: string;
  subjectName: string;
  reviewerCount: number;
  avgEngagementScore: number;
  sentimentDistribution: Record<string, number>;
  valueScores: Array<{
    valueName: string;
    avgScore: number;
    evidenceCount: number;
  }>;
  strengths: string[];
  growthAreas: string[];
  overallSummary: string;
}

export type ThreeSixtyReviewStatus =
  | "collecting"
  | "analyzing"
  | "completed"
  | "cancelled";

export type ThreeSixtyResponseStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "declined";

export interface ThreeSixtyReview {
  id: UUID;
  subjectId: UUID;
  initiatedById: UUID;
  status: ThreeSixtyReviewStatus;
  targetReviewerCount: number;
  completedReviewerCount: number;
  aggregatedData: ThreeSixtyAggregation | null;
  startedAt: ISODateTime;
  completedAt: ISODateTime | null;
}

export interface ThreeSixtyResponse {
  id: UUID;
  reviewId: UUID;
  reviewerId: UUID;
  feedbackEntryId: UUID | null;
  conversationId: UUID | null;
  status: ThreeSixtyResponseStatus;
  invitedAt: ISODateTime;
  completedAt: ISODateTime | null;
}
