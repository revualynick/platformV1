import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as tenantSchema from "./schema/tenant.js";

export type TenantDb = ReturnType<typeof createTenantClient>;

const MAX_POOL_SIZE = 50;

interface PoolEntry {
  db: TenantDb;
  lastUsed: number;
}

const tenantPool = new Map<string, PoolEntry>();

export function createTenantClient(connectionString: string) {
  const sql = postgres(connectionString, { max: 5 });
  return drizzle(sql, { schema: tenantSchema });
}

/**
 * Get or create a tenant database connection.
 * Connections are pooled per org with LRU eviction to prevent unbounded growth.
 */
export function getTenantDb(orgId: string, connectionString: string): TenantDb {
  const entry = tenantPool.get(orgId);
  if (entry) {
    entry.lastUsed = Date.now();
    return entry.db;
  }

  // Evict least-recently-used entry if at capacity
  if (tenantPool.size >= MAX_POOL_SIZE) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, e] of tenantPool) {
      if (e.lastUsed < oldestTime) {
        oldestTime = e.lastUsed;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      tenantPool.delete(oldestKey);
    }
  }

  const db = createTenantClient(connectionString);
  tenantPool.set(orgId, { db, lastUsed: Date.now() });
  return db;
}

export function closeTenantDb(orgId: string): void {
  tenantPool.delete(orgId);
}

export function closeAllTenantDbs(): void {
  tenantPool.clear();
}
