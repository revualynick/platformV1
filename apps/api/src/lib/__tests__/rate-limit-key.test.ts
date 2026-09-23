import { describe, it, expect } from "vitest";
import type { FastifyRequest } from "fastify";
import { rateLimitKey } from "../tenant-context.js";

// setup.ts sets INTERNAL_API_SECRET = "test-internal-secret" before import.
function req(headers: Record<string, string>, ip = "10.0.0.5"): FastifyRequest {
  return { headers, ip } as unknown as FastifyRequest;
}

describe("rateLimitKey", () => {
  it("keys authenticated server calls per user, not per server IP", () => {
    const a = rateLimitKey(req({ "x-user-id": "user-a", "x-internal-secret": "test-internal-secret" }));
    const b = rateLimitKey(req({ "x-user-id": "user-b", "x-internal-secret": "test-internal-secret" }));
    expect(a).toBe("user:user-a");
    expect(b).toBe("user:user-b");
  });

  it("ignores x-user-id without a valid internal secret (no bucket spreading)", () => {
    expect(rateLimitKey(req({ "x-user-id": "spoofed" }))).toBe("ip:10.0.0.5");
    expect(
      rateLimitKey(req({ "x-user-id": "spoofed", "x-internal-secret": "wrong" })),
    ).toBe("ip:10.0.0.5");
  });

  it("falls back to IP for public requests", () => {
    expect(rateLimitKey(req({}, "203.0.113.9"))).toBe("ip:203.0.113.9");
  });
});
