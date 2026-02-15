import type {
  UUID,
  ISODateTime,
  ChatPlatform,
  ConversationStatus,
  InteractionType,
} from "./common.js";

export interface Conversation {
  id: UUID;
  reviewerId: UUID;
  subjectId: UUID;
  interactionType: InteractionType;
  platform: ChatPlatform;
  platformChannelId: string;
  status: ConversationStatus;
  messageCount: number;
  scheduledAt: ISODateTime;
  initiatedAt: ISODateTime | null;
  closedAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface ConversationMessage {
  id: UUID;
  conversationId: UUID;
  role: "system" | "assistant" | "user";
  content: string;
  platformMessageId: string | null;
  createdAt: ISODateTime;
}

export interface Question {
  id: UUID;
  orgId: UUID;
  text: string;
  category: InteractionType;
  coreValueId: UUID | null;
  isSystemDefault: boolean;
  isActive: boolean;
  createdAt: ISODateTime;
}

export interface InteractionScheduleEntry {
  id: UUID;
  userId: UUID;
  scheduledAt: ISODateTime;
  interactionType: InteractionType;
  subjectId: UUID | null;
  conversationId: UUID | null;
  status: "pending" | "sent" | "completed" | "skipped";
  createdAt: ISODateTime;
}
