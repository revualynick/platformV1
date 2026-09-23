import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { eq, inArray, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  getTenantDb,
  users,
  teams,
  userRelationships,
  conversations,
  feedbackEntries,
  threeSixtyReviews,
  threeSixtyResponses,
} from "@revualy/db";
import { getCompletedThreeSixtyReviews } from "@revualy/db/queries";
import { buildApp } from "../server.js";
import { createMockLLM } from "../lib/__tests__/test-utils.js";

/**
 * Review fixes B6 (relationship re-create), B7 (completed 360s only),
 * B8 (360 uses the LLM) and B9 (unmanaged team is admin-only), through the
 * real routes and database. Self-skips without a DB.
 */

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

describe.skipIf(!dbUp)("branch review fixes (integration)", () => {
  let app: FastifyInstance;
  const llmCalls: string[] = [];
  const ids = {
    admin: crypto.randomUUID(),
    manager: crypto.randomUUID(),
    a: crypto.randomUUID(),
    b: crypto.randomUUID(),
  };
  const all = Object.values(ids);
  const tag = ids.admin.slice(0, 8);
  let teamId: string;

  const as = (userId: string) => ({ "x-internal-secret": process.env.INTERNAL_API_SECRET!, "x-user-id": userId });

  beforeAll(async () => {
    await db.insert(users).values([
      { id: ids.admin, email: `adm-${tag}@test.local`, name: "Admin", role: "admin" },
      { id: ids.manager, email: `mgr-${tag}@test.local`, name: "Manager", role: "manager" },
      { id: ids.a, email: `a-${tag}@test.local`, name: "Alex", managerId: ids.manager },
      { id: ids.b, email: `b-${tag}@test.local`, name: "Bo", managerId: ids.manager },
    ]);
    const [team] = await db.insert(teams).values({ name: `Unmanaged ${tag}` }).returning({ id: teams.id });
    teamId = team.id;

    const base = createMockLLM(
      new Map([
        ["distinct strengths", JSON.stringify(["Unblocks the team quickly"])],
        ["distinct areas for growth", JSON.stringify(["Could delegate more"])],
      ]),
    );
    app = await buildApp();
    app.decorate("llm", {
      ...base,
      complete: async (req: Parameters<typeof base.complete>[0]) => {
        llmCalls.push(String(req.messages[0]?.content ?? "").slice(0, 60));
        return base.complete(req);
      },
    } as typeof base);
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    const reviews = await db.select({ id: threeSixtyReviews.id }).from(threeSixtyReviews).where(inArray(threeSixtyReviews.subjectId, all));
    if (reviews.length) {
      await db.delete(threeSixtyResponses).where(inArray(threeSixtyResponses.reviewId, reviews.map((r) => r.id)));
      await db.delete(threeSixtyReviews).where(inArray(threeSixtyReviews.id, reviews.map((r) => r.id)));
    }
    await db.delete(feedbackEntries).where(inArray(feedbackEntries.subjectId, all));
    await db.delete(conversations).where(inArray(conversations.reviewerId, all));
    await db
      .delete(userRelationships)
      .where(or(inArray(userRelationships.fromUserId, all), inArray(userRelationships.toUserId, all)));
    await db.delete(teams).where(eq(teams.id, teamId));
    await db.delete(users).where(inArray(users.id, all));
  });

  it("B6: re-creating a previously deleted relationship reactivates it instead of a 500", async () => {
    const create = () =>
      app.inject({
        method: "POST",
        url: "/api/v1/relationships",
        headers: as(ids.admin),
        payload: { fromUserId: ids.a, toUserId: ids.b, label: "pair" },
      });
    const first = await create();
    expect(first.statusCode).toBe(201);
    const del = await app.inject({ method: "DELETE", url: `/api/v1/relationships/${first.json().id}`, headers: as(ids.admin) });
    expect(del.statusCode).toBeLessThan(300);

    const again = await create();
    expect(again.statusCode).toBe(201);
    expect(again.json()).toMatchObject({ id: first.json().id, isActive: true });
  });

  it("B7: only completed 360s are listed, never in-progress ones labelled completed", async () => {
    await db.insert(threeSixtyReviews).values([
      { subjectId: ids.a, initiatedById: ids.admin, status: "collecting" },
      { subjectId: ids.a, initiatedById: ids.admin, status: "completed", completedAt: new Date() },
    ]);
    const rows = await getCompletedThreeSixtyReviews(db, ids.a);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("completed");
  });

  it("B8: completing a 360 uses the LLM for strengths and growth areas", async () => {
    const [conv] = await db
      .insert(conversations)
      .values({ reviewerId: ids.a, subjectId: ids.b, interactionType: "three_sixty", platform: "internal", platformChannelId: "t", scheduledAt: new Date() })
      .returning({ id: conversations.id });
    const [entry] = await db
      .insert(feedbackEntries)
      .values({
        conversationId: conv.id,
        reviewerId: ids.a,
        subjectId: ids.b,
        interactionType: "three_sixty",
        rawContent: "Bo unblocks the team",
        aiSummary: "Bo unblocks the team quickly but could delegate more.",
      })
      .returning({ id: feedbackEntries.id });
    const [review] = await db
      .insert(threeSixtyReviews)
      .values({ subjectId: ids.b, initiatedById: ids.admin, status: "collecting" })
      .returning({ id: threeSixtyReviews.id });
    await db.insert(threeSixtyResponses).values({
      reviewId: review.id,
      reviewerId: ids.a,
      status: "completed",
      feedbackEntryId: entry.id,
    });

    llmCalls.length = 0;
    const res = await app.inject({ method: "POST", url: `/api/v1/three-sixty/${review.id}/complete`, headers: as(ids.admin), payload: {} });
    expect(res.statusCode).toBe(200);
    expect(llmCalls.length).toBe(2);
    expect(res.json().aggregatedData).toMatchObject({
      strengths: ["Unblocks the team quickly"],
      growthAreas: ["Could delegate more"],
    });

    // A second completion is refused rather than re-run.
    const again = await app.inject({ method: "POST", url: `/api/v1/three-sixty/${review.id}/complete`, headers: as(ids.admin), payload: {} });
    expect(again.statusCode).toBe(400);
  });

  it("B9: an unmanaged team's profiles are admin-only", async () => {
    const asManager = await app.inject({ method: "GET", url: `/api/v1/profiles/team/${teamId}?framework=colour`, headers: as(ids.manager) });
    expect(asManager.statusCode).toBe(403);
    const asAdmin = await app.inject({ method: "GET", url: `/api/v1/profiles/team/${teamId}?framework=colour`, headers: as(ids.admin) });
    expect(asAdmin.statusCode).toBe(200);
  });
});
