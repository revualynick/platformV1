import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getTenantDb, users, checkInMeetings } from "@revualy/db";
import {
  selectMeetingsToProcess,
  statusAfterFailure,
  PROCESSING_MAX_ATTEMPTS,
} from "../lib/check-in-pipeline.js";

/**
 * Review fix B3: the check-in pipeline must not retry permanent failures
 * for ever, must bound LLM retries, and must recover rows abandoned in
 * "processing". Selection runs against a real Postgres (self-skips).
 */

describe("statusAfterFailure", () => {
  it("permanent errors fail immediately", () => {
    expect(statusAfterFailure("google_auth_error", 1)).toBe("failed");
    expect(statusAfterFailure("transcript_export_failed", 1)).toBe("failed");
  });

  it("transient errors retry until the budget is spent", () => {
    for (let n = 1; n < PROCESSING_MAX_ATTEMPTS; n++) {
      expect(statusAfterFailure("llm_error", n)).toBe("pending_transcript");
    }
    expect(statusAfterFailure("llm_error", PROCESSING_MAX_ATTEMPTS)).toBe("failed");
    expect(statusAfterFailure("network_error", PROCESSING_MAX_ATTEMPTS + 3)).toBe("failed");
  });
});

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

describe.skipIf(!dbUp)("selectMeetingsToProcess (integration)", () => {
  const organizer = crypto.randomUUID();
  const minsAgo = (m: number) => new Date(Date.now() - m * 60_000);
  const rows: Record<string, string> = {};

  beforeAll(async () => {
    await db.insert(users).values({ id: organizer, email: `org-${organizer.slice(0, 8)}@test.local`, name: "Org" });
    const make = async (key: string, status: string, lastAttemptAt: Date | null) => {
      const [r] = await db
        .insert(checkInMeetings)
        .values({
          organizerId: organizer,
          externalEventId: `${key}-${organizer}`,
          title: key,
          eventStart: minsAgo(120),
          status,
          lastAttemptAt,
        })
        .returning({ id: checkInMeetings.id });
      rows[key] = r.id;
    };
    await make("failedRecently", "failed", minsAgo(5));
    await make("pendingNew", "pending_transcript", null);
    await make("pendingRetried", "pending_transcript", minsAgo(30));
    await make("processingFresh", "processing", minsAgo(5));
    await make("processingStale", "processing", minsAgo(180));
    await make("done", "processed", minsAgo(10));
  });

  afterAll(async () => {
    await db.delete(checkInMeetings).where(eq(checkInMeetings.organizerId, organizer));
    await db.delete(users).where(eq(users.id, organizer));
  });

  it("never re-selects failed rows, and recovers only stale processing rows", async () => {
    const picked = (await selectMeetingsToProcess(db, 1000))
      .filter((m) => m.organizerId === organizer)
      .map((m) => m.title);
    expect(picked).not.toContain("failedRecently");
    expect(picked).not.toContain("processingFresh");
    expect(picked).not.toContain("done");
    expect(picked).toEqual(expect.arrayContaining(["pendingNew", "pendingRetried", "processingStale"]));
  });

  it("serves never-attempted meetings first so retries cannot crowd them out", async () => {
    const picked = (await selectMeetingsToProcess(db, 1000))
      .filter((m) => m.organizerId === organizer)
      .map((m) => m.title);
    expect(picked.indexOf("pendingNew")).toBeLessThan(picked.indexOf("pendingRetried"));
    expect(picked.indexOf("processingStale")).toBeLessThan(picked.indexOf("pendingRetried"));
  });
});
