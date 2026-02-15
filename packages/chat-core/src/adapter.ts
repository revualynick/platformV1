import type {
  InboundMessage,
  OutboundMessage,
  WebhookVerification,
  PlatformUser,
  AdapterConfig,
} from "./types.js";
import type { ChatPlatform } from "@revualy/shared";

/**
 * ChatAdapter — the core abstraction for platform agnosticism.
 *
 * Each chat platform (Slack, Google Chat, Teams) implements this interface.
 * Adding a new platform = implement these 5 methods. Zero changes to core logic.
 */
export interface ChatAdapter {
  readonly platform: ChatPlatform;

  /**
   * Verify an incoming webhook request (signature validation).
   * Returns verification result and optional challenge response.
   */
  verifyWebhook(
    headers: Record<string, string>,
    body: unknown,
  ): Promise<WebhookVerification>;

  /**
   * Normalize a raw platform webhook payload into a canonical InboundMessage.
   */
  normalizeInbound(rawPayload: unknown): Promise<InboundMessage | null>;

  /**
   * Send a canonical OutboundMessage via the platform's API.
   * Returns the platform-specific message ID.
   */
  sendMessage(message: OutboundMessage): Promise<string>;

  /**
   * Resolve a platform user ID to a PlatformUser (name, email).
   */
  resolveUser(platformUserId: string): Promise<PlatformUser | null>;

  /**
   * Send a typing indicator / "processing" signal to the channel.
   */
  sendTypingIndicator(channelId: string): Promise<void>;
}

export interface ChatAdapterFactory {
  create(config: AdapterConfig): ChatAdapter;
}
