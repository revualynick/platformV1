import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { getTenantDb, users, userPlatformIdentities, engagementScores } from "@revualy/db";
import { selectNudgeTargets, recomputeWeeklyEngagement, weekMondayUTC } from "../lib/engagement-aggregation.js";

/** Review fix B5: who gets a nudge. Real Postgres, self-skips. */

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

describe.skipIf(!dbUp)("selectNudgeTargets (integration)", () => {
  const week = weekMondayUTC();
  const u = {
    idle: crypto.randomUUID(), // reachable, nothing done yet, no engagement row
    done: crypto.randomUUID(), // did both scheduled check-ins
    custom: crypto.randomUUID(), // target 3, did 1
    paused: crypto.randomUUID(),
    unreachable: crypto.randomUUID(),
    inactive: crypto.randomUUID(),
  };
  const all: string[] = Object.values(u);

  beforeAll(async () => {
    const base = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      email: `n-${id.slice(0, 8)}@test.local`,
      name: "N",
      onboardingCompleted: true,
      ...extra,
    });
    await db.insert(users).values([
      base(u.idle),
      base(u.done),
      base(u.custom, { preferences: { weeklyInteractionTarget: 3 } }),
      base(u.paused, { preferences: { chatPaused: true } }),
      base(u.unreachable),
      base(u.inactive, { isActive: false }),
    ]);
    await db.insert(userPlatformIdentities).values(
      [u.idle, u.done, u.custom, u.paused, u.inactive].map((id) => ({
        userId: id,
        platform: "google_chat",
        platformUserId: `users/${id}`,
        status: "reachable" as const,
        dmAddress: `spaces/${id}`,
        linkSource: "auto" as const,
      })),
    );
    await db.insert(engagementScores).values([
      { userId: u.done, weekStarting: week, interactionsCompleted: 2 },
      { userId: u.custom, weekStarting: week, interactionsCompleted: 1 },
    ]);
  });

  afterAll(async () => {
    await db.delete(engagementScores).where(inArray(engagementScores.userId, all));
    await db.delete(userPlatformIdentities).where(inArray(userPlatformIdentities.userId, all));
    await db.delete(users).where(inArray(users.id, all));
  });

  it("nudges idle people and uses each person's own target", async () => {
    const targets = (await selectNudgeTargets(db, week, "google_chat")).filter((t) => all.includes(t.userId));
    const byId = new Map(targets.map((t) => [t.userId, t]));

    expect(byId.get(u.idle)).toEqual({ userId: u.idle, target: 2, pending: 2 }); // previously never nudged
    expect(byId.get(u.custom)).toEqual({ userId: u.custom, target: 3, pending: 2 });
    expect(byId.has(u.done)).toBe(false); // previously told "1 pending" against a target of 3
    expect(byId.has(u.paused)).toBe(false);
    expect(byId.has(u.unreachable)).toBe(false);
    expect(byId.has(u.inactive)).toBe(false);
  });

  it("recomputed engagement stores the person's own target", async () => {
    await recomputeWeeklyEngagement(db, u.idle, week);
    const [row] = await db.select().from(engagementScores).where(eq(engagementScores.userId, u.idle));
    expect(row).toMatchObject({ interactionsTarget: 2, interactionsCompleted: 0, responseRate: 0 });
  });
});
