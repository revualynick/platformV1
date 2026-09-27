import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { getTenantDb, users } from "@revualy/db";
import { buildApp } from "../server.js";

/**
 * Who sees what about a person (privacy design, 2026-09-27): the person and
 * their direct manager see content; skip-level managers and admins see
 * signals only; anyone else sees nothing.
 */

const SECRET = process.env.INTERNAL_API_SECRET!;
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

describe.skipIf(!dbUp)("person access levels (integration)", () => {
  const tag = crypto.randomUUID().slice(0, 8);
  const ids = {
    skip: crypto.randomUUID(),
    manager: crypto.randomUUID(),
    report: crypto.randomUUID(),
    admin: crypto.randomUUID(),
    peerManager: crypto.randomUUID(),
  };
  const as = (userId: string) => ({ "x-internal-secret": SECRET, "x-user-id": userId });
  let app: FastifyInstance;

  beforeAll(async () => {
    await db.insert(users).values([
      { id: ids.skip, email: `skip-${tag}@test.local`, name: "Skip", role: "manager" },
      { id: ids.admin, email: `admin-${tag}@test.local`, name: "Ada", role: "admin" },
      { id: ids.peerManager, email: `peer-${tag}@test.local`, name: "Peer", role: "manager" },
    ]);
    await db.insert(users).values({ id: ids.manager, email: `mgr-${tag}@test.local`, name: "Jo", role: "manager", managerId: ids.skip });
    await db.insert(users).values({ id: ids.report, email: `rep-${tag}@test.local`, name: "Sam", role: "employee", managerId: ids.manager });
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await db.delete(users).where(inArray(users.id, [ids.report]));
    await db.delete(users).where(inArray(users.id, [ids.manager]));
    await db.delete(users).where(inArray(users.id, [ids.skip, ids.admin, ids.peerManager]));
  });

  const content = [
    (id: string) => `/api/v1/users/${id}/feedback`,
    (id: string) => `/api/v1/profiles/users/${id}`,
    (id: string) => `/api/v1/profiles/users/${id}/timeline`,
    (id: string) => `/api/v1/profiles/users/${id}/drift?framework=colour`,
  ];

  it("the direct manager sees content, and the person sees their own feedback", async () => {
    for (const url of content) {
      const res = await app.inject({ method: "GET", url: url(ids.report), headers: as(ids.manager) });
      expect(res.statusCode, `${url(ids.report)} as manager`).not.toBe(403);
    }
    // The profile routes are manager routes (employees use their own); feedback is shared.
    const self = await app.inject({ method: "GET", url: `/api/v1/users/${ids.report}/feedback`, headers: as(ids.report) });
    expect(self.statusCode).toBe(200);
  });

  it("skip-level managers, admins and unrelated managers don't", async () => {
    for (const url of content) {
      for (const viewer of [ids.skip, ids.admin, ids.peerManager]) {
        const res = await app.inject({ method: "GET", url: url(ids.report), headers: as(viewer) });
        expect(res.statusCode, `${url(ids.report)}`).toBe(403);
      }
    }
  });

  it("skip-levels and admins still get signals (engagement)", async () => {
    for (const viewer of [ids.skip, ids.admin]) {
      const res = await app.inject({ method: "GET", url: `/api/v1/engagement/bulk?userIds=${ids.report}`, headers: as(viewer) });
      expect(res.statusCode).toBe(200);
    }
    const unrelated = await app.inject({ method: "GET", url: `/api/v1/engagement/bulk?userIds=${ids.report}`, headers: as(ids.peerManager) });
    expect(unrelated.statusCode).toBe(403);
  });

  it("only the direct manager can invite a report to an assessment", async () => {
    const skip = await app.inject({ method: "POST", url: `/api/v1/profiles/users/${ids.report}/assessment-invite`, headers: as(ids.skip), payload: {} });
    expect(skip.statusCode).toBe(403);
  });
});
