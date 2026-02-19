import type {
  ChatAdapter,
  InboundMessage,
  OutboundMessage,
  WebhookVerification,
  PlatformUser,
} from "@revualy/chat-core";
import { retryAsync } from "@revualy/chat-core";
import type { ChatPlatform } from "@revualy/shared";
import { WebClient } from "@slack/web-api";
import crypto from "node:crypto";
import { slackBlockBuilder } from "./blocks.js";

export interface SlackAdapterConfig {
  botToken: string;
  signingSecret: string;
  appToken?: string;
}

export class SlackAdapter implements ChatAdapter {
  readonly platform: ChatPlatform = "slack";
  private client: WebClient;
  private signingSecret: string;

  constructor(config: SlackAdapterConfig) {
    this.client = new WebClient(config.botToken);
    this.signingSecret = config.signingSecret;
  }

  async verifyWebhook(
    headers: Record<string, string>,
    body: unknown,
  ): Promise<WebhookVerification> {
    const timestamp = headers["x-slack-request-timestamp"];
    const signature = headers["x-slack-signature"];

    if (!timestamp || !signature) {
      return { isValid: false };
    }

    // Reject requests older than 5 minutes (replay protection)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
      return { isValid: false };
    }

    const bodyStr =
      typeof body === "string" ? body : JSON.stringify(body);
    const sigBasestring = `v0:${timestamp}:${bodyStr}`;
    const hmac = crypto.createHmac("sha256", this.signingSecret);
    hmac.update(sigBasestring);
    const mySignature = `v0=${hmac.digest("hex")}`;

    const myBuf = Buffer.from(mySignature);
    const sigBuf = Buffer.from(signature);

    // timingSafeEqual throws if buffer lengths differ — check first
    if (myBuf.byteLength !== sigBuf.byteLength) {
      return { isValid: false };
    }

    const isValid = crypto.timingSafeEqual(myBuf, sigBuf);

    // Handle URL verification challenge
    let parsed: unknown;
    try {
      parsed = typeof body === "string" ? JSON.parse(body) : body;
    } catch {
      return { isValid: false };
    }
    if (
      isValid &&
      parsed &&
      typeof parsed === "object" &&
      "type" in parsed &&
      (parsed as Record<string, unknown>).type === "url_verification"
    ) {
      return {
        isValid: true,
        challenge: (parsed as Record<string, string>).challenge,
      };
    }

    return { isValid };
  }

  async normalizeInbound(rawPayload: unknown): Promise<InboundMessage | null> {
    const payload = rawPayload as Record<string, unknown>;

    // Handle event callbacks
    if (payload.type !== "event_callback") {
      return null;
    }

    const event = payload.event as Record<string, unknown>;
    if (!event || event.type !== "message" || event.subtype || !event.user) {
      return null; // Ignore non-message events, message edits/deletes, and bot messages
    }

    return {
      id: crypto.randomUUID(),
      platform: "slack",
      platformMessageId: event.ts as string,
      platformChannelId: event.channel as string,
      platformUserId: event.user as string,
      text: (event.text as string) ?? "",
      threadId: (event.thread_ts as string) ?? null,
      timestamp: new Date(parseFloat(event.ts as string) * 1000),
      rawPayload,
    };
  }

  async sendMessage(message: OutboundMessage): Promise<string> {
    const blocks = message.blocks
      ? slackBlockBuilder.toSlackBlocks(message.blocks)
      : undefined;

    const result = await retryAsync(() =>
      this.client.chat.postMessage({
        channel: message.channelId,
        text: message.text,
        blocks,
        thread_ts: message.threadId,
      }),
    );

    if (!result.ts) {
      throw new Error("Slack sendMessage: no message timestamp returned");
    }
    return result.ts;
  }

  async resolveUser(platformUserId: string): Promise<PlatformUser | null> {
    try {
      const result = await this.client.users.info({ user: platformUserId });
      if (!result.user) return null;
      return {
        platformUserId,
        displayName:
          result.user.real_name ?? result.user.name ?? platformUserId,
        email: result.user.profile?.email,
      };
    } catch {
      return null;
    }
  }

  async sendTypingIndicator(_channelId: string): Promise<void> {
    // Slack doesn't have a direct typing indicator API for bots
    // This is a no-op — could use emoji reactions as a visual cue instead
  }
}
