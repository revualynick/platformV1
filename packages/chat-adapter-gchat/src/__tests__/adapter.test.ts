import { describe, it, expect, beforeAll } from "vitest";
import { GoogleChatAdapter } from "../adapter.js";
import { audienceMode } from "../verify.js";
import {
  createTestSigner,
  createFakeChatClient,
  googleChatEvents as ev,
  type TestSigner,
} from "../testing.js";

const PROJECT = "123456789012";
const ENDPOINT = "https://acme.revualy.com/webhooks/gchat/events";
const alice = { id: "111", email: "alice@acme.test", displayName: "Alice" };

let signer: TestSigner;
beforeAll(async () => {
  signer = await createTestSigner();
});

function adapter(audience = PROJECT, extra: Partial<ConstructorParameters<typeof GoogleChatAdapter>[0]> = {}) {
  return new GoogleChatAdapter({
    projectId: "acme",
    audience,
    keyResolver: signer.keyResolver,
    chatClient: createFakeChatClient(),
    ...extra,
  });
}
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

describe("webhook verification (H5)", () => {
  it("accepts a valid project-number token", async () => {
    const a = adapter();
    const res = await a.verifyWebhook(bearer(await signer.token(PROJECT)), ev.message(alice, "dm1", "hi"));
    expect(res.isValid).toBe(true);
  });

  it("accepts a valid endpoint-URL token minted for Chat", async () => {
    const a = adapter(ENDPOINT);
    const res = await a.verifyWebhook(bearer(await signer.token(ENDPOINT)), ev.message(alice, "dm1", "hi"));
    expect(res.isValid).toBe(true);
  });

  it("rejects a missing, garbage or unsigned bearer", async () => {
    const a = adapter();
    const body = ev.message(alice, "dm1", "hi");
    expect((await a.verifyWebhook({}, body)).isValid).toBe(false);
    expect((await a.verifyWebhook(bearer("not-a-jwt"), body)).isValid).toBe(false);
    const [h, p] = (await signer.token(PROJECT)).split(".");
    expect((await a.verifyWebhook(bearer(`${h}.${p}.`), body)).isValid).toBe(false);
  });

  it("rejects a token for another audience, issuer or key", async () => {
    const a = adapter();
    const body = ev.message(alice, "dm1", "hi");
    expect((await a.verifyWebhook(bearer(await signer.token("999999999999")), body)).isValid).toBe(false);
    expect(
      (await a.verifyWebhook(bearer(await signer.token(PROJECT, {}, { issuer: "attacker@evil.test" })), body)).isValid,
    ).toBe(false);
    const other = await createTestSigner();
    expect((await a.verifyWebhook(bearer(await other.token(PROJECT)), body)).isValid).toBe(false);
  });

  it("rejects an expired token", async () => {
    const a = adapter();
    const token = await signer.token(PROJECT, {}, { expiresIn: "-1m" });
    expect((await a.verifyWebhook(bearer(token), ev.message(alice, "dm1", "hi"))).isValid).toBe(false);
  });

  it("endpoint-URL mode rejects Google ID tokens not minted for Chat", async () => {
    const a = adapter(ENDPOINT);
    const body = ev.message(alice, "dm1", "hi");
    const wrongEmail = await signer.token(ENDPOINT, { email: "someone@gmail.com" });
    const unverified = await signer.token(ENDPOINT, { email_verified: false });
    expect((await a.verifyWebhook(bearer(wrongEmail), body)).isValid).toBe(false);
    expect((await a.verifyWebhook(bearer(unverified), body)).isValid).toBe(false);
  });

  it("rejects a replayed (stale) event even with a valid token", async () => {
    const a = adapter();
    const body = { ...ev.message(alice, "dm1", "hi"), eventTime: new Date(Date.now() - 10 * 60_000).toISOString() };
    expect((await a.verifyWebhook(bearer(await signer.token(PROJECT)), body)).isValid).toBe(false);
  });

  it("ignores the deprecated body token unless explicitly enabled", async () => {
    const body = { ...ev.message(alice, "dm1", "hi"), token: "shared-secret" };
    expect((await adapter(PROJECT, { verificationToken: "shared-secret" }).verifyWebhook({}, body)).isValid).toBe(false);
    const legacy = adapter(PROJECT, { verificationToken: "shared-secret", allowLegacyToken: true });
    expect((await legacy.verifyWebhook({}, body)).isValid).toBe(true);
  });

  it("requires a valid audience setting", () => {
    expect(audienceMode(PROJECT)).toBe("project_number");
    expect(audienceMode(ENDPOINT)).toBe("endpoint_url");
    expect(() => audienceMode("my-project")).toThrow();
    expect(() => audienceMode("http://insecure.test")).toThrow();
  });
});

describe("event normalisation", () => {
  it("bot added to a DM becomes an install with the DM address", async () => {
    expect(await adapter().normalizeEvent(ev.addedToDm(alice, "dm1"))).toEqual({
      kind: "installed",
      platform: "google_chat",
      platformUserId: "users/111",
      email: "alice@acme.test",
      displayName: "Alice",
      dmAddress: "spaces/dm1",
    });
  });

  it("bot removed from a DM becomes an uninstall", async () => {
    expect(await adapter().normalizeEvent(ev.removedFromDm(alice, "dm1"))).toEqual({
      kind: "uninstalled",
      platform: "google_chat",
      platformUserId: "users/111",
      dmAddress: "spaces/dm1",
    });
  });

  it("being added to a room is not a DM install", async () => {
    expect(await adapter().normalizeEvent(ev.addedToRoom(alice, "room1"))).toBeNull();
  });

  it("messages carry sender details for linking", async () => {
    const event = await adapter().normalizeEvent(ev.message(alice, "dm1", "  Sam was great  ", "abc"));
    expect(event?.kind).toBe("message");
    if (event?.kind !== "message") return;
    expect(event.message).toMatchObject({
      platform: "google_chat",
      platformMessageId: "spaces/dm1/messages/abc",
      platformChannelId: "spaces/dm1",
      platformUserId: "users/111",
      text: "Sam was great",
      isDirectMessage: true,
      sender: { email: "alice@acme.test", displayName: "Alice" },
    });
  });

  it("ignores messages from bots, including itself", async () => {
    const bot = { id: "bot", type: "BOT" as const };
    expect(await adapter().normalizeEvent(ev.message(bot, "dm1", "hello"))).toBeNull();
  });

  it("rejects Workspace add-on payloads instead of guessing", async () => {
    expect(await adapter().normalizeEvent(ev.addOnMessage(alice, "dm1", "hi"))).toBeNull();
  });
});

describe("outbound and DM discovery", () => {
  it("sends to the DM space", async () => {
    const client = createFakeChatClient();
    const a = adapter(PROJECT, { chatClient: client });
    await a.sendMessage({ platform: "google_chat", channelId: "spaces/dm1", text: "Hello" });
    expect(client.sent[0]).toMatchObject({ parent: "spaces/dm1", requestBody: { text: "Hello" } });
  });

  it("finds an existing DM, and returns null (not an error) when none exists", async () => {
    const client = createFakeChatClient();
    client.dms.set("users/111", "spaces/dm1");
    const a = adapter(PROJECT, { chatClient: client });
    expect(await a.findDirectMessage("users/111")).toBe("spaces/dm1");
    expect(await a.findDirectMessage("users/222")).toBeNull();
  });
});
