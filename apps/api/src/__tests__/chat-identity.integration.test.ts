import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { getTenantDb, users, userPlatformIdentities, identityLinkEvents } from "@revualy/db";
import { autoLinkByEmail, markUnreachable, findIdentity } from "../lib/chat-identity.js";

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

describe.skipIf(!dbUp)("chat identity (integration)", () => {
  const tag = crypto.randomUUID().slice(0, 8);
  const alice = crypto.randomUUID();
  const gone = crypto.randomUUID();
  const aliceChatId = `users/alice-${tag}`;

  beforeAll(async () => {
    await db.insert(users).values([
      { id: alice, email: `Alice-${tag}@test.local`, name: "Alice" },
      { id: gone, email: `gone-${tag}@test.local`, name: "Gone", isActive: false },
    ]);
  });

  afterAll(async () => {
    const ids = [alice, gone];
    await db.delete(identityLinkEvents).where(inArray(identityLinkEvents.userId, ids));
    await db.delete(userPlatformIdentities).where(inArray(userPlatformIdentities.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  });

  it("auto-links a Google Chat account by email (case-insensitive) and makes it reachable", async () => {
    const res = await autoLinkByEmail(db, {
      platform: "google_chat",
      platformUserId: aliceChatId,
      email: `alice-${tag}@TEST.local`,
      displayName: "Alice A",
      dmAddress: "spaces/alice-dm",
    });
    expect(res.status).toBe("linked");
    if (res.status !== "linked") return;
    expect(res.created).toBe(true);
    expect(res.identity).toMatchObject({
      userId: alice,
      status: "reachable",
      linkSource: "auto",
      dmAddress: "spaces/alice-dm",
    });
    expect(res.identity.confirmedAt).not.toBeNull();

    const events = await db.select().from(identityLinkEvents).where(eq(identityLinkEvents.userId, alice));
    expect(events.map((e) => e.action).sort()).toEqual(["link", "reachable"]);
  });

  it("is idempotent: a repeat event refreshes rather than duplicates", async () => {
    const res = await autoLinkByEmail(db, {
      platform: "google_chat",
      platformUserId: aliceChatId,
      email: `alice-${tag}@test.local`,
      dmAddress: "spaces/alice-dm",
    });
    expect(res.status === "linked" && res.created).toBe(false);
    const rows = await db.select().from(userPlatformIdentities).where(eq(userPlatformIdentities.userId, alice));
    expect(rows).toHaveLength(1);
  });

  it("survives concurrent first contact for the same person", async () => {
    // Several rounds of many simultaneous webhooks: the race only shows up
    // under load, so a single small burst is not a reliable guard.
    for (let round = 0; round < 5; round++) {
      const bobId = crypto.randomUUID();
      const email = `bob-${round}-${tag}@test.local`;
      await db.insert(users).values({ id: bobId, email, name: "Bob" });
      try {
        const input = {
          platform: "google_chat" as const,
          platformUserId: `users/bob-${round}-${tag}`,
          email,
          dmAddress: "spaces/bob-dm",
        };
        const results = await Promise.all(Array.from({ length: 16 }, () => autoLinkByEmail(db, input)));
        expect(results.map((r) => r.status)).toEqual(Array(16).fill("linked"));
        const rows = await db.select().from(userPlatformIdentities).where(eq(userPlatformIdentities.userId, bobId));
        expect(rows).toHaveLength(1);
      } finally {
        await db.delete(identityLinkEvents).where(eq(identityLinkEvents.userId, bobId));
        await db.delete(userPlatformIdentities).where(eq(userPlatformIdentities.userId, bobId));
        await db.delete(users).where(eq(users.id, bobId));
      }
    }
  });

  it("refuses unknown emails, deactivated users and missing emails", async () => {
    expect(
      (await autoLinkByEmail(db, { platform: "google_chat", platformUserId: "users/x1", email: `nobody-${tag}@test.local` })).status,
    ).toBe("unknown_sender");
    expect(
      (await autoLinkByEmail(db, { platform: "google_chat", platformUserId: "users/x2", email: `gone-${tag}@test.local` })).status,
    ).toBe("unknown_sender");
    expect((await autoLinkByEmail(db, { platform: "google_chat", platformUserId: "users/x3" })).status).toBe(
      "unknown_sender",
    );
  });

  it("never auto-links Slack or Teams (those need a manual, confirmed link)", async () => {
    const res = await autoLinkByEmail(db, {
      platform: "slack",
      platformUserId: `U-${tag}`,
      email: `alice-${tag}@test.local`,
    });
    expect(res.status).toBe("not_auto_linkable");
  });

  it("will not attach a second account to someone already linked", async () => {
    const res = await autoLinkByEmail(db, {
      platform: "google_chat",
      platformUserId: `users/impostor-${tag}`,
      email: `alice-${tag}@test.local`,
    });
    expect(res).toEqual({ status: "conflict", existingPlatformUserId: aliceChatId });
  });

  it("marks someone unreachable when the bot is removed, keeping the link", async () => {
    expect(await markUnreachable(db, "google_chat", aliceChatId)).toBe(true);
    const identity = await findIdentity(db, "google_chat", aliceChatId);
    expect(identity).toMatchObject({ status: "linked", dmAddress: null, userId: alice });
    expect(await markUnreachable(db, "google_chat", aliceChatId)).toBe(false);
  });
});
