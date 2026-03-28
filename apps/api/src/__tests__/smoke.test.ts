import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../server.js";
import type { FastifyInstance } from "fastify";

/**
 * Smoke tests — verify the app boots and critical paths respond.
 * Requires DATABASE_URL pointing to a real Postgres instance.
 * Setup file (setup.ts) sets INTERNAL_API_SECRET and ORG_ID.
 */

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
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
});
