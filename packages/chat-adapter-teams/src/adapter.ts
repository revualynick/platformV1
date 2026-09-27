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
import { createRemoteJWKSet, jwtVerify } from "jose";
import crypto from "node:crypto";
import { buildAdaptiveCard } from "./cards.js";

/**
 * Injectable async key-value store for conversation references and user cache.
 * Default implementation is in-memory. Inject a Redis-backed implementation
 * (e.g. using ioredis SETEX/GET) at the app layer to survive process restarts.
 * TODO: wire a Redis-backed AsyncStore in apps/api when creating TeamsAdapter.
 */
export interface AsyncStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/**
 * The default store: in memory, honouring each entry's TTL and capped, so it
 * can't grow for the life of the process (review finding 2026-09-28).
 * Oldest entries go first when full (Map keeps insertion order).
 */
class InMemoryStore implements AsyncStore {
  private data = new Map<string, { value: string; expiresAt: number }>();
  constructor(private readonly maxEntries = 10_000) {}
  async get(key: string): Promise<string | null> {
    const hit = this.data.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      this.data.delete(key);
      return null;
    }
    return hit.value;
  }
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.data.delete(key);
    this.data.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    while (this.data.size > this.maxEntries) {
      const oldest = this.data.keys().next().value;
      if (oldest === undefined) break;
      this.data.delete(oldest);
    }
  }
}

export interface TeamsAdapterConfig {
  appId: string;
  appPassword: string;
  /** Optional persistent store for conversation refs + user cache (survives restart). */
  store?: AsyncStore;
}

const ALLOWED_SERVICE_URLS = [
  "https://smba.trafficmanager.net/",
  "https://smba.infra.gcc.teams.microsoft.com/",
  "https://smba.trafficmanager.net/teams/",
  "https://api.botframework.com/",
] as const;

const BOT_FRAMEWORK_TOKEN_URL =
  "https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token";

const BOT_FRAMEWORK_OPENID_METADATA =
  "https://login.botframework.com/v1/.well-known/openidconfiguration";

const EXPECTED_ISSUER = "https://api.botframework.com";

const MAX_USER_CACHE_SIZE = 10_000;
const MAX_CONVERSATION_REFS_SIZE = 10_000;

/**
 * Microsoft Teams adapter.
 * Uses Bot Framework REST API + Adaptive Cards for messaging.
 */
// TTL for conversation references in the persistent store (30 days).
const CONV_REF_TTL_SECONDS = 30 * 24 * 60 * 60;
// TTL for user cache entries in the persistent store (7 days).
const USER_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

export class TeamsAdapter implements ChatAdapter {
  readonly platform: ChatPlatform = "teams";
  private appId: string;
  private appPassword: string;
  private userCache = new Map<string, { name: string; email?: string }>();
  private conversationRefs = new Map<string, ConversationReference>();
  private store: AsyncStore;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(config: TeamsAdapterConfig) {
    this.appId = config.appId;
    this.appPassword = config.appPassword;
    this.store = config.store ?? new InMemoryStore();
  }

  async verifyWebhook(
    headers: Record<string, string>,
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

    const authHeader = headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const env = process.env.NODE_ENV;
      if (process.env.TEAMS_SKIP_JWT_VERIFY === "true" && (env === "development" || env === "test")) {
        console.warn(
          "TeamsAdapter.verifyWebhook: no Authorization header — skipping JWT verification (TEAMS_SKIP_JWT_VERIFY=true)",
        );
        return { isValid: true };
      }
      return { isValid: false };
    }

    const token = authHeader.slice("Bearer ".length);
    const jwtValid = await this.verifyBotFrameworkJwt(token);
    if (!jwtValid) {
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
      isDirectMessage: activity.conversation.conversationType === "personal",
      rawPayload,
    };
  }

  async sendMessage(message: OutboundMessage): Promise<string> {
    let ref = this.conversationRefs.get(message.channelId);
    if (!ref) {
      // Hydrate from persistent store (survives process restart).
      const stored = await this.store.get(
        `teams:convref:${message.channelId}`,
      );
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as ConversationReference;
          // Validate minimum required fields before trusting the cached value.
          // A schema-drifted or corrupt entry with missing serviceUrl/conversation
          // would cause serviceUrl.replace(...) to throw in sendMessage.
          // The bot's bearer token goes to serviceUrl, so a stored ref must
          // pass the same allowlist as an inbound one (review finding 2026-09-28).
          if (
            parsed &&
            typeof parsed.serviceUrl === "string" &&
            parsed.serviceUrl &&
            parsed.conversation &&
            ALLOWED_SERVICE_URLS.some((u) => parsed.serviceUrl.startsWith(u))
          ) {
            ref = parsed;
            this.conversationRefs.set(message.channelId, ref);
          }
        } catch {
          // corrupt entry, fall through to throw below
        }
      }
    }
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

    // Attempt hydration from persistent store.
    const stored = await this.store.get(`teams:user:${platformUserId}`);
    if (stored) {
      try {
        const entry = JSON.parse(stored) as { name: string; email?: string };
        // Validate minimum required field before using the cached value.
        if (entry && typeof entry.name === "string" && entry.name) {
          this.userCache.set(platformUserId, entry);
          return { platformUserId, displayName: entry.name, email: entry.email };
        }
      } catch {
        // corrupt entry, fall through
      }
    }

    // Graceful fallback: return a minimal PlatformUser so resolution never
    // hard-fails callers. A real display name arrives via the next inbound
    // message from this user (cacheUserFromActivity) and will be persisted.
    return { platformUserId, displayName: platformUserId, email: undefined };
  }

  async sendTypingIndicator(_channelId: string): Promise<void> {
    // Teams supports typing indicators via Bot Framework, but for simplicity
    // this is a no-op (consistent with other adapter implementations).
  }

  private evictIfNeeded(map: Map<string, unknown>, maxSize: number, label: string): void {
    while (map.size > maxSize) {
      const firstKey = map.keys().next().value;
      if (firstKey === undefined) break;
      console.warn(`[Teams] Evicting ${label} cache entry: ${firstKey}`);
      map.delete(firstKey);
    }
  }

  private cacheUserFromActivity(activity: Partial<Activity>): void {
    if (activity.from?.id && activity.from?.name) {
      const entry = { name: activity.from.name };
      this.userCache.set(activity.from.id, entry);
      this.evictIfNeeded(
        this.userCache as Map<string, unknown>,
        MAX_USER_CACHE_SIZE,
        "user",
      );
      // Persist so user names survive process restart.
      this.store
        .set(
          `teams:user:${activity.from.id}`,
          JSON.stringify(entry),
          USER_CACHE_TTL_SECONDS,
        )
        .catch((err) =>
          console.warn("[Teams] Failed to persist user cache:", err),
        );
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
    this.evictIfNeeded(
      this.conversationRefs as Map<string, unknown>,
      MAX_CONVERSATION_REFS_SIZE,
      "conversation",
    );
    // Persist so active conversations survive process restart.
    this.store
      .set(
        `teams:convref:${activity.conversation.id}`,
        JSON.stringify(ref),
        CONV_REF_TTL_SECONDS,
      )
      .catch((err) =>
        console.warn("[Teams] Failed to persist conversation ref:", err),
      );
  }

  private async getJwks(): Promise<ReturnType<typeof createRemoteJWKSet>> {
    if (this.jwks) return this.jwks;
    const metadataRes = await fetch(BOT_FRAMEWORK_OPENID_METADATA);
    if (!metadataRes.ok) {
      throw new Error(
        `Failed to fetch Bot Framework OpenID metadata: ${metadataRes.status}`,
      );
    }
    const metadata = (await metadataRes.json()) as { jwks_uri: string };
    if (!metadata.jwks_uri) {
      throw new Error("Bot Framework OpenID metadata missing jwks_uri");
    }
    this.jwks = createRemoteJWKSet(new URL(metadata.jwks_uri));
    return this.jwks;
  }

  private async verifyBotFrameworkJwt(token: string): Promise<boolean> {
    try {
      const jwks = await this.getJwks();
      await jwtVerify(token, jwks, {
        issuer: EXPECTED_ISSUER,
        audience: this.appId,
      });
      return true;
    } catch (err) {
      console.warn(
        "TeamsAdapter: JWT verification failed:",
        err instanceof Error ? err.message : err,
      );
      return false;
    }
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
