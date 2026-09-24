export type UUID = string;
export type ISODateTime = string;
export type ISODate = string;

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * "internal" is the dev chat simulator; "web" is a conversation held in the
 * web app (demo, reflections), answered in the HTTP response. Neither is
 * ever reached through a chat webhook.
 */
export type ChatPlatform = "slack" | "google_chat" | "teams" | "internal" | "web";

export type UserRole = "employee" | "manager" | "admin" | "hr";

export type InteractionType =
  | "peer_review"
  | "self_reflection"
  | "three_sixty"
  | "pulse_check";

export type ConversationStatus =
  | "scheduled"
  | "initiated"
  | "in_progress"
  | "closing"
  | "closed"
  | "expired";

export type EscalationSeverity = "low" | "medium" | "high" | "critical";

export type FeedbackSentiment = "positive" | "neutral" | "negative" | "mixed";

export type ModelTier = "fast" | "standard" | "advanced";
