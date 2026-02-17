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
  type: string;
  severity: EscalationSeverity;
  status: "open" | "investigating" | "resolved" | "dismissed";
  reason: string;
  description: string | null;
  flaggedContent: string;
  resolution: string | null;
  resolvedAt: ISODateTime | null;
  resolvedBy: UUID | null;
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
