import type {
  ChatAdapter,
  InboundMessage,
  OutboundMessage,
  WebhookVerification,
  PlatformUser,
} from "@revualy/chat-core";
import { retryAsync } from "@revualy/chat-core";
import type { ChatPlatform } from "@revualy/shared";
import type { Activity, ConversationReference } from "botbuilder";
import crypto from "node:crypto";
import { buildAdaptiveCard } from "./cards.js";

export interface TeamsAdapterConfig {
  appId: string;
  appPassword: string;
}

const ALLOWED_SERVICE_URLS = [
  "https://smba.trafficmanager.net/",
  "https://smba.infra.gcc.teams.microsoft.com/",
  "https://smba.trafficmanager.net/teams/",
  "https://api.botframework.com/",
] as const;

const BOT_FRAMEWORK_TOKEN_URL =
  "https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token";

/**
 * Microsoft Teams adapter.
 * Uses Bot Framework REST API + Adaptive Cards for messaging.
 */
export class TeamsAdapter implements ChatAdapter {
  readonly platform: ChatPlatform = "teams";
  private appId: string;
  private appPassword: string;
  private userCache = new Map<string, { name: string; email?: string }>();
  private conversationRefs = new Map<string, ConversationReference>();
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: TeamsAdapterConfig) {
    this.appId = config.appId;
    this.appPassword = config.appPassword;
  }

  async verifyWebhook(
    _headers: Record<string, string>,
    body: unknown,
  ): Promise<WebhookVerification> {
    const activity = body as Partial<Activity>;

    if (!activity || typeof activity !== "object") {
      return { isValid: false };
    }

    if (!activity.type || !activity.channelId || !activity.serviceUrl) {
      return { isValid: false };
    }

    if (activity.channelId !== "msteams") {
      return { isValid: false };
    }

    const serviceUrl = activity.serviceUrl;
    const isKnownService = ALLOWED_SERVICE_URLS.some((url) =>
      serviceUrl.startsWith(url),
    );
    if (!isKnownService) {
      return { isValid: false };
    }

    if (!activity.from || !activity.conversation) {
      return { isValid: false };
    }

    return { isValid: true };
  }

  async normalizeInbound(rawPayload: unknown): Promise<InboundMessage | null> {
    const activity = rawPayload as Partial<Activity>;

    if (activity.type !== "message") {
      return null;
    }

    if (!activity.from || !activity.conversation) {
      return null;
    }

    if (activity.from.role === "bot") {
      return null;
    }

    this.cacheUserFromActivity(activity);
    this.cacheConversationRef(activity);

    let text = activity.text ?? "";
    text = stripBotMentions(text, activity.recipient?.id);

    return {
      id: crypto.randomUUID(),
      platform: "teams",
      platformMessageId: activity.id ?? crypto.randomUUID(),
      platformChannelId: activity.conversation.id,
      platformUserId: activity.from.id,
      text,
      threadId: activity.conversation.id,
      timestamp: activity.timestamp
        ? new Date(activity.timestamp as unknown as string)
        : new Date(),
      rawPayload,
    };
  }

  async sendMessage(message: OutboundMessage): Promise<string> {
    const ref = this.conversationRefs.get(message.channelId);
    if (!ref) {
      throw new Error(
        `TeamsAdapter.sendMessage: no conversation reference for channel ${message.channelId}`,
      );
    }

    const outActivity: Partial<Activity> = {
      type: "message",
      text: message.text,
      conversation: ref.conversation,
      from: ref.bot,
      recipient: ref.user,
      serviceUrl: ref.serviceUrl,
      channelId: "msteams",
    };

    if (message.blocks && message.blocks.length > 0) {
      const card = buildAdaptiveCard(message.blocks);
      outActivity.attachments = [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: card,
        },
      ];
    }

    const conversationId =
      message.threadId ?? message.channelId;
    const serviceUrl = ref.serviceUrl.replace(/\/$/, "");
    const url = `${serviceUrl}/v3/conversations/${encodeURIComponent(conversationId)}/activities`;

    const token = await this.getAccessToken();

    const response = await retryAsync(async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(outActivity),
      });
      if (!res.ok) {
        const errorBody = await res.text();
        const err = new Error(
          `Teams API error ${res.status}: ${errorBody}`,
        ) as Error & { statusCode?: number };
        err.statusCode = res.status;
        throw err;
      }
      return res.json() as Promise<{ id?: string }>;
    });

    if (!response.id) {
      throw new Error("Teams sendMessage: no activity ID returned");
    }
    return response.id;
  }

  async resolveUser(platformUserId: string): Promise<PlatformUser | null> {
    const cached = this.userCache.get(platformUserId);
    if (cached) {
      return {
        platformUserId,
        displayName: cached.name,
        email: cached.email,
      };
    }
    return null;
  }

  async sendTypingIndicator(_channelId: string): Promise<void> {
    // Teams supports typing indicators via Bot Framework, but for simplicity
    // this is a no-op (consistent with other adapter implementations).
  }

  private cacheUserFromActivity(activity: Partial<Activity>): void {
    if (activity.from?.id && activity.from?.name) {
      this.userCache.set(activity.from.id, {
        name: activity.from.name,
      });
    }
  }

  private cacheConversationRef(activity: Partial<Activity>): void {
    if (!activity.conversation?.id) return;

    const ref: ConversationReference = {
      channelId: activity.channelId ?? "msteams",
      serviceUrl: activity.serviceUrl ?? "",
      conversation: activity.conversation!,
      bot: activity.recipient ?? { id: this.appId, name: "Revualy" },
      user: activity.from,
    };
    this.conversationRefs.set(activity.conversation.id, ref);
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const params = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.appId,
      client_secret: this.appPassword,
      scope: "https://api.botframework.com/.default",
    });

    const res = await fetch(BOT_FRAMEWORK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      throw new Error(`Failed to obtain Bot Framework access token: ${res.status}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };

    this.accessToken = data.access_token;
    // Refresh 60s before expiry
    this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;

    return this.accessToken;
  }
}

/**
 * Strip bot @mentions from message text.
 * Teams wraps mentions as `<at>BotName</at>` in the text body.
 */
function stripBotMentions(text: string, botId?: string): string {
  let cleaned = text.replace(/<at>[^<]*<\/at>\s*/g, "");
  if (botId) {
    cleaned = cleaned.replace(new RegExp(`@${escapeRegex(botId)}\\s*`, "g"), "");
  }
  return cleaned.trim();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
