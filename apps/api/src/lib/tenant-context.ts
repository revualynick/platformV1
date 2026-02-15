import type { FastifyInstance, FastifyRequest } from "fastify";
import { getTenantDb, type TenantDb } from "@revualy/db";

/**
 * Tenant context resolved per-request.
 *
 * Auth flow:
 * 1. Next.js server calls auth() to get the session (userId, orgId, role)
 * 2. Passes x-org-id, x-user-id, x-internal-secret headers to the Fastify API
 * 3. Fastify validates the internal secret, then trusts the headers
 *
 * In development (no secret configured), dev headers are accepted without validation.
 */
export interface TenantContext {
  orgId: string;
  db: TenantDb;
  userId: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    tenant: TenantContext;
  }
}

const DEV_ORG_ID = "dev-org";
const DEV_DB_URL =
  process.env.TENANT_DATABASE_URL ??
  "postgres://revualy:revualy@localhost:5432/revualy_dev";
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

export function resolveTenant(request: FastifyRequest): TenantContext {
  const orgId = request.headers["x-org-id"] as string | undefined;
  const userId = request.headers["x-user-id"] as string | undefined;
  const secret = request.headers["x-internal-secret"] as string | undefined;

  // In production, require a valid internal secret to trust headers
  if (IS_PRODUCTION && INTERNAL_SECRET) {
    if (secret !== INTERNAL_SECRET) {
      // No valid secret — treat as unauthenticated
      return {
        orgId: DEV_ORG_ID,
        db: getTenantDb(DEV_ORG_ID, DEV_DB_URL),
        userId: null,
      };
    }
  }

  // Resolve tenant database
  // In a multi-tenant setup, orgId would map to a connection string via the control plane.
  // For now, all orgs share the same dev database.
  const resolvedOrgId = orgId ?? DEV_ORG_ID;
  const dbUrl = DEV_DB_URL; // TODO: look up from control plane by orgId

  return {
    orgId: resolvedOrgId,
    db: getTenantDb(resolvedOrgId, dbUrl),
    userId: userId ?? null,
  };
}

export async function tenantPlugin(app: FastifyInstance) {
  app.decorateRequest("tenant");

  app.addHook("preHandler", async (request) => {
    request.tenant = resolveTenant(request);
  });
}
