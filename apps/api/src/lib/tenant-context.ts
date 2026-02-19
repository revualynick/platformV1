import crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { getTenantDb, type TenantDb } from "@revualy/db";

/**
 * Tenant context resolved per-request.
 *
 * Per-tenant deployment: orgId + dbUrl come from env vars.
 * Each instance is one org — no multi-tenant routing needed.
 *
 * Auth flow:
 * 1. Next.js server calls auth() to get the session (userId, orgId, role)
 * 2. Passes x-org-id, x-user-id, x-internal-secret headers to the Fastify API
 * 3. Fastify validates the internal secret, then trusts the headers
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

const ENV_ORG_ID = process.env.ORG_ID ?? "dev-org";
const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.TENANT_DATABASE_URL ??
  "postgres://revualy:revualy@localhost:5432/revualy_dev";
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

export function resolveTenant(request: FastifyRequest): TenantContext {
  const userId = request.headers["x-user-id"] as string | undefined;
  const secret = request.headers["x-internal-secret"] as string | undefined;

  // Allow header override for dev/testing, but default to env var
  const orgId =
    (request.headers["x-org-id"] as string | undefined) ?? ENV_ORG_ID;

  // Require a valid internal secret to trust headers
  if (INTERNAL_SECRET) {
    if (
      !secret ||
      secret.length !== INTERNAL_SECRET.length ||
      !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(INTERNAL_SECRET))
    ) {
      const err = new Error("Invalid internal API secret");
      (err as Error & { statusCode: number }).statusCode = 401;
      throw err;
    }
  } else if (IS_PRODUCTION) {
    // In production, INTERNAL_SECRET must be set — reject all requests
    throw new Error("INTERNAL_API_SECRET is required in production");
  }

  return {
    orgId,
    db: getTenantDb(orgId, DATABASE_URL),
    userId: userId ?? null,
  };
}

export async function tenantPlugin(app: FastifyInstance) {
  app.decorateRequest("tenant");

  app.addHook("preHandler", async (request) => {
    request.tenant = resolveTenant(request);
  });
}
