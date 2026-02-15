import type {
  ChatAdapter,
  InboundMessage,
  OutboundMessage,
  WebhookVerification,
  PlatformUser,
} from "@revualy/chat-core";
import type { ChatPlatform } from "@revualy/shared";
import crypto from "node:crypto";

export interface TeamsAdapterConfig {
  appId: string;
  appPassword: string;
}

/**
 * Microsoft Teams adapter — Phase 5 implementation.
 * Uses Bot Framework SDK (botbuilder) + Adaptive Cards.
 */
export class TeamsAdapter implements ChatAdapter {
  readonly platform: ChatPlatform = "teams";

  constructor(_config: TeamsAdapterConfig) {
    // TODO Phase 5: Initialize BotFrameworkAdapter
  }

  async verifyWebhook(
    _headers: Record<string, string>,
    _body: unknown,
  ): Promise<WebhookVerification> {
    // TODO Phase 5: Verify Teams webhook via Bot Framework auth
    return { isValid: false };
  }

  async normalizeInbound(_rawPayload: unknown): Promise<InboundMessage | null> {
    // TODO Phase 5: Normalize Teams activity to InboundMessage
    return null;
  }

  async sendMessage(_message: OutboundMessage): Promise<string> {
    // TODO Phase 5: Send via Bot Framework / Adaptive Cards
    throw new Error("TeamsAdapter.sendMessage not yet implemented (Phase 5)");
  }

  async resolveUser(_platformUserId: string): Promise<PlatformUser | null> {
    // TODO Phase 5: Resolve via Microsoft Graph API
    return null;
  }

  async sendTypingIndicator(_channelId: string): Promise<void> {
    // TODO Phase 5: Send typing activity via Bot Framework
  }
}
