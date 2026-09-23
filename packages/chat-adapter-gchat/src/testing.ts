import { generateKeyPair, SignJWT, type JWTVerifyGetKey, type KeyLike } from "jose";
import type { chat_v1 } from "googleapis";
import type { GoogleChatClient } from "./adapter.js";
import { CHAT_ISSUER } from "./verify.js";

/**
 * Test harness for the Google Chat adapter: a local signer standing in for
 * Google's keys, builders for realistic Chat API events, and a fake Chat
 * client that records outbound calls. Import from
 * "@revualy/chat-adapter-gchat/testing" in tests only.
 */

export interface TestSigner {
  keyResolver: JWTVerifyGetKey;
  /** A token as Google would send it for this audience. */
  token(audience: string, overrides?: Record<string, unknown>, opts?: { expiresIn?: string; issuer?: string }): Promise<string>;
}

export async function createTestSigner(): Promise<TestSigner> {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  return {
    keyResolver: async () => publicKey as KeyLike,
    async token(audience, overrides = {}, opts = {}) {
      const projectNumber = /^\d+$/.test(audience);
      const claims = projectNumber
        ? { ...overrides }
        : { email: CHAT_ISSUER, email_verified: true, ...overrides };
      return new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: "test-key" })
        .setIssuer(opts.issuer ?? (projectNumber ? CHAT_ISSUER : "https://accounts.google.com"))
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime(opts.expiresIn ?? "5m")
        .sign(privateKey);
    },
  };
}

export interface TestUser {
  id: string;
  email?: string;
  displayName?: string;
  type?: "HUMAN" | "BOT";
}

const now = () => new Date().toISOString();
const chatUser = (u: TestUser) => ({
  name: `users/${u.id}`,
  displayName: u.displayName ?? `User ${u.id}`,
  ...(u.email ? { email: u.email } : {}),
  type: u.type ?? "HUMAN",
});
const dmSpace = (spaceId: string) => ({
  name: `spaces/${spaceId}`,
  type: "DM",
  spaceType: "DIRECT_MESSAGE",
  singleUserBotDm: true,
});

export const googleChatEvents = {
  addedToDm(user: TestUser, spaceId: string) {
    return { type: "ADDED_TO_SPACE", eventTime: now(), user: chatUser(user), space: dmSpace(spaceId) };
  },
  addedToRoom(user: TestUser, spaceId: string) {
    return {
      type: "ADDED_TO_SPACE",
      eventTime: now(),
      user: chatUser(user),
      space: { name: `spaces/${spaceId}`, type: "ROOM", spaceType: "SPACE" },
    };
  },
  removedFromDm(user: TestUser, spaceId: string) {
    return { type: "REMOVED_FROM_SPACE", eventTime: now(), user: chatUser(user), space: dmSpace(spaceId) };
  },
  message(user: TestUser, spaceId: string, text: string, messageId = `m${Math.random().toString(36).slice(2)}`) {
    const sender = chatUser(user);
    return {
      type: "MESSAGE",
      eventTime: now(),
      user: sender,
      space: dmSpace(spaceId),
      message: {
        name: `spaces/${spaceId}/messages/${messageId}`,
        sender,
        text,
        argumentText: text,
        thread: { name: `spaces/${spaceId}/threads/t-${messageId}` },
        createTime: now(),
      },
    };
  },
  /** Workspace add-on shaped payload (not supported; must be rejected). */
  addOnMessage(user: TestUser, spaceId: string, text: string) {
    return {
      commonEventObject: { hostApp: "CHAT" },
      chat: {
        messagePayload: {
          message: { name: `spaces/${spaceId}/messages/x`, sender: chatUser(user), text },
          space: dmSpace(spaceId),
        },
      },
    };
  },
};

export interface FakeChatClient extends GoogleChatClient {
  sent: chat_v1.Params$Resource$Spaces$Messages$Create[];
  /** users/{id} -> spaces/{id} for findDirectMessage. */
  dms: Map<string, string>;
}

export function createFakeChatClient(): FakeChatClient {
  const sent: chat_v1.Params$Resource$Spaces$Messages$Create[] = [];
  const dms = new Map<string, string>();
  return {
    sent,
    dms,
    spaces: {
      messages: {
        async create(params) {
          sent.push(params);
          return { data: { name: `${params.parent}/messages/sent-${sent.length}` } };
        },
      },
      async findDirectMessage(params) {
        const space = dms.get(params.name ?? "");
        if (!space) throw Object.assign(new Error("Not found"), { code: 404 });
        return { data: { name: space } };
      },
    },
  };
}
