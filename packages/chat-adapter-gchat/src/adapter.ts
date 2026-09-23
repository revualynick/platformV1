import type {
  ChatAdapter,
  ChatEvent,
  InboundMessage,
  OutboundMessage,
  WebhookVerification,
  PlatformUser,
  MessageBlock,
} from "@revualy/chat-core";
import { retryAsync } from "@revualy/chat-core";
import type { ChatPlatform } from "@revualy/shared";
import { google, type chat_v1 } from "googleapis";
import type { JWTVerifyGetKey } from "jose";
import crypto from "node:crypto";
import { createChatTokenVerifier, type ChatTokenVerifier } from "./verify.js";

/** The slice of the Google Chat API client this adapter uses (injectable for tests). */
export interface GoogleChatClient {
  spaces: {
    messages: {
      create(
        params: chat_v1.Params$Resource$Spaces$Messages$Create,
      ): Promise<{ data: chat_v1.Schema$Message }>;
    };
    findDirectMessage(
      params: chat_v1.Params$Resource$Spaces$Finddirectmessage,
    ): Promise<{ data: chat_v1.Schema$Space }>;
  };
}

export interface GoogleChatAdapterConfig {
  /** Service account key JSON string (for Google API auth). */
  serviceAccountKeyJson?: string;
  /** Google Cloud project ID. */
  projectId: string;
  /**
   * The Chat API "Authentication audience": the project number, or the
   * https endpoint URL. Required; see verify.ts.
   */
  audience: string;
  /**
   * Deprecated shared verification token. Only honoured when
   * allowLegacyToken is true (explicit opt-in for old app configs).
   */
  verificationToken?: string;
  allowLegacyToken?: boolean;
  /** Tests: sign events with a local key instead of Google's. */
  keyResolver?: JWTVerifyGetKey;
  /** Tests: capture outbound calls instead of calling Google. */
  chatClient?: GoogleChatClient;
}

const REPLAY_WINDOW_MS = 5 * 60 * 1000;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined =>
  v && typeof v === "object" ? (v as Obj) : undefined;
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

/**
 * Google Chat adapter (HTTP endpoint, Chat API event format).
 *
 * Webhooks are authenticated by verifying Google's signed bearer token.
 * Lifecycle events (bot added to or removed from a DM) are surfaced through
 * normalizeEvent so identity and reachability stay current.
 */
export class GoogleChatAdapter implements ChatAdapter {
  readonly platform: ChatPlatform = "google_chat";
  private projectId: string;
  private verifier: ChatTokenVerifier;
  private legacyToken: string | null;
  private chatClient: GoogleChatClient;

  constructor(config: GoogleChatAdapterConfig) {
    this.projectId = config.projectId;
    this.verifier = createChatTokenVerifier({
      audience: config.audience,
      keyResolver: config.keyResolver,
    });
    this.legacyToken =
      config.allowLegacyToken && config.verificationToken ? config.verificationToken : null;

    if (config.chatClient) {
      this.chatClient = config.chatClient;
      return;
    }
    if (!config.serviceAccountKeyJson) {
      throw new Error("GoogleChatAdapter: serviceAccountKeyJson is required");
    }
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(config.serviceAccountKeyJson);
    } catch (err) {
      throw new Error(`Invalid service account key JSON: ${err instanceof Error ? err.message : "parse error"}`);
    }
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/chat.bot"],
    });
    this.chatClient = google.chat({ version: "v1", auth }) as unknown as GoogleChatClient;
  }

  async verifyWebhook(
    headers: Record<string, string>,
    body: unknown,
  ): Promise<WebhookVerification> {
    const payload = obj(body) ?? {};
    if (!this.isEventTimestampValid(payload)) return { isValid: false };

    const authHeader = headers["authorization"] ?? headers["Authorization"];
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    const result = await this.verifier.verify(bearer);
    if (result.ok) return { isValid: true };

    // Deprecated shared-token scheme, only when explicitly enabled.
    if (this.legacyToken && typeof payload.token === "string") {
      return { isValid: this.timingSafeTokenCompare(payload.token, this.legacyToken) };
    }
    return { isValid: false };
  }

  private timingSafeTokenCompare(a: string, b: string): boolean {
    const hashA = crypto.createHash("sha256").update(a).digest();
    const hashB = crypto.createHash("sha256").update(b).digest();
    return crypto.timingSafeEqual(hashA, hashB);
  }

  private isEventTimestampValid(payload: Obj): boolean {
    const eventTime = payload.eventTime;
    // Some event types omit eventTime; the signed token (which expires)
    // still bounds replay. A present but unparseable value is rejected.
    if (eventTime === undefined) return true;
    const eventMs = typeof eventTime === "string" ? new Date(eventTime).getTime() : NaN;
    if (Number.isNaN(eventMs)) return false;
    return Math.abs(Date.now() - eventMs) <= REPLAY_WINDOW_MS;
  }

  /**
   * Classify a verified event. Workspace add-on payloads (nested under
   * `chat`) are not supported yet: their token details are unconfirmed, so
   * they are dropped with a log rather than trusted.
   */
  async normalizeEvent(rawPayload: unknown): Promise<ChatEvent | null> {
    const payload = obj(rawPayload);
    if (!payload) return null;
    if (payload.type === undefined && obj(payload.chat)) {
      console.warn(
        "[GoogleChat] Received a Workspace add-on event; only the Chat API event format is supported. Check the app's configuration.",
      );
      return null;
    }

    const user = obj(payload.user);
    const space = obj(payload.space);
    const platformUserId = str(user?.name);
    const spaceName = str(space?.name);

    switch (payload.type) {
      case "MESSAGE": {
        const message = await this.normalizeInbound(payload);
        return message ? { kind: "message", message } : null;
      }
      case "ADDED_TO_SPACE":
        if (!platformUserId || !spaceName || !isDm(space) || isBot(user)) return null;
        return {
          kind: "installed",
          platform: "google_chat",
          platformUserId,
          email: str(user?.email),
          displayName: str(user?.displayName),
          dmAddress: spaceName,
        };
      case "REMOVED_FROM_SPACE":
        if (!platformUserId || !spaceName || !isDm(space)) return null;
        return { kind: "uninstalled", platform: "google_chat", platformUserId, dmAddress: spaceName };
      default:
        return null;
    }
  }

  async normalizeInbound(rawPayload: unknown): Promise<InboundMessage | null> {
    const payload = obj(rawPayload);
    if (!payload || payload.type !== "MESSAGE") return null;

    const message = obj(payload.message);
    const sender = obj(message?.sender) ?? obj(payload.user);
    const space = obj(payload.space) ?? obj(message?.space);
    const messageName = str(message?.name);
    const senderName = str(sender?.name);
    const spaceName = str(space?.name);
    if (!message || !messageName || !senderName || !spaceName) return null;

    // Never process messages from bots (including our own).
    if (isBot(sender)) return null;

    // argumentText drops a leading @mention in rooms; in DMs it equals text.
    const text = (str(message.argumentText) ?? str(message.text) ?? "").trim();
    const created = str(message.createTime) ?? str(payload.eventTime);

    return {
      id: crypto.randomUUID(),
      platform: "google_chat",
      platformMessageId: messageName,
      platformChannelId: spaceName,
      platformUserId: senderName,
      text,
      threadId: str(obj(message.thread)?.name) ?? null,
      timestamp: created ? new Date(created) : new Date(),
      rawPayload,
      sender: { email: str(sender?.email), displayName: str(sender?.displayName) },
      isDirectMessage: isDm(space),
    };
  }

  /**
   * DM space between the bot and a user, for proactive messages. With app
   * authentication Google requires the numeric id form (users/123), not an
   * email alias. Returns null when no DM exists (404).
   */
  async findDirectMessage(platformUserRef: string): Promise<string | null> {
    try {
      const res = await this.chatClient.spaces.findDirectMessage({ name: platformUserRef });
      return res.data.name ?? null;
    } catch (err) {
      const status = (err as { code?: number; status?: number }).code ??
        (err as { status?: number }).status;
      if (status === 404) return null;
      throw err;
    }
  }

  async sendMessage(message: OutboundMessage): Promise<string> {
    // Build Google Chat message from OutboundMessage
    const chatMessage: chat_v1.Schema$Message = {
      text: message.text,
    };

    // Convert blocks to Google Chat cards if present
    if (message.blocks && message.blocks.length > 0) {
      chatMessage.cardsV2 = [
        {
          cardId: crypto.randomUUID(),
          card: this.buildCard(message.blocks),
        },
      ];
    }

    const requestBody: chat_v1.Params$Resource$Spaces$Messages$Create = {
      parent: message.channelId, // spaces/{spaceId}
      requestBody: chatMessage,
    };

    // Thread reply if threadId is provided
    if (message.threadId) {
      requestBody.requestBody!.thread = {
        name: message.threadId,
      };
      requestBody.messageReplyOption = "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD";
    }

    const response = await retryAsync(() =>
      this.chatClient.spaces.messages.create(requestBody),
    );
    if (!response.data.name) {
      throw new Error("Google Chat sendMessage: no message name returned");
    }
    return response.data.name;
  }

  async resolveUser(platformUserId: string): Promise<PlatformUser | null> {
    // TODO: call the Google Directory/People API to resolve a real display name
    // and email from the "users/{userId}" resource path. This requires a Google
    // Workspace admin granting the service account domain-wide delegation with
    // the `https://www.googleapis.com/auth/directory.readonly` scope — a known
    // gap documented in CLAUDE.md ("GChat adapter: needs Google Workspace admin
    // setup to test end-to-end"). Until that is wired, strip the resource prefix
    // to produce a cleaner fallback rather than returning the raw path.
    return {
      platformUserId,
      displayName: platformUserId.replace(/^users\//, ""),
      email: undefined,
    };
  }

  async sendTypingIndicator(_channelId: string): Promise<void> {
    // Google Chat doesn't support typing indicators for bots
  }

  /**
   * Convert canonical MessageBlocks to a Google Chat Card.
   */
  private buildCard(blocks: MessageBlock[]): chat_v1.Schema$GoogleAppsCardV1Card {
    const sections: chat_v1.Schema$GoogleAppsCardV1Section[] = [];
    let currentWidgets: chat_v1.Schema$GoogleAppsCardV1Widget[] = [];

    for (const block of blocks) {
      switch (block.type) {
        case "text":
          currentWidgets.push({
            textParagraph: { text: block.text },
          });
          break;
        case "section":
          currentWidgets.push({
            textParagraph: { text: block.text },
          });
          if (block.accessory) {
            currentWidgets.push({
              buttonList: {
                buttons: [
                  {
                    text: block.accessory.text,
                    onClick: {
                      action: {
                        function: block.accessory.actionId,
                        parameters: block.accessory.value
                          ? [{ key: "value", value: block.accessory.value }]
                          : [],
                      },
                    },
                  },
                ],
              },
            });
          }
          break;
        case "actions":
          currentWidgets.push({
            buttonList: {
              buttons: block.elements.map((btn) => ({
                text: btn.text,
                onClick: {
                  action: {
                    function: btn.actionId,
                    parameters: btn.value
                      ? [{ key: "value", value: btn.value }]
                      : [],
                  },
                },
                ...(btn.style === "primary" ? { color: { red: 0.13, green: 0.55, blue: 0.13 } } : {}),
                ...(btn.style === "danger" ? { color: { red: 0.86, green: 0.2, blue: 0.2 } } : {}),
              })),
            },
          });
          break;
        case "divider":
          // Flush current widgets into a section, start new one
          if (currentWidgets.length > 0) {
            sections.push({ widgets: currentWidgets });
            currentWidgets = [];
          }
          sections.push({ widgets: [{ divider: {} }] });
          break;
      }
    }

    // Flush remaining widgets
    if (currentWidgets.length > 0) {
      sections.push({ widgets: currentWidgets });
    }

    return { sections };
  }
}

function isDm(space: Obj | undefined): boolean {
  if (!space) return false;
  return (
    space.spaceType === "DIRECT_MESSAGE" ||
    space.type === "DM" ||
    space.singleUserBotDm === true
  );
}

function isBot(user: Obj | undefined): boolean {
  return user?.type === "BOT";
}
