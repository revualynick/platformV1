import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import crypto from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { getTenantDb, users, conversations, conversationMessages, conversationThemeOutcomes } from "@revualy/db";
import { contactHold, isRich } from "../lib/contact-guard.js";

/** Don't badger people: gaps between check-ins, and a rest after a rich one. Self-skips without a DB. */

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
const DAY = 24 * 60 * 60 * 1000;

describe("isRich", () => {
  it("counts two answered themes, or eighty words, as a lot", () => {
    expect(isRich(2, 10)).toBe(true);
    expect(isRich(0, 80)).toBe(true);
    expect(isRich(1, 79)).toBe(false);
  });
});

describe.skipIf(!dbUp)("contactHold (integration)", () => {
  const ids = { rev: crypto.randomUUID(), sub: crypto.randomUUID() };
  const tag = ids.rev.slice(0, 8);
  const now = new Date();
  const weekStart = new Date(now.getTime() - 6 * DAY);

  async function checkIn(daysAgo: number, opts: { answered?: number; words?: number } = {}) {
    const at = new Date(now.getTime() - daysAgo * DAY);
    const [c] = await db
      .insert(conversations)
      .values({
        reviewerId: ids.rev,
        subjectId: ids.sub,
        interactionType: "peer_review",
        platform: "internal",
        platformChannelId: `dm-${tag}`,
        status: "closed",
        scheduledAt: at,
        initiatedAt: at,
        createdAt: at,
      })
      .returning({ id: conversations.id });
    if (opts.words) {
      await db.insert(conversationMessages).values({ conversationId: c.id, role: "user", content: Array(opts.words).fill("word").join(" ") });
    }
    for (let i = 0; i < (opts.answered ?? 0); i++) {
      await db.insert(conversationThemeOutcomes).values({
        conversationId: c.id,
        themeId: null,
        reviewerId: ids.rev,
        subjectId: ids.sub,
        interactionType: "peer_review",
        outcome: "answered",
      });
    }
    return c.id;
  }

  beforeAll(async () => {
    await db.insert(users).values([
      { id: ids.rev, email: `rev-${tag}@test.local`, name: "Rae" },
      { id: ids.sub, email: `sub-${tag}@test.local`, name: "Sam" },
    ]);
  });
  afterEach(async () => {
    await db.delete(conversations).where(eq(conversations.reviewerId, ids.rev));
  });
  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, Object.values(ids)));
  });

  it("allows contact when there has been none", async () => {
    expect(await contactHold(db, ids.rev, now, weekStart)).toBeNull();
  });

  it("holds off within three days of the last check-in, however thin it was", async () => {
    await checkIn(2, { words: 3 });
    expect(await contactHold(db, ids.rev, now, weekStart)).toBe("too_soon");
  });

  it("rests someone for the week after a rich check-in", async () => {
    await checkIn(4, { answered: 2 });
    expect(await contactHold(db, ids.rev, now, weekStart)).toBe("gave_a_lot_this_week");
    await db.delete(conversations).where(eq(conversations.reviewerId, ids.rev));
    await checkIn(4, { words: 120 });
    expect(await contactHold(db, ids.rev, now, weekStart)).toBe("gave_a_lot_this_week");
  });

  it("asks again this week after a thin check-in, once the gap has passed", async () => {
    await checkIn(4, { answered: 1, words: 20 });
    expect(await contactHold(db, ids.rev, now, weekStart)).toBeNull();
  });

  it("a rich check-in last week does not hold this week", async () => {
    await checkIn(8, { answered: 3, words: 200 });
    expect(await contactHold(db, ids.rev, now, weekStart)).toBeNull();
  });
});
