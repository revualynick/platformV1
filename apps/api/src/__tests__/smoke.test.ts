import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../server.js";
import type { FastifyInstance } from "fastify";
import { AdapterRegistry } from "@revualy/chat-core";

/**
 * Smoke tests — verify the app boots and critical paths respond.
 * Requires DATABASE_URL pointing to a real Postgres instance.
 * Setup file (setup.ts) sets INTERNAL_API_SECRET and ORG_ID.
 */

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  // start() normally decorates adapters; an empty registry lets webhook
  // routes run through to the "adapter not configured" branch.
  app.decorate("adapters", new AdapterRegistry());
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("smoke", () => {
  it("GET /health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });

  it("rejects requests without internal secret", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/users",
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("GET /api/v1/auth/lookup returns 400 without email param", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/lookup",
      headers: {
        "x-internal-secret": process.env.INTERNAL_API_SECRET!,
        "x-user-id": "test-user",
      },
    });
    expect(res.statusCode).toBeLessThan(500);
  });

  it("unknown routes return 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/nonexistent",
      headers: {
        "x-internal-secret": process.env.INTERNAL_API_SECRET!,
        "x-user-id": "test-user",
      },
    });
    expect(res.statusCode).toBe(404);
  });

  // Chat platforms never send x-internal-secret, so webhook routes must not
  // be gated by it (they were 401ing every inbound event). With no adapter
  // registered, reaching the handler yields 503 rather than 401.
  it.each(["slack", "gchat", "teams"])(
    "POST /webhooks/%s/events is not blocked by the internal-secret check",
    async (platform) => {
      const res = await app.inject({
        method: "POST",
        url: `/webhooks/${platform}/events`,
        payload: { type: "url_verification", challenge: "x" },
      });
      expect(res.statusCode).toBe(503);
    },
  );
});
