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
  /** Sender details when the platform includes them (used for auto-linking). */
  sender?: {
    email?: string;
    displayName?: string;
  };
  /** True when the message arrived in a one-to-one DM with the bot. */
  isDirectMessage?: boolean;
}

/**
 * Everything an adapter can surface from a webhook: a message, or a
 * lifecycle change that affects whether we can reach someone.
 */
export type ChatEvent =
  | { kind: "message"; message: InboundMessage }
  | {
      /** The bot was added to a DM (by the user or an admin install). */
      kind: "installed";
      platform: ChatPlatform;
      platformUserId: string;
      email?: string;
      displayName?: string;
      /** Where to send DMs from now on (e.g. a Google Chat space name). */
      dmAddress: string;
    }
  | {
      /** The bot was removed from the DM; the person is no longer reachable. */
      kind: "uninstalled";
      platform: ChatPlatform;
      platformUserId: string;
      dmAddress: string;
    };

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
