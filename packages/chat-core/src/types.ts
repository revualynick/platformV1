import type { ChatPlatform, UUID } from "@revualy/shared";

export interface InboundMessage {
  id: string;
  platform: ChatPlatform;
  platformMessageId: string;
  platformChannelId: string;
  platformUserId: string;
  text: string;
  threadId: string | null;
  timestamp: Date;
  rawPayload: unknown;
}

export interface OutboundMessage {
  platform: ChatPlatform;
  channelId: string;
  threadId?: string;
  text: string;
  blocks?: MessageBlock[];
  metadata?: Record<string, string>;
}

export type MessageBlock =
  | TextBlock
  | SectionBlock
  | ActionBlock
  | DividerBlock;

export interface TextBlock {
  type: "text";
  text: string;
  style?: "plain" | "markdown";
}

export interface SectionBlock {
  type: "section";
  text: string;
  accessory?: ButtonElement;
}

export interface ActionBlock {
  type: "actions";
  elements: ButtonElement[];
}

export interface DividerBlock {
  type: "divider";
}

export interface ButtonElement {
  type: "button";
  text: string;
  actionId: string;
  value?: string;
  style?: "primary" | "danger";
}

export interface WebhookVerification {
  isValid: boolean;
  challenge?: string; // For URL verification handshakes
}

export interface PlatformUser {
  platformUserId: string;
  displayName: string;
  email?: string;
}

export interface AdapterConfig {
  platform: ChatPlatform;
  credentials: Record<string, string>;
  webhookPath: string;
}
