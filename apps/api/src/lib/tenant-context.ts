import crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { getTenantDb, type TenantDb } from "@revualy/db";

/**
 * Tenant context resolved per-request.
 *
 * Per-tenant deployment: orgId + dbUrl come from env vars.
 * Each instance is one org — no multi-tenant routing needed.
 *
 * Auth flow:
 * 1. Next.js server calls auth() to get the session (userId, orgId, role)
 * 2. Passes x-user-id, x-internal-secret headers to the Fastify API
 * 3. Fastify validates the internal secret, then trusts the headers
 *
 * In DEMO_MODE, demo routes skip internal-secret validation and set
 * userId to null (demo routes handle identity via lead email).
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
  "postgres://revualy:revualy@localhost:5432/revualy_dev";
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const DEMO_MODE = process.env.DEMO_MODE === "true";

/** Paths that skip internal-secret validation in DEMO_MODE */
const DEMO_PUBLIC_PATHS = ["/api/v1/demo/lead", "/api/v1/demo/start"];
const DEMO_PUBLIC_PREFIX = "/api/v1/demo/";
const DEMO_REPLY_RE = /^\/api\/v1\/demo\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/reply$/;

function isDemoPublicRoute(url: string): boolean {
  if (!DEMO_MODE) return false;
  if (DEMO_PUBLIC_PATHS.includes(url)) return true;
  // Match /api/v1/demo/:conversationId/reply
  if (DEMO_REPLY_RE.test(url)) {
    return true;
  }
  return false;
}

export function resolveTenant(request: FastifyRequest): TenantContext {
  const requestUrl = request.url.split("?")[0]; // strip query params

  // Demo public routes: skip secret validation, no userId
  if (isDemoPublicRoute(requestUrl)) {
    return {
      orgId: ENV_ORG_ID,
      db: getTenantDb(ENV_ORG_ID, DATABASE_URL),
      userId: null,
    };
  }

  const userId = request.headers["x-user-id"] as string | undefined;
  const secret = request.headers["x-internal-secret"] as string | undefined;

  // In production single-tenant deployments, ignore x-org-id header override
  const orgId = IS_PRODUCTION
    ? ENV_ORG_ID
    : (request.headers["x-org-id"] as string | undefined) ?? ENV_ORG_ID;

  // Always require a valid internal secret to trust headers
  if (!INTERNAL_SECRET) {
    throw new Error("INTERNAL_API_SECRET env var is required");
  }
  const expected = crypto.createHmac("sha256", INTERNAL_SECRET).update("revualy").digest();
  const actual = crypto.createHmac("sha256", secret ?? "").update("revualy").digest();
  if (!secret || !crypto.timingSafeEqual(expected, actual)) {
    const err = new Error("Invalid internal API secret");
    (err as Error & { statusCode: number }).statusCode = 401;
    throw err;
  }

  const rawUserId = userId ?? null;
  return {
    orgId,
    db: getTenantDb(orgId, DATABASE_URL),
    userId: rawUserId === "demo-user" ? null : rawUserId,
  };
}

export const tenantPlugin = fp(async function tenantPlugin(app: FastifyInstance) {
  app.decorateRequest("tenant");

  app.addHook("preHandler", async (request) => {
    // Health check and WS routes bypass internal secret validation
    const url = request.url.split("?")[0];
    if (url === "/health" || url.startsWith("/ws/")) {
      request.tenant = {
        orgId: process.env.ORG_ID ?? "dev-org",
        db: getTenantDb(process.env.ORG_ID ?? "dev-org", DATABASE_URL),
        userId: null,
      };
      return;
    }
    request.tenant = resolveTenant(request);
  });
});
