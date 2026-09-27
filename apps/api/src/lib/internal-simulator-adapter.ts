import type {
  ChatAdapter,
  InboundMessage,
  OutboundMessage,
  PlatformUser,
  WebhookVerification,
} from "@revualy/chat-core";
import type { ChatPlatform } from "@revualy/shared";

/**
 * InternalSimulatorAdapter, an in-process ChatAdapter for the "internal"
 * platform used by the local chat-simulation harness (see modules/dev/routes).
 *
 * Instead of calling out to a real chat platform, `sendMessage` records the
 * bot's outbound text into a per-channel buffer that the simulate endpoint
 * drains and returns in its HTTP response. This lets `claude -p` (or curl)
 * drive a full feedback conversation locally with no Slack/Teams/GChat setup.
 */
export class InternalSimulatorAdapter implements ChatAdapter {
  readonly platform: ChatPlatform = "internal";

  /** channelId -> outbound texts sent since the buffer was last drained. */
  private buffers = new Map<string, string[]>();

  /** Drain (and clear) everything the bot sent on this channel. */
  drain(channelId: string): string[] {
    const msgs = this.buffers.get(channelId) ?? [];
    this.buffers.set(channelId, []);
    return msgs;
  }

  clear(channelId: string): void {
    this.buffers.set(channelId, []);
  }

  async verifyWebhook(): Promise<WebhookVerification> {
    return { isValid: true };
  }

  async normalizeInbound(): Promise<InboundMessage | null> {
    // Inbound is injected directly by the simulate endpoint, not via webhook.
    return null;
  }

  async sendMessage(message: OutboundMessage): Promise<string> {
    const list = this.buffers.get(message.channelId) ?? [];
    list.push(message.text);
    this.buffers.set(message.channelId, list);
    return `sim-${list.length}-${Date.now()}`;
  }

  async resolveUser(platformUserId: string): Promise<PlatformUser | null> {
    return { platformUserId, displayName: platformUserId };
  }

  async sendTypingIndicator(): Promise<void> {
    // no-op
  }
}
