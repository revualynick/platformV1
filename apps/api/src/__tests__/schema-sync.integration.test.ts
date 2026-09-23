import { describe, it, expect } from "vitest";
import { sql, is, getTableName } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "@revualy/db/schema";
import { getTenantDb, inboundMessages, userPlatformIdentities, users } from "@revualy/db";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";

/**
 * Migrations in this repo are hand-written SQL (drizzle-kit generate is
 * unusable: only the 0000 snapshot exists), so nothing else checks that the
 * Drizzle schema matches the real database. Selecting every declared column
 * of every table catches a missing or misnamed column immediately.
 * Self-skips without a database.
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
// Cast to one concrete table type: the API and @revualy/db resolve separate
// copies of drizzle's PgTable type, so a type predicate does not line up.
type AnyTable = typeof schema.users;
const tables = Object.values(schema).filter((v) => is(v, PgTable)) as unknown as AnyTable[];

describe.skipIf(!dbUp)("Drizzle schema matches the migrated database", () => {
  it("finds tables to check", () => {
    expect(tables.length).toBeGreaterThan(40);
  });

  it.each(tables.map((t) => [getTableName(t), t] as const))(
    "every declared column of %s exists",
    async (_name, table) => {
      await expect(db.select().from(table).limit(1)).resolves.toBeDefined();
    },
  );

  it("new C3 columns round-trip, with inbound content encrypted", async () => {
    const userId = crypto.randomUUID();
    await db.insert(users).values({ id: userId, email: `sync-${userId}@test.local`, name: "Sync" });
    try {
      const [identity] = await db
        .insert(userPlatformIdentities)
        .values({
          userId,
          platform: "google_chat",
          platformUserId: `users/${userId}`,
          status: "reachable",
          dmAddress: "spaces/test",
          linkSource: "auto",
        })
        .returning();
      expect(identity.displayName).toBe("");
      expect(identity.confirmedAt).toBeNull();

      const [msg] = await db
        .insert(inboundMessages)
        .values({
          platform: "google_chat",
          platformMessageId: `m-${userId}`,
          platformUserId: `users/${userId}`,
          platformChannelId: "spaces/test",
          content: "an inbound message",
          userId,
        })
        .returning();
      expect(msg.content).toBe("an inbound message");
      expect(msg.status).toBe("pending");
      const raw = (await db.execute(
        sql`select content from inbound_messages where id = ${msg.id}`,
      )) as unknown as Array<{ content: string }>;
      expect(raw[0].content.startsWith("enc:v1:")).toBe(true);
    } finally {
      await db.delete(inboundMessages).where(eq(inboundMessages.userId, userId));
      await db.delete(userPlatformIdentities).where(eq(userPlatformIdentities.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
  });
});
