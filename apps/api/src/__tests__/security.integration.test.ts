import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  getTenantDb,
  users,
  escalations,
  conversations,
  authUsers,
  authSessions,
} from "@revualy/db";
import { buildApp } from "../server.js";

/**
 * Integration tests for the pre-beta security fixes (review H1, M2, M6),
 * run against a real Postgres. Skipped when no database is reachable so
 * CI without Postgres still passes.
 */

const DB_URL = process.env.DATABASE_URL!;
const SECRET = process.env.INTERNAL_API_SECRET!;

async function dbReachable(): Promise<boolean> {
  const probe = getTenantDb(process.env.ORG_ID!, DB_URL).execute(sql`select 1`);
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000));
  try {
    await Promise.race([probe, timeout]);
    return true;
  } catch {
    return false;
  }
}

const dbUp = await dbReachable();

describe.skipIf(!dbUp)("security fixes (integration)", () => {
  let app: FastifyInstance;
  const db = getTenantDb(process.env.ORG_ID!, DB_URL);
  const tag = crypto.randomUUID().slice(0, 8);
  const ids = {
    active: crypto.randomUUID(),
    inactive: crypto.randomUUID(),
    superAdmin: crypto.randomUUID(),
    reporter: crypto.randomUUID(),
  };
  const authUserId = crypto.randomUUID();
  let escalationId: string;
  let reflectionConvId: string;
  let peerConvId: string;

  const as = (userId: string) => ({
    "x-internal-secret": SECRET,
    "x-user-id": userId,
  });

  beforeAll(async () => {
    await db.insert(users).values([
      { id: ids.active, email: `active-${tag}@test.local`, name: "Active", role: "employee" },
      { id: ids.inactive, email: `inactive-${tag}@test.local`, name: "Gone", role: "admin", isActive: false },
      { id: ids.superAdmin, email: `super-${tag}@test.local`, name: "Super", role: "super_admin" },
      { id: ids.reporter, email: `reporter-${tag}@test.local`, name: "Reporter", role: "manager" },
    ]);
    const [esc] = await db
      .insert(escalations)
      .values({ severity: "high", reason: "test", flaggedContent: "test", reporterId: ids.reporter, subjectId: ids.active })
      .returning({ id: escalations.id });
    escalationId = esc.id;
    const base = {
      reviewerId: ids.active,
      subjectId: ids.active,
      platform: "internal",
      platformChannelId: "test",
      scheduledAt: new Date(),
    };
    const [r] = await db
      .insert(conversations)
      .values({ ...base, interactionType: "self_reflection" })
      .returning({ id: conversations.id });
    const [p] = await db
      .insert(conversations)
      .values({ ...base, subjectId: ids.reporter, interactionType: "peer_review" })
      .returning({ id: conversations.id });
    reflectionConvId = r.id;
    peerConvId = p.id;

    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    // Tolerates a partially-completed beforeAll so fixtures never leak.
    await app?.close();
    await db.delete(authSessions).where(eq(authSessions.userId, authUserId));
    await db.delete(authUsers).where(eq(authUsers.id, authUserId));
    await db.delete(conversations).where(inArray(conversations.reviewerId, Object.values(ids)));
    await db.delete(escalations).where(inArray(escalations.subjectId, Object.values(ids)));
    await db.delete(users).where(inArray(users.id, Object.values(ids)));
  });

  describe("H1: deactivated users lose access", () => {
    it("rejects API calls from a deactivated user", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/users", headers: as(ids.inactive) });
      expect(res.statusCode).toBe(403);
    });

    it("still allows active users", async () => {
      const res = await app.inject({ method: "GET", url: `/api/v1/users/${ids.active}`, headers: as(ids.active) });
      expect(res.statusCode).toBe(200);
    });

    it("rejects a malformed user id with 401 rather than a 500", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/users", headers: as("not-a-uuid") });
      expect(res.statusCode).toBe(401);
    });

    it("lookup reports isActive=false (case-insensitively) so sign-in can refuse", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/auth/lookup?email=${encodeURIComponent(`INACTIVE-${tag}@test.local`)}`,
        headers: { "x-internal-secret": SECRET },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().isActive).toBe(false);
    });

    it("provision refuses to re-admit a deactivated user", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/provision",
        headers: { "x-internal-secret": SECRET },
        payload: { email: `inactive-${tag}@test.local` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("deactivating a user deletes their web sessions", async () => {
      await db.insert(authUsers).values({ id: authUserId, email: `active-${tag}@test.local`, tenantUserId: ids.active });
      await db.insert(authSessions).values({
        sessionToken: `tok-${tag}`,
        userId: authUserId,
        expires: new Date(Date.now() + 3_600_000),
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/users/${ids.active}/deactivate`,
        headers: as(ids.superAdmin),
      });
      expect(res.statusCode).toBe(200);

      const remaining = await db.select().from(authSessions).where(eq(authSessions.userId, authUserId));
      expect(remaining).toHaveLength(0);
      await db.update(users).set({ isActive: true }).where(eq(users.id, ids.active));
    });
  });

  describe("M6: super_admin has admin visibility", () => {
    it("super_admin can open an escalation they did not report", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/escalations/${escalationId}`,
        headers: as(ids.superAdmin),
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("M2: self-reflections stay private from admins", () => {
    it("hides a self-reflection transcript", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/conversations/${reflectionConvId}`,
        headers: as(ids.superAdmin),
      });
      expect(res.statusCode).toBe(404);
    });

    it("still shows other conversation types", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/conversations/${peerConvId}`,
        headers: as(ids.superAdmin),
      });
      expect(res.statusCode).toBe(200);
    });

    it("excludes self-reflections from the list", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/conversations?limit=200",
        headers: as(ids.superAdmin),
      });
      const listed = res.json().data.map((c: { id: string }) => c.id);
      expect(listed).toContain(peerConvId);
      expect(listed).not.toContain(reflectionConvId);
    });
  });
});
