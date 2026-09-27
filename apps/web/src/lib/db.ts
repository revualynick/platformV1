import "server-only";
import { createTenantClient, type TenantDb } from "@revualy/db";

// Persist the pool on globalThis so Next.js dev HMR (which re-evaluates modules
// on every edit) reuses one connection pool instead of leaking a new pool per
// reload, which otherwise exhausts Postgres' max_connections during dev.
const globalForDb = globalThis as unknown as { __revualyWebDb?: TenantDb };

/**
 * Singleton DB client for web server components.
 * Pool size defaults to 5 (smaller than API's 10) via DB_POOL_MAX_WEB.
 * Uses a lazy-connect fallback URL for `next build` static analysis.
 */
export function getDb(): TenantDb {
  if (globalForDb.__revualyWebDb) return globalForDb.__revualyWebDb;

  const url =
    process.env.DATABASE_URL ||
    "postgresql://build:build@localhost:5432/build_placeholder";

  const max = parseInt(process.env.DB_POOL_MAX_WEB ?? "5", 10) || 5;

  const { db } = createTenantClient(url, { max });
  globalForDb.__revualyWebDb = db;
  return db;
}
