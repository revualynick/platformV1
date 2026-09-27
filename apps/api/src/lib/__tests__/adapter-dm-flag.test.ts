import { describe, it, expect } from "vitest";
import { SlackAdapter } from "@revualy/chat-adapter-slack";
import { TeamsAdapter } from "@revualy/chat-adapter-teams";

/**
 * Only one-to-one DMs are routed into check-in conversations (the webhook
 * ignores anything not flagged as a DM), so every adapter must say which
 * messages are DMs.
 */

describe("Slack DM flag and message id", () => {
  const slack = new SlackAdapter({ botToken: "xoxb-test", signingSecret: "test" });
  const event = (channel_type: string, channel = "D123") => ({
    type: "event_callback",
    event: { type: "message", user: "U1", channel, channel_type, ts: "1790000000.000100", text: "hi" },
  });

  it("flags a DM (channel_type im) as direct", async () => {
    expect((await slack.normalizeInbound(event("im")))?.isDirectMessage).toBe(true);
  });

  it("does not flag a shared channel message as direct", async () => {
    expect((await slack.normalizeInbound(event("channel", "C999")))?.isDirectMessage).toBe(false);
  });

  it("ignores messages posted by an app, even when they carry a user (review H4)", async () => {
    const own = { type: "event_callback", event: { type: "message", user: "U1", bot_id: "B1", channel: "D1", channel_type: "im", ts: "1790000000.000200", text: "bot reply" } };
    expect(await slack.normalizeInbound(own)).toBeNull();
    const app = { type: "event_callback", event: { type: "message", user: "U1", app_id: "A1", channel: "D1", channel_type: "im", ts: "1790000000.000300", text: "bot reply" } };
    expect(await slack.normalizeInbound(app)).toBeNull();
  });

  it("makes the message id unique across channels (Slack ts is per channel)", async () => {
    const a = await slack.normalizeInbound(event("im", "D1"));
    const b = await slack.normalizeInbound(event("im", "D2"));
    expect(a?.platformMessageId).not.toBe(b?.platformMessageId);
  });
});

describe("Teams DM flag", () => {
  const teams = new TeamsAdapter({ appId: "app", appPassword: "pw" });
  const activity = (conversationType: string) => ({
    type: "message",
    id: "a1",
    text: "hi",
    from: { id: "29:user", name: "User" },
    recipient: { id: "28:bot" },
    conversation: { id: "a:conv", conversationType },
    serviceUrl: "https://smba.trafficmanager.net/uk/",
  });

  it("flags a personal chat as direct", async () => {
    expect((await teams.normalizeInbound(activity("personal")))?.isDirectMessage).toBe(true);
  });

  it("does not flag a channel or group chat as direct", async () => {
    expect((await teams.normalizeInbound(activity("channel")))?.isDirectMessage).toBe(false);
    expect((await teams.normalizeInbound(activity("groupChat")))?.isDirectMessage).toBe(false);
  });
});
