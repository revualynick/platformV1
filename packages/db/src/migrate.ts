import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export interface MigrationOptions {
  /** Tier A pseudonym secret; defaults to REVIEWER_PSEUDONYM_SECRET. */
  pseudonymSecret?: string;
  /** Defaults to ORG_ID. */
  orgId?: string;
}

/**
 * Apply pending migrations. The pseudonym secret and org id travel as
 * session settings (never as SQL text), so migration 0043 can convert
 * existing reviewer ids to reviewer_ref in the database.
 */
export async function runMigrations(connectionString: string, opts: MigrationOptions = {}): Promise<void> {
  const secret = opts.pseudonymSecret ?? process.env.REVIEWER_PSEUDONYM_SECRET;
  const orgId = opts.orgId ?? process.env.ORG_ID;
  const connection: Record<string, string> = {};
  if (secret) connection["revualy.pseudonym_secret"] = secret;
  if (orgId) connection["revualy.org_id"] = orgId;
  const sql = postgres(connectionString, { max: 1, connection });
  const db = drizzle(sql);
  try {
    await migrate(db, {
      migrationsFolder: new URL("./migrations", import.meta.url).pathname,
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
