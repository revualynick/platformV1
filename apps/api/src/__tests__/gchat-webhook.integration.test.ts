import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import crypto from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Queue } from "bullmq";
import { AdapterRegistry } from "@revualy/chat-core";
import { GoogleChatAdapter } from "@revualy/chat-adapter-gchat";
import {
  createTestSigner,
  createFakeChatClient,
  googleChatEvents as ev,
  type TestSigner,
  type FakeChatClient,
} from "@revualy/chat-adapter-gchat/testing";
import {
  getTenantDb,
  users,
  userPlatformIdentities,
  identityLinkEvents,
  authUsers,
  authAccounts,
} from "@revualy/db";
import { buildApp } from "../server.js";
import { setConversationQueue } from "../modules/chat/routes.js";
import { discoverGoogleChatDm, findIdentity } from "../lib/chat-identity.js";

/**
 * Google Chat end to end through the real webhook route and database:
 * events signed like Google's, posted to /webhooks/gchat/events.
 * Self-skips without a database.
 */

const PROJECT = "123456789012";
const db = getTenantDb(process.env.ORG_ID!, process.env.DATABASE_URL!);

async function dbReachable(): Promise<boolean> {
  const timeout = new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 3000));
  try {
    await Promise.race([db.execute(sql`select 1`), timeout]);
    return true;
  } catch {
    return false;
  }
}
const dbUp = await dbReachable();

describe.skipIf(!dbUp)("Google Chat webhook (integration)", () => {
  let app: FastifyInstance;
  let signer: TestSigner;
  let client: FakeChatClient;
  const enqueued: Array<Record<string, unknown>> = [];
  const tag = crypto.randomUUID().slice(0, 8);
  const numeric = () => String(Math.floor(Math.random() * 1e15));
  const aliceId = crypto.randomUUID();
  const bobId = crypto.randomUUID();
  const alice = { id: numeric(), email: `alice-${tag}@test.local`, displayName: "Alice Smith" };
  const bob = { id: numeric(), displayName: "Bob" }; // event without email
  const bobAuthId = crypto.randomUUID();

  async function post(body: unknown, signed = true) {
    return app.inject({
      method: "POST",
      url: "/webhooks/gchat/events",
      headers: signed ? { authorization: `Bearer ${await signer.token(PROJECT)}` } : {},
      payload: body as Record<string, unknown>,
    });
  }

  beforeAll(async () => {
    signer = await createTestSigner();
    client = createFakeChatClient();
    await db.insert(users).values([
      { id: aliceId, email: alice.email, name: "Alice Smith" },
      { id: bobId, email: `bob-${tag}@test.local`, name: "Bob" },
    ]);
    // Bob signed in with Google, so we know his Google account id.
    await db.insert(authUsers).values({ id: bobAuthId, email: `bob-${tag}@test.local`, tenantUserId: bobId });
    await db.insert(authAccounts).values({
      userId: bobAuthId,
      type: "oidc",
      provider: "google",
      providerAccountId: bob.id,
    });

    const adapters = new AdapterRegistry();
    adapters.register(
      new GoogleChatAdapter({ projectId: "acme", audience: PROJECT, keyResolver: signer.keyResolver, chatClient: client }),
    );
    app = await buildApp();
    app.decorate("adapters", adapters);
    await app.ready();
    setConversationQueue({ add: async (_n: string, data: Record<string, unknown>) => enqueued.push(data) } as unknown as Queue);
  });

  beforeEach(() => {
    enqueued.length = 0;
  });

  afterAll(async () => {
    await app?.close();
    const ids = [aliceId, bobId];
    await db.delete(authAccounts).where(eq(authAccounts.userId, bobAuthId));
    await db.delete(authUsers).where(eq(authUsers.id, bobAuthId));
    await db.delete(identityLinkEvents).where(inArray(identityLinkEvents.userId, ids));
    await db.delete(userPlatformIdentities).where(inArray(userPlatformIdentities.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  });

  it("rejects unsigned events", async () => {
    const res = await post(ev.addedToDm(alice, "alice-dm"), false);
    expect(res.statusCode).toBe(401);
  });

  it("links and welcomes someone who adds the app, making them reachable", async () => {
    const res = await post(ev.addedToDm(alice, "alice-dm"));
    expect(res.statusCode).toBe(200);
    expect(res.json().text).toMatch(/^Hi Alice, I'm Revualy/);
    const identity = await findIdentity(db, "google_chat", `users/${alice.id}`);
    expect(identity).toMatchObject({ userId: aliceId, status: "reachable", dmAddress: "spaces/alice-dm", linkSource: "auto" });
  });

  it("tells someone without a Revualy account how to get one", async () => {
    const stranger = { id: numeric(), email: `stranger-${tag}@test.local` };
    const res = await post(ev.addedToDm(stranger, "stranger-dm"));
    expect(res.statusCode).toBe(200);
    expect(res.json().text).toMatch(/couldn't find a Revualy account/);
    expect(await findIdentity(db, "google_chat", `users/${stranger.id}`)).toBeUndefined();
  });

  it("queues a DM reply from a linked user", async () => {
    const res = await post(ev.message(alice, "alice-dm", "Sam was great this week"));
    expect(res.statusCode).toBe(200);
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({
      platform: "google_chat",
      platformUserId: `users/${alice.id}`,
      platformChannelId: "spaces/alice-dm",
      userMessage: "Sam was great this week",
    });
  });

  it("links on first message by Google account id when the event has no email", async () => {
    const res = await post(ev.message(bob, "bob-dm", "hello"));
    expect(res.statusCode).toBe(200);
    const identity = await findIdentity(db, "google_chat", `users/${bob.id}`);
    expect(identity).toMatchObject({ userId: bobId, status: "reachable", dmAddress: "spaces/bob-dm" });
  });

  it("ignores bot messages and add-on payloads", async () => {
    expect((await post(ev.message({ id: "bot", type: "BOT" }, "alice-dm", "echo"))).statusCode).toBe(200);
    expect((await post(ev.addOnMessage(alice, "alice-dm", "hi"))).statusCode).toBe(200);
    expect(enqueued).toHaveLength(0);
  });

  it("marks someone unreachable when they remove the app", async () => {
    const res = await post(ev.removedFromDm(alice, "alice-dm"));
    expect(res.statusCode).toBe(200);
    expect(await findIdentity(db, "google_chat", `users/${alice.id}`)).toMatchObject({
      status: "linked",
      dmAddress: null,
    });
  });

  it("proactively discovers a DM pre-created by an admin install", async () => {
    await db.delete(userPlatformIdentities).where(eq(userPlatformIdentities.userId, bobId));
    client.dms.set(`users/${bob.id}`, "spaces/bob-admin-dm");
    const address = await discoverGoogleChatDm(db, bobId, (ref) =>
      new GoogleChatAdapter({ projectId: "acme", audience: PROJECT, chatClient: client }).findDirectMessage(ref),
    );
    expect(address).toBe("spaces/bob-admin-dm");
    expect(await findIdentity(db, "google_chat", `users/${bob.id}`)).toMatchObject({ status: "reachable" });

    // Nothing to find for someone who never signed in with Google.
    expect(await discoverGoogleChatDm(db, aliceId, async () => "spaces/should-not-be-used")).toBeNull();
  });
});
