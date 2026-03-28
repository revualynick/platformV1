import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as tenantSchema from "./schema/tenant.js";

type TenantClient = ReturnType<typeof createTenantClient>;
export type TenantDb = TenantClient["db"];

// Single-instance cache (one DB per deployment)
let cachedClient: { db: TenantDb; sql: ReturnType<typeof postgres> } | null =
  null;

export function createTenantClient(connectionString: string) {
  const sql = postgres(connectionString, { max: 10 });
  const db = drizzle(sql, { schema: tenantSchema });
  return { db, sql };
}

/**
 * Get the tenant database connection.
 * Per-tenant deployment: single DB instance, cached after first call.
 */
export function getTenantDb(
  _orgId: string,
  connectionString: string,
): TenantDb {
  if (cachedClient) return cachedClient.db;
  cachedClient = createTenantClient(connectionString);
  return cachedClient.db;
}

export async function closeAllTenantDbs(): Promise<void> {
  if (cachedClient) {
    await cachedClient.sql.end({ timeout: 5 });
    cachedClient = null;
  }
}

export async function runMigrations(connectionString: string): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);
  try {
    await migrate(db, {
      migrationsFolder: new URL("./migrations", import.meta.url).pathname,
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
