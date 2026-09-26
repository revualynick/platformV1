import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { LLMGateway } from "@revualy/ai-core";
import { getTenantDb, users, checkInMeetings, orgSettings } from "@revualy/db";
import { runCheckInPipeline, type MeetingSource } from "../lib/check-in-pipeline.js";
import { buildApp } from "../server.js";

/**
 * Admin limit + manager choice for 1:1 ingestion (2026-09-26): the mode
 * routes, the admin's limit clamping the default, recent imports limited to
 * the people in the 1:1, and the pipeline reading only for managers whose
 * effective mode allows it.
 */

const DB_URL = process.env.DATABASE_URL!;
const SECRET = process.env.INTERNAL_API_SECRET!;
const db = getTenantDb(process.env.ORG_ID!, DB_URL);

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

describe.skipIf(!dbUp)("1:1 ingestion modes (integration)", () => {
  const tag = crypto.randomUUID().slice(0, 8);
  const ids = {
    admin: crypto.randomUUID(),
    autoManager: crypto.randomUUID(),
    manualManager: crypto.randomUUID(),
    report: crypto.randomUUID(),
    report2: crypto.randomUUID(),
    outsider: crypto.randomUUID(),
  };
  const email = (k: string) => `${k}-${tag}@test.local`;
  const as = (userId: string) => ({ "x-internal-secret": SECRET, "x-user-id": userId });
  let app: FastifyInstance;
  let original: { id: string; max: string; def: string } | null = null;
  let createdSettings = false;

  const eventFor = (managerKey: "autoManager" | "manualManager", reportKey: "report" | "report2") => {
    const start = new Date(Date.now() - 3 * 60 * 60 * 1000);
    return {
      externalEventId: `evt-${managerKey}-${tag}`,
      title: "1:1",
      attendees: [email(managerKey), email(reportKey)],
      declined: [],
      visibility: "default",
      startAt: start,
      endAt: new Date(start.getTime() + 30 * 60_000),
      organizerEmail: email(managerKey),
      attachments: [],
    };
  };
  const source: MeetingSource = {
    listPastEvents: async (user) =>
      user.id === ids.autoManager
        ? [eventFor("autoManager", "report")]
        : user.id === ids.manualManager
          ? [eventFor("manualManager", "report2")]
          : [],
    findMeetingDocs: async () => null,
    exportDocText: async () => null,
  };
  const noLLM = { complete: async () => { throw new Error("not used"); } } as unknown as LLMGateway;
  const noGoogle = {
    getFreshAccessToken: async () => null,
  } as unknown as Parameters<typeof runCheckInPipeline>[3];

  async function setLimits(max: string, def: string) {
    const [row] = await db.select({ id: orgSettings.id }).from(orgSettings).limit(1);
    await db.update(orgSettings).set({ oneOnOneMaxMode: max, oneOnOneIngestionMode: def }).where(eq(orgSettings.id, row.id));
  }

  beforeAll(async () => {
    const [existing] = await db
      .select({ id: orgSettings.id, max: orgSettings.oneOnOneMaxMode, def: orgSettings.oneOnOneIngestionMode })
      .from(orgSettings)
      .limit(1);
    if (existing) original = existing;
    else {
      await db.insert(orgSettings).values({ name: "Test org" });
      createdSettings = true;
    }
    await db.insert(users).values([
      { id: ids.admin, email: email("admin"), name: "Ada", role: "admin" },
      { id: ids.autoManager, email: email("autoManager"), name: "Jo", role: "manager" },
      { id: ids.manualManager, email: email("manualManager"), name: "Mo", role: "manager" },
      { id: ids.report, email: email("report"), name: "Sam", role: "employee", managerId: ids.autoManager },
      { id: ids.report2, email: email("report2"), name: "Kit", role: "employee", managerId: ids.manualManager },
      { id: ids.outsider, email: email("outsider"), name: "Pat", role: "employee" },
    ]);
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    const all = Object.values(ids);
    await db.delete(checkInMeetings).where(inArray(checkInMeetings.organizerId, all));
    await db.delete(users).where(inArray(users.id, all));
    if (original) {
      await db.update(orgSettings).set({ oneOnOneMaxMode: original.max, oneOnOneIngestionMode: original.def }).where(eq(orgSettings.id, original.id));
    } else if (createdSettings) {
      await db.delete(orgSettings);
    }
  });

  it("shows a manager what they may choose; automatic isn't offered while no source exists", async () => {
    await setLimits("automatic", "semi_automatic");
    const res = await app.inject({ method: "GET", url: "/api/v1/one-on-one-sessions/ingestion-mode", headers: as(ids.autoManager) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      allowed: ["manual", "semi_automatic"],
      choice: null,
      effective: "semi_automatic",
      automaticAvailable: false,
      driveConnected: false,
    });
  });

  it("lets a manager choose within the limit, refuses above it, and resets to the default", async () => {
    await setLimits("semi_automatic", "semi_automatic");
    const url = "/api/v1/one-on-one-sessions/ingestion-mode";
    const above = await app.inject({ method: "PUT", url, headers: as(ids.manualManager), payload: { mode: "automatic" } });
    expect(above.statusCode).toBe(403);

    const manual = await app.inject({ method: "PUT", url, headers: as(ids.manualManager), payload: { mode: "manual" } });
    expect(manual.statusCode).toBe(200);
    const after = await app.inject({ method: "GET", url, headers: as(ids.manualManager) });
    expect(after.json()).toMatchObject({ choice: "manual", effective: "manual" });

    const reset = await app.inject({ method: "PUT", url, headers: as(ids.manualManager), payload: { mode: null } });
    expect(reset.statusCode).toBe(200);
    const [row] = await db.select({ mode: users.oneOnOneIngestionMode }).from(users).where(eq(users.id, ids.manualManager));
    expect(row.mode).toBeNull();
  });

  it("lowering the admin limit lowers the default with it", async () => {
    await setLimits("semi_automatic", "semi_automatic");
    const res = await app.inject({ method: "PATCH", url: "/api/v1/admin/org", headers: as(ids.admin), payload: { oneOnOneMaxMode: "manual" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ oneOnOneMaxMode: "manual", oneOnOneIngestionMode: "manual" });

    const managerView = await app.inject({ method: "GET", url: "/api/v1/one-on-one-sessions/ingestion-mode", headers: as(ids.autoManager) });
    expect(managerView.json()).toMatchObject({ allowed: ["manual"], effective: "manual" });
  });

  it("only an admin can change the limit", async () => {
    const res = await app.inject({ method: "PATCH", url: "/api/v1/admin/org", headers: as(ids.autoManager), payload: { oneOnOneMaxMode: "automatic" } });
    expect(res.statusCode).toBe(403);
  });

  it("the pipeline reads only for managers whose mode allows it", async () => {
    await setLimits("automatic", "automatic");
    await db.update(users).set({ oneOnOneIngestionMode: "manual" }).where(eq(users.id, ids.manualManager));
    await db.update(users).set({ oneOnOneIngestionMode: null }).where(eq(users.id, ids.autoManager));

    await runCheckInPipeline(db, noLLM, { log: () => {}, warn: () => {}, error: () => {} } as unknown as Console, noGoogle, { automaticSource: source });

    const found = await db
      .select({ organizerId: checkInMeetings.organizerId, source: checkInMeetings.source })
      .from(checkInMeetings)
      .where(inArray(checkInMeetings.organizerId, [ids.autoManager, ids.manualManager]));
    expect(found).toEqual([{ organizerId: ids.autoManager, source: "automatic" }]);
  });

  it("recent imports are visible to the two people in the 1:1 and nobody else", async () => {
    const url = "/api/v1/one-on-one-sessions/imports/recent";
    const forManager = await app.inject({ method: "GET", url, headers: as(ids.autoManager) });
    const forReport = await app.inject({ method: "GET", url, headers: as(ids.report) });
    const forOutsider = await app.inject({ method: "GET", url, headers: as(ids.outsider) });
    expect(forManager.json().data).toHaveLength(1);
    expect(forReport.json().data).toHaveLength(1);
    expect(forOutsider.json().data).toHaveLength(0);
  });
});
