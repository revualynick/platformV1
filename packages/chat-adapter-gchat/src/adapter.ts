import type {
  ChatAdapter,
  InboundMessage,
  OutboundMessage,
  WebhookVerification,
  PlatformUser,
} from "@revualy/chat-core";
import type { ChatPlatform } from "@revualy/shared";
import { google } from "googleapis";
import crypto from "node:crypto";

export interface GoogleChatAdapterConfig {
  serviceAccountKeyJson: string;
  projectId: string;
}

/**
 * Google Chat adapter — Phase 4 implementation.
 * Uses Google Chat API + Pub/Sub for events, Cards v2 for rich messages.
 */
export class GoogleChatAdapter implements ChatAdapter {
  readonly platform: ChatPlatform = "google_chat";
  private projectId: string;

  constructor(config: GoogleChatAdapterConfig) {
    this.projectId = config.projectId;
    // TODO Phase 4: Initialize Google Chat API client with service account
  }

  async verifyWebhook(
    headers: Record<string, string>,
    body: unknown,
  ): Promise<WebhookVerification> {
    // TODO Phase 4: Verify Google Chat webhook using bearer token or Pub/Sub push auth
    const token = headers["authorization"]?.replace("Bearer ", "");
    if (!token) {
      return { isValid: false };
    }
    // Placeholder: will verify JWT from Google
    return { isValid: true };
  }

  async normalizeInbound(rawPayload: unknown): Promise<InboundMessage | null> {
    const payload = rawPayload as Record<string, unknown>;

    // Google Chat sends events with a "type" field
    if (payload.type !== "MESSAGE") {
      return null;
    }

    const message = payload.message as Record<string, unknown>;
    if (!message) return null;

    const sender = message.sender as Record<string, unknown>;

    return {
      id: crypto.randomUUID(),
      platform: "google_chat",
      platformMessageId: message.name as string,
      platformChannelId:
        (payload.space as Record<string, unknown>)?.name as string,
      platformUserId: sender?.name as string,
      text: (message.text as string) ?? "",
      threadId:
        (message.thread as Record<string, unknown>)?.name as string ?? null,
      timestamp: new Date(message.createTime as string),
      rawPayload,
    };
  }

  async sendMessage(message: OutboundMessage): Promise<string> {
    // TODO Phase 4: Use google.chat('v1').spaces.messages.create
    throw new Error(
      "GoogleChatAdapter.sendMessage not yet implemented (Phase 4)",
    );
  }

  async resolveUser(platformUserId: string): Promise<PlatformUser | null> {
    // TODO Phase 4: Use Google People API or Directory API
    return null;
  }

  async sendTypingIndicator(_channelId: string): Promise<void> {
    // Google Chat doesn't support typing indicators for bots
  }
}
