import { describe, it, expect } from "vitest";
import { opsRows } from "../lib/fleet.js";

/** How `pnpm tenant:fleet health` shows each tenant's ops status (C3 step 8). */

describe("opsRows", () => {
  it("one ok row when everything is fine", () => {
    expect(opsRows("acme", 200, JSON.stringify({ status: "ok", checks: [{ name: "a", status: "ok", detail: "" }] }))).toEqual([
      { tenant: "acme", check: "ops status", result: "ok" },
    ]);
  });

  it("a row per check that isn't ok", () => {
    const body = JSON.stringify({
      status: "fail",
      checks: [
        { name: "inbound_stuck", status: "fail", detail: "2 incoming chat messages not processed" },
        { name: "job_sweep", status: "warn", detail: "the sweeper hasn't succeeded for 20 minutes" },
        { name: "audit_chain", status: "ok", detail: "intact" },
      ],
    });
    expect(opsRows("acme", 503, body)).toEqual([
      { tenant: "acme", check: "ops inbound_stuck", result: "FAIL: 2 incoming chat messages not processed" },
      { tenant: "acme", check: "ops job_sweep", result: "WARN: the sweeper hasn't succeeded for 20 minutes" },
    ]);
  });

  it("says when the route isn't enabled or the token is wrong", () => {
    expect(opsRows("acme", 404, '{"error":"Not found"}')[0].result).toMatch(/not enabled/);
    expect(opsRows("acme", 401, '{"error":"Unauthorized"}')[0].result).toMatch(/^FAIL/);
  });
});
