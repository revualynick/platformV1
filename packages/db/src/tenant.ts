import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as tenantSchema from "./schema/tenant.js";

export type TenantDb = ReturnType<typeof createTenantClient>;

const tenantPool = new Map<string, TenantDb>();

export function createTenantClient(connectionString: string) {
  const sql = postgres(connectionString, { max: 5 });
  return drizzle(sql, { schema: tenantSchema });
}

/**
 * Get or create a tenant database connection.
 * Connections are pooled per org to avoid excessive connections.
 */
export function getTenantDb(orgId: string, connectionString: string): TenantDb {
  let db = tenantPool.get(orgId);
  if (!db) {
    db = createTenantClient(connectionString);
    tenantPool.set(orgId, db);
  }
  return db;
}

export function closeTenantDb(orgId: string): void {
  tenantPool.delete(orgId);
}

export function closeAllTenantDbs(): void {
  tenantPool.clear();
}
