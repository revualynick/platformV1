import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { getTenantDb, accessGrants, auditLog, profileDevelopmentGoals, users } from "@revualy/db";
import { buildApp } from "../server.js";

/**
 * Break-glass grants (privacy design, 2026-09-27): an admin records a reason
 * and gets read-only content access to one person for a period and a limited
 * time. Every step is audited; the subject is told unless a hold is set.
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
const REASON = "Formal grievance raised on 2026-09-20, case HR-114";
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!dbUp)("break-glass access grants (integration)", () => {
  const tag = crypto.randomUUID().slice(0, 8);
  const ids = {
    manager: crypto.randomUUID(),
    report: crypto.randomUUID(),
    other: crypto.randomUUID(),
    admin: crypto.randomUUID(),
    admin2: crypto.randomUUID(),
    superAdmin: crypto.randomUUID(),
    employee: crypto.randomUUID(),
  };
  const as = (userId: string) => ({ "x-internal-secret": SECRET, "x-user-id": userId });
  const feedbackUrl = (id: string) => `/api/v1/users/${id}/feedback`;
  const profileUrl = (id: string) => `/api/v1/profiles/users/${id}`;
  let app: FastifyInstance;
  let goalId: string;

  const grant = (by: string, payload: Record<string, unknown>) =>
    app.inject({ method: "POST", url: "/api/v1/access-grants", headers: as(by), payload });
  const base = (subjectId: string) => ({ subjectId, reason: REASON, periodStart: daysAgo(90), periodEnd: today() });
  const audits = (action: string, target: string) =>
    db.select().from(auditLog).where(and(eq(auditLog.action, action), eq(auditLog.target, target)));

  beforeAll(async () => {
    await db.insert(users).values([
      { id: ids.manager, email: `m-${tag}@test.local`, name: "Jo", role: "manager" },
      { id: ids.admin, email: `a-${tag}@test.local`, name: "Ada", role: "admin" },
      { id: ids.admin2, email: `a2-${tag}@test.local`, name: "Ben", role: "admin" },
      { id: ids.superAdmin, email: `sa-${tag}@test.local`, name: "Sue", role: "super_admin" },
      { id: ids.employee, email: `e-${tag}@test.local`, name: "Eve", role: "employee" },
    ]);
    await db.insert(users).values([
      { id: ids.report, email: `r-${tag}@test.local`, name: "Sam", role: "employee", managerId: ids.manager },
      { id: ids.other, email: `o-${tag}@test.local`, name: "Kim", role: "employee", managerId: ids.manager },
    ]);
    const [g] = await db
      .insert(profileDevelopmentGoals)
      .values({ userId: ids.report, framework: "colour", dimension: "red", targetDirection: "increase", setById: ids.manager })
      .returning({ id: profileDevelopmentGoals.id });
    goalId = g.id;
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await db.delete(profileDevelopmentGoals).where(eq(profileDevelopmentGoals.userId, ids.report));
    await db.delete(users).where(inArray(users.id, [ids.report, ids.other]));
    await db.delete(users).where(inArray(users.id, Object.values(ids)));
    // audit_log rows stay: the table refuses deletes, by design.
  });

  it("an admin without a grant sees no content", async () => {
    const res = await app.inject({ method: "GET", url: feedbackUrl(ids.report), headers: as(ids.admin) });
    expect(res.statusCode).toBe(403);
    const open = await app.inject({ method: "POST", url: `/api/v1/access-grants/open/${ids.report}`, headers: as(ids.admin) });
    expect(open.statusCode).toBe(404);
  });

  it("refuses a short reason, a future period, an over-long grant and self", async () => {
    expect((await grant(ids.admin, { ...base(ids.report), reason: "because" })).statusCode).toBe(400);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect((await grant(ids.admin, { ...base(ids.report), periodEnd: tomorrow })).statusCode).toBe(400);
    expect((await grant(ids.admin, { ...base(ids.report), days: 31 })).statusCode).toBe(400);
    expect((await grant(ids.admin, { ...base(ids.report), periodStart: daysAgo(400) })).statusCode).toBe(400);
    expect((await grant(ids.admin, base(ids.admin))).statusCode).toBe(400);
  });

  it("refuses and audits a non-admin who tries to break glass", async () => {
    for (const who of [ids.employee, ids.manager]) {
      expect((await grant(who, base(ids.report))).statusCode).toBe(403);
    }
    const denied = await audits("breakglass.denied", ids.report);
    expect(denied.map((d) => d.actorId)).toEqual(expect.arrayContaining([ids.employee, ids.manager]));
  });

  it("a grant opens reads, not writes, and every read is audited", async () => {
    const res = await grant(ids.admin, base(ids.report));
    expect(res.statusCode).toBe(201);
    const grantId = res.json().data.id as string;

    const [logged] = await audits("breakglass.grant", ids.report);
    expect(logged).toMatchObject({ actorId: ids.admin, reason: REASON, outcome: "granted" });
    expect(logged.details).toMatchObject({ grantId, hold: false });

    for (const url of [feedbackUrl(ids.report), profileUrl(ids.report)]) {
      const r = await app.inject({ method: "GET", url, headers: as(ids.admin) });
      expect(r.statusCode, url).toBe(200);
    }
    const reads = await audits("breakglass.read", ids.report);
    expect(reads.length).toBeGreaterThanOrEqual(2);
    expect(reads.every((r) => r.actorId === ids.admin && (r.details as { grantId?: string }).grantId === grantId)).toBe(true);

    // Read-only: changing a development goal is still refused.
    const write = await app.inject({
      method: "PATCH",
      url: `/api/v1/profiles/goals/${goalId}`,
      headers: as(ids.admin),
      payload: { status: "achieved" },
    });
    expect(write.statusCode).toBe(403);

    // Only this person: a colleague's content stays closed.
    const other = await app.inject({ method: "GET", url: feedbackUrl(ids.other), headers: as(ids.admin) });
    expect(other.statusCode).toBe(403);
    // Only this admin: another admin gets nothing from it.
    const admin2 = await app.inject({ method: "GET", url: feedbackUrl(ids.report), headers: as(ids.admin2) });
    expect(admin2.statusCode).toBe(403);

    // The web page's open call returns the grant and is logged as a view.
    const open = await app.inject({ method: "POST", url: `/api/v1/access-grants/open/${ids.report}`, headers: as(ids.admin) });
    expect(open.statusCode).toBe(200);
    expect(open.json().data).toMatchObject({ id: grantId, reason: REASON });
    expect((await audits("breakglass.view", ids.report)).length).toBe(1);

    // One active grant per admin and person.
    expect((await grant(ids.admin, base(ids.report))).statusCode).toBe(409);

    // The subject is told straight away when there's no hold, without the reason.
    const mine = await app.inject({ method: "GET", url: "/api/v1/access-grants/about-me", headers: as(ids.report) });
    expect(mine.statusCode).toBe(200);
    const seen = mine.json().data as Array<Record<string, unknown>>;
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ id: grantId, granteeName: "Ada", status: "active" });
    expect(seen[0]).not.toHaveProperty("reason");

    // Another admin can't revoke it; a super admin can.
    const byAdmin2 = await app.inject({ method: "POST", url: `/api/v1/access-grants/${grantId}/revoke`, headers: as(ids.admin2) });
    expect(byAdmin2.statusCode).toBe(403);
    const revoke = await app.inject({ method: "POST", url: `/api/v1/access-grants/${grantId}/revoke`, headers: as(ids.superAdmin) });
    expect(revoke.statusCode).toBe(200);
    expect(revoke.json().data.status).toBe("revoked");
    expect((await audits("breakglass.revoke", ids.report))[0]).toMatchObject({ actorId: ids.superAdmin });

    const after = await app.inject({ method: "GET", url: feedbackUrl(ids.report), headers: as(ids.admin) });
    expect(after.statusCode).toBe(403);
  });

  it("a hold keeps the subject uninformed until it is lifted", async () => {
    const res = await grant(ids.admin, { ...base(ids.other), holdReason: "Investigation in progress, notifying would prejudice it" });
    expect(res.statusCode).toBe(201);
    const grantId = res.json().data.id as string;

    const before = await app.inject({ method: "GET", url: "/api/v1/access-grants/about-me", headers: as(ids.other) });
    expect(before.json().data).toHaveLength(0);

    // The admin's own list marks it on hold; a super admin sees it too.
    const list = await app.inject({ method: "GET", url: "/api/v1/access-grants", headers: as(ids.admin) });
    expect(list.json().data.find((g: { id: string }) => g.id === grantId)).toMatchObject({ onHold: true, subjectName: "Kim" });
    const all = await app.inject({ method: "GET", url: "/api/v1/access-grants", headers: as(ids.superAdmin) });
    expect(all.json().data.some((g: { id: string }) => g.id === grantId)).toBe(true);
    const other = await app.inject({ method: "GET", url: "/api/v1/access-grants", headers: as(ids.admin2) });
    expect(other.json().data.some((g: { id: string }) => g.id === grantId)).toBe(false);

    const lift = await app.inject({ method: "POST", url: `/api/v1/access-grants/${grantId}/lift-hold`, headers: as(ids.admin) });
    expect(lift.statusCode).toBe(200);
    expect((await audits("breakglass.hold_lifted", ids.other)).length).toBe(1);

    const now = await app.inject({ method: "GET", url: "/api/v1/access-grants/about-me", headers: as(ids.other) });
    expect(now.json().data).toHaveLength(1);
  });

  it("a hold ends with the grant, and a demoted admin loses the grant", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/access-grants",
      headers: as(ids.superAdmin),
      payload: { ...base(ids.report), holdReason: "Investigation in progress, notifying would prejudice it" },
    });
    expect(res.statusCode).toBe(201);
    const grantId = res.json().data.id as string;
    const hidden = await app.inject({ method: "GET", url: "/api/v1/access-grants/about-me", headers: as(ids.report) });
    expect(hidden.json().data.some((g: { id: string }) => g.id === grantId)).toBe(false);

    // Wind the clock on: an expired grant is shown whatever the hold.
    await db.execute(sql`UPDATE access_grants SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day' WHERE id = ${grantId}`);
    const shown = await app.inject({ method: "GET", url: "/api/v1/access-grants/about-me", headers: as(ids.report) });
    expect(shown.json().data.find((g: { id: string }) => g.id === grantId)).toMatchObject({ status: "expired" });

    // Demotion: a grant stops working when its holder is no longer an admin.
    expect((await grant(ids.admin2, base(ids.report))).statusCode).toBe(201);
    await db.update(users).set({ role: "manager" }).where(eq(users.id, ids.admin2));
    const demoted = await app.inject({ method: "GET", url: feedbackUrl(ids.report), headers: as(ids.admin2) });
    expect(demoted.statusCode).toBe(403);
  });

  it("the database refuses a grant longer than 30 days", async () => {
    await expect(
      db.insert(accessGrants).values({
        granteeId: ids.superAdmin,
        subjectId: ids.report,
        reason: REASON,
        periodStart: daysAgo(10),
        periodEnd: today(),
        expiresAt: new Date(Date.now() + 31 * 86_400_000),
      }),
    ).rejects.toThrow();
  });
});
