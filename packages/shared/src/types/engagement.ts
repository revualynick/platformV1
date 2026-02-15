import type { UUID, ISODateTime, ISODate } from "./common.js";

export interface EngagementScore {
  id: UUID;
  userId: UUID;
  weekStarting: ISODate;
  interactionsCompleted: number;
  interactionsTarget: number;
  averageQualityScore: number; // 0-100
  responseRate: number; // 0-1
  streak: number;
  rank: number | null;
  createdAt: ISODateTime;
}

export interface CalendarEvent {
  id: UUID;
  userId: UUID;
  externalEventId: string;
  title: string;
  attendees: string[]; // user IDs
  startAt: ISODateTime;
  endAt: ISODateTime;
  source: "google" | "outlook";
  createdAt: ISODateTime;
}

export interface PulseCheckTrigger {
  id: UUID;
  orgId: UUID;
  sourceType: "calendar" | "comms" | "manual";
  sourceRef: string;
  sentiment: string | null;
  followUpConversationId: UUID | null;
  createdAt: ISODateTime;
}
