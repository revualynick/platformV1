import "server-only";
import { createTenantClient, type TenantDb } from "@revualy/db";

let cached: { db: TenantDb } | null = null;

/**
 * Singleton DB client for web server components.
 * Pool size defaults to 5 (smaller than API's 10) via DB_POOL_MAX_WEB.
 * Uses a lazy-connect fallback URL for `next build` static analysis.
 */
export function getDb(): TenantDb {
  if (cached) return cached.db;

  const url =
    process.env.DATABASE_URL ||
    "postgresql://build:build@localhost:5432/build_placeholder";

  const max = parseInt(process.env.DB_POOL_MAX_WEB ?? "5", 10) || 5;

  const { db } = createTenantClient(url, { max });
  cached = { db };
  return db;
}
