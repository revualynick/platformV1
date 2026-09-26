import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import {
  createTenantClient,
  users,
  managerNotes,
  calibrationReports,
  threeSixtyReviews,
  discoveredThemes,
  integrations,
  calendarTokens,
} from "@revualy/db";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import {
  encryptionStatus,
  rewriteEncryptedColumns,
  retirementReport,
  encryptedColumns,
  looksLikePlaintextSecret,
} from "@revualy/db/encryption-maintenance";
import { resetKeyringForTests, decrypt, configuredKeyIds } from "@revualy/shared/server";

/**
 * Backfill, plaintext check and rotation against a throwaway database
 * (created, migrated and dropped here), so the shared dev database and
 * other test runs are never touched. Self-skips without Postgres.
 */

const BASE_URL = process.env.DATABASE_URL!;
const TEST_KEY = "0123456789abcdef".repeat(4);
const NEW_KEY = "fedcba9876543210".repeat(4);
const dbName = `revualy_enc_${crypto.randomUUID().slice(0, 8)}`;
const url = (() => {
  const u = new URL(BASE_URL);
  u.pathname = `/${dbName}`;
  return u.toString();
})();

const admin = createTenantClient(BASE_URL);
async function adminReachable(): Promise<boolean> {
  const timeout = new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 3000));
  try {
    await Promise.race([admin.sql`select 1`, timeout]);
    return true;
  } catch {
    return false;
  }
}
const dbUp = await adminReachable();

function legacySharedFormat(plain: string, keyHex: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}
function legacyApiFormat(plain: string, keyHex: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}

function useKeys(keys: string | null, legacyReads?: "on" | "off") {
  if (keys) process.env.ENCRYPTION_KEYS = keys;
  else delete process.env.ENCRYPTION_KEYS;
  if (legacyReads) process.env.ENCRYPTION_LEGACY_READS = legacyReads;
  else delete process.env.ENCRYPTION_LEGACY_READS;
  resetKeyringForTests();
}

describe.skipIf(!dbUp)("encryption backfill, check and rotation (integration)", () => {
  let client: ReturnType<typeof createTenantClient>;
  const managerId = crypto.randomUUID();
  const employeeId = crypto.randomUUID();

  beforeAll(async () => {
    await admin.sql.unsafe(`create database ${dbName}`);
    client = createTenantClient(url);
    await migrate(client.db, { migrationsFolder: new URL("../../../../packages/db/src/migrations", import.meta.url).pathname });
    await client.db.insert(users).values([
      { id: managerId, email: "m@test.local", name: "Manager", role: "manager" },
      { id: employeeId, email: "e@test.local", name: "Employee", role: "employee" },
    ]);
  }, 60_000);

  afterEach(() => useKeys(null));

  afterAll(async () => {
    useKeys(null);
    await client?.sql.end({ timeout: 5 });
    await admin.sql.unsafe(`drop database if exists ${dbName} with (force)`);
    await admin.sql.end({ timeout: 5 });
  });

  it("registers every encrypted column, including tier 2 and secrets", () => {
    const names = encryptedColumns().map((c) => `${c.table}.${c.column}`);
    for (const n of [
      "conversation_messages.content",
      "feedback_digests.data",
      "three_sixty_reviews.aggregated_data",
      "discovered_themes.sample_evidence",
      "calibration_reports.data",
      "assessment_sessions.responses",
      "profile_development_goals.notes",
      "auth_account.id_token",
      "integrations.config",
    ]) {
      expect(names).toContain(n);
    }
  });

  it("writes tier-2 jsonb encrypted, keeps SQL NULL and empty JSON, reads back through Drizzle", async () => {
    const [r] = await client.db
      .insert(threeSixtyReviews)
      .values({ subjectId: employeeId, initiatedById: managerId, aggregatedData: { quote: "Sam is great" } })
      .returning();
    const [raw] = await client.sql`select aggregated_data::text as v, jsonb_typeof(aggregated_data) as t from three_sixty_reviews where id = ${r.id}`;
    expect(raw.t).toBe("string");
    expect(raw.v).toMatch(/^"enc:v1:k1:/);
    expect(raw.v).not.toContain("Sam");
    const [read] = await client.db.select().from(threeSixtyReviews).where(eq(threeSixtyReviews.id, r.id));
    expect(read.aggregatedData).toEqual({ quote: "Sam is great" });

    const [n] = await client.db
      .insert(threeSixtyReviews)
      .values({ subjectId: employeeId, initiatedById: managerId, aggregatedData: null })
      .returning();
    const [rawNull] = await client.sql`select aggregated_data is null as is_null from three_sixty_reviews where id = ${n.id}`;
    expect(rawNull.is_null).toBe(true);

    const [t] = await client.db
      .insert(discoveredThemes)
      .values({ name: "empty", description: "", sampleEvidence: [] })
      .returning();
    const [rawEmpty] = await client.sql`select sample_evidence::text as v from discovered_themes where id = ${t.id}`;
    expect(rawEmpty.v).toBe("[]");
  });

  it("check finds legacy rows, backfill rewrites them, check then passes", async () => {
    // Legacy rows written directly, as they were before encryption.
    await client.sql`insert into manager_notes (manager_id, subject_id, content) values (${managerId}, ${employeeId}, 'legacy plaintext note')`;
    await client.sql`insert into calibration_reports (org_id, week_starting, data) values ('o', '2026-01-05', ${JSON.stringify({ note: "legacy report" })}::jsonb)`;
    await client.sql`insert into discovered_themes (name, description, sample_evidence) values ('t', '', ${JSON.stringify(["said it plainly"])}::jsonb)`;
    const [cal] = await client.sql`
      insert into calendar_tokens (user_id, provider, access_token, refresh_token, expires_at)
      values (${managerId}, 'google', ${legacySharedFormat("ya29.old-access", TEST_KEY)}, 'plain.refresh-token', now())
      returning id, updated_at`;
    await client.sql`insert into integrations (platform, name, config) values ('slack', 'Slack', ${JSON.stringify({ _encrypted: legacyApiFormat('{"botToken":"xoxb"}', TEST_KEY) })}::jsonb)`;
    await client.sql`insert into integrations (platform, name, config) values ('teams', 'Teams', ${JSON.stringify({ appId: "plain-config" })}::jsonb)`;
    // An undecryptable pre-v1-looking value: reported, never rewritten.
    await client.sql`
      insert into calendar_tokens (user_id, provider, access_token, refresh_token, expires_at)
      values (${employeeId}, 'google', ${legacySharedFormat("x", NEW_KEY)}, ${legacySharedFormat("y", TEST_KEY)}, now())`;

    const before = await encryptionStatus(client.sql);
    const notV1 = Object.fromEntries(before.map((s) => [`${s.table}.${s.column}`, s.notV1]));
    expect(notV1["manager_notes.content"]).toBe(1);
    expect(notV1["calibration_reports.data"]).toBe(1);
    expect(notV1["discovered_themes.sample_evidence"]).toBe(1);
    expect(notV1["calendar_tokens.access_token"]).toBe(2);
    expect(notV1["calendar_tokens.refresh_token"]).toBe(2);
    expect(notV1["integrations.config"]).toBe(2);
    expect(before.every((s) => s.present)).toBe(true);

    const results = await rewriteEncryptedColumns(client.sql, { target: "v1", batchSize: 1, pauseMs: 0 });
    const byName = Object.fromEntries(results.map((r) => [`${r.table}.${r.column}`, r]));
    expect(byName["manager_notes.content"].rewritten).toBe(1);
    expect(byName["calendar_tokens.access_token"].rewritten).toBe(1);
    expect(byName["calendar_tokens.access_token"].unreadable).toBe(1);
    expect(byName["calendar_tokens.refresh_token"].rewritten).toBe(2);

    const after = await encryptionStatus(client.sql);
    const left = after.filter((s) => s.notV1 > 0).map((s) => `${s.table}.${s.column}=${s.notV1}`);
    expect(left).toEqual(["calendar_tokens.access_token=1"]);

    // Values read back correctly, with legacy reads switched off.
    useKeys(`k1:${TEST_KEY}`, "off");
    const notes = await client.db.select().from(managerNotes).where(eq(managerNotes.managerId, managerId));
    expect(notes.map((n) => n.content)).toContain("legacy plaintext note");
    const [report] = await client.db.select().from(calibrationReports);
    expect(report.data).toEqual({ note: "legacy report" });
    const [tok] = await client.db.select().from(calendarTokens).where(eq(calendarTokens.id, cal.id));
    expect(decrypt(tok.accessToken)).toBe("ya29.old-access");
    expect(decrypt(tok.refreshToken)).toBe("plain.refresh-token");
    const ints = await client.db.select().from(integrations);
    const configs = Object.fromEntries(ints.map((i) => [i.platform, JSON.parse(decrypt(i.config._encrypted as string))]));
    expect(configs).toEqual({ slack: { botToken: "xoxb" }, teams: { appId: "plain-config" } });

    // updated_at untouched by the backfill (migration 0042).
    const [calAfter] = await client.sql`select updated_at from calendar_tokens where id = ${cal.id}`;
    expect(String(calAfter.updated_at)).toBe(String(cal.updated_at));

    // Idempotent: a rerun finds only the unreadable row.
    useKeys(null);
    const again = await rewriteEncryptedColumns(client.sql, { target: "v1", pauseMs: 0 });
    expect(again.reduce((n, r) => n + r.rewritten, 0)).toBe(0);

    await client.sql`delete from calendar_tokens where user_id = ${employeeId}`;
    expect((await encryptionStatus(client.sql)).every((s) => s.notV1 === 0)).toBe(true);
  });

  it("refuses legacy plaintext through Drizzle once ENCRYPTION_LEGACY_READS=off", async () => {
    const subject = crypto.randomUUID();
    await client.db.insert(users).values({ id: subject, email: `s-${subject}@test.local`, name: "S", role: "employee" });
    await client.sql`insert into manager_notes (manager_id, subject_id, content) values (${managerId}, ${subject}, 'not yet backfilled')`;
    useKeys(`k1:${TEST_KEY}`, "off");
    await expect(client.db.select().from(managerNotes).where(eq(managerNotes.subjectId, subject))).rejects.toThrow(
      /ENCRYPTION_LEGACY_READS=off/,
    );
    useKeys(null, "on");
    const [row] = await client.db.select().from(managerNotes).where(eq(managerNotes.subjectId, subject));
    expect(row.content).toBe("not yet backfilled");
    useKeys(null);
    await rewriteEncryptedColumns(client.sql, { target: "v1", only: ["manager_notes"], pauseMs: 0 });
  });

  it("never overwrites a value the app changed after the backfill read it", async () => {
    const subject = crypto.randomUUID();
    await client.db.insert(users).values({ id: subject, email: `r-${subject}@test.local`, name: "R", role: "employee" });
    for (let i = 0; i < 5; i++) {
      await client.sql`insert into manager_notes (manager_id, subject_id, content) values (${managerId}, ${subject}, ${"old " + i})`;
    }
    let raced = false;
    const results = await rewriteEncryptedColumns(client.sql, {
      target: "v1",
      only: ["manager_notes.content"],
      batchSize: 2,
      pauseMs: 0,
      beforeWrite: async () => {
        if (raced) return;
        raced = true;
        // The app writes every row after the backfill read its first batch.
        await client.db.update(managerNotes).set({ content: "app wrote this" }).where(eq(managerNotes.subjectId, subject));
      },
    });
    const rows = await client.db.select().from(managerNotes).where(eq(managerNotes.subjectId, subject));
    expect(rows.map((r) => r.content)).toEqual(Array(5).fill("app wrote this"));
    expect(results[0].raced).toBe(2);
    expect(results[0].unreadable).toBe(0);
  });

  it("rotates to a new key, then reports the old key as retirable", async () => {
    useKeys(`k2:${NEW_KEY},k1:${TEST_KEY}`);
    const before = retirementReport(await encryptionStatus(client.sql), configuredKeyIds());
    expect(before.inUse.k1).toBeGreaterThan(0);
    expect(before.retirable).toEqual([]);

    await rewriteEncryptedColumns(client.sql, { target: "current-key", currentKeyId: "k2", batchSize: 3, pauseMs: 0 });
    const status = await encryptionStatus(client.sql);
    const after = retirementReport(status, configuredKeyIds());
    expect(after.inUse.k1).toBeUndefined();
    expect(after.retirable).toEqual(["k1"]);
    expect(after.unknown).toEqual({});

    // With k1 gone, everything still reads.
    useKeys(`k2:${NEW_KEY}`, "off");
    const notes = await client.db.select().from(managerNotes);
    expect(notes.length).toBeGreaterThan(0);
    const [report] = await client.db.select().from(calibrationReports);
    expect(report.data).toEqual({ note: "legacy report" });
  });

  it("reports values under a key that is not configured", async () => {
    useKeys(`k3:${"ab".repeat(32)}`);
    const r = retirementReport(await encryptionStatus(client.sql), configuredKeyIds());
    expect(Object.keys(r.unknown)).toEqual(["k2"]);
  });

  it("tells plaintext tokens apart from pre-v1 ciphertext", () => {
    expect(looksLikePlaintextSecret("ya29.a0AfH6SMB")).toBe(true);
    expect(looksLikePlaintextSecret("1//0gAbc-def_ghi")).toBe(true);
    expect(looksLikePlaintextSecret(legacySharedFormat("x", TEST_KEY))).toBe(false);
    expect(looksLikePlaintextSecret(legacyApiFormat("x", TEST_KEY))).toBe(false);
  });
});
