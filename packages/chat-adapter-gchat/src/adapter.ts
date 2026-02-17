import type {
  ChatAdapter,
  InboundMessage,
  OutboundMessage,
  WebhookVerification,
  PlatformUser,
  MessageBlock,
} from "@revualy/chat-core";
import type { ChatPlatform } from "@revualy/shared";
import { google, type chat_v1 } from "googleapis";
import crypto from "node:crypto";

export interface GoogleChatAdapterConfig {
  /** Service account key JSON string (for Google API auth) */
  serviceAccountKeyJson: string;
  /** Google Cloud project ID */
  projectId: string;
  /** Verification token from Google Chat API configuration (shared secret) */
  verificationToken: string;
}

/**
 * Google Chat adapter — Phase 4 implementation.
 * Uses Google Chat API for messaging, verification token for webhook auth.
 */
export class GoogleChatAdapter implements ChatAdapter {
  readonly platform: ChatPlatform = "google_chat";
  private projectId: string;
  private verificationToken: string;
  private chatClient: chat_v1.Chat;

  constructor(config: GoogleChatAdapterConfig) {
    this.projectId = config.projectId;
    this.verificationToken = config.verificationToken;

    // Initialize Google Chat API client with service account credentials
    const credentials = JSON.parse(config.serviceAccountKeyJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/chat.bot"],
    });
    this.chatClient = google.chat({ version: "v1", auth });
  }

  async verifyWebhook(
    headers: Record<string, string>,
    body: unknown,
  ): Promise<WebhookVerification> {
    // Google Chat sends a verification token in the request body or as a bearer token.
    // We verify using a shared verification token (configured in Google Chat API console)
    // rather than JWT to avoid credential-lifting risks.
    const payload = body as Record<string, unknown>;

    // Check bearer token in Authorization header
    const authHeader = headers["authorization"] ?? headers["Authorization"];
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      if (
        token.length > 0 &&
        crypto.timingSafeEqual(
          Buffer.from(token),
          Buffer.from(this.verificationToken),
        )
      ) {
        return { isValid: true };
      }
    }

    // Also check token field in body (some Google Chat configurations)
    if (payload.token) {
      const bodyToken = String(payload.token);
      if (
        bodyToken.length === this.verificationToken.length &&
        crypto.timingSafeEqual(
          Buffer.from(bodyToken),
          Buffer.from(this.verificationToken),
        )
      ) {
        return { isValid: true };
      }
    }

    return { isValid: false };
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
        ((message.thread as Record<string, unknown>)?.name as string) ?? null,
      timestamp: new Date(message.createTime as string),
      rawPayload,
    };
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
          cardId: `card-${Date.now()}`,
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

    const response = await this.chatClient.spaces.messages.create(requestBody);
    return response.data.name ?? "";
  }

  async resolveUser(platformUserId: string): Promise<PlatformUser | null> {
    try {
      // platformUserId is in the format "users/{userId}"
      const response = await this.chatClient.spaces.members.get({
        name: platformUserId,
      });

      const member = response.data.member;
      if (!member) return null;

      return {
        platformUserId,
        displayName: member.displayName ?? "Unknown",
        email: member.domainId ?? undefined,
      };
    } catch {
      // User not found or API error — return null gracefully
      return null;
    }
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
