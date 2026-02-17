import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as tenantSchema from "./schema/tenant.js";

type TenantClient = ReturnType<typeof createTenantClient>;
export type TenantDb = TenantClient["db"];

const MAX_POOL_SIZE = 50;

interface PoolEntry {
  db: TenantDb;
  sql: ReturnType<typeof postgres>;
  lastUsed: number;
}

const tenantPool = new Map<string, PoolEntry>();

export function createTenantClient(connectionString: string) {
  const sql = postgres(connectionString, { max: 5 });
  const db = drizzle(sql, { schema: tenantSchema });
  return { db, sql };
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
      const evicted = tenantPool.get(oldestKey);
      tenantPool.delete(oldestKey);
      // Close the underlying postgres connection pool
      evicted?.sql.end({ timeout: 5 }).catch(() => {});
    }
  }

  const { db, sql } = createTenantClient(connectionString);
  tenantPool.set(orgId, { db, sql, lastUsed: Date.now() });
  return db;
}

export async function closeTenantDb(orgId: string): Promise<void> {
  const entry = tenantPool.get(orgId);
  tenantPool.delete(orgId);
  if (entry) {
    await entry.sql.end({ timeout: 5 });
  }
}

export async function closeAllTenantDbs(): Promise<void> {
  const entries = [...tenantPool.values()];
  tenantPool.clear();
  await Promise.allSettled(entries.map((e) => e.sql.end({ timeout: 5 })));
}
