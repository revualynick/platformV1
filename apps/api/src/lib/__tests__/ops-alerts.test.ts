import { describe, it, expect } from "vitest";
import { decideAlerts } from "../ops-alerts.js";
import type { OpsCheck } from "../ops-status.js";

/** When the ops alert emails go out (C3 step 8). */

const check = (name: string, status: OpsCheck["status"]): OpsCheck => ({ name, status, value: 1, detail: `${name} detail` });
const t0 = new Date("2026-09-28T10:00:00Z");
const later = (min: number) => new Date(t0.getTime() + min * 60_000);

describe("decideAlerts", () => {
  it("raises a new problem once, then repeats only after the interval", () => {
    const first = decideAlerts([check("inbound_stuck", "fail")], {}, t0);
    expect(first.decision.raised.map((c) => c.name)).toEqual(["inbound_stuck"]);

    const soon = decideAlerts([check("inbound_stuck", "fail")], first.after, later(15));
    expect(soon.decision.raised).toHaveLength(0);

    const sixHours = decideAlerts([check("inbound_stuck", "fail")], soon.after, later(6 * 60));
    expect(sixHours.decision.raised).toHaveLength(1);
  });

  it("warnings repeat daily, and a warning turning into a failure is raised at once", () => {
    const warn = decideAlerts([check("analysis_missing", "warn")], {}, t0);
    expect(decideAlerts([check("analysis_missing", "warn")], warn.after, later(7 * 60)).decision.raised).toHaveLength(0);
    expect(decideAlerts([check("analysis_missing", "warn")], warn.after, later(24 * 60)).decision.raised).toHaveLength(1);
    expect(decideAlerts([check("analysis_missing", "fail")], warn.after, later(15)).decision.raised).toHaveLength(1);
  });

  it("reports recovery once, and only for something it had reported", () => {
    const bad = decideAlerts([check("undelivered", "fail")], {}, t0);
    const ok = decideAlerts([check("undelivered", "ok")], bad.after, later(15));
    expect(ok.decision.resolved).toEqual(["undelivered"]);
    expect(decideAlerts([check("undelivered", "ok")], ok.after, later(30)).decision.resolved).toEqual([]);
    expect(decideAlerts([check("audit_chain", "ok")], {}, t0).decision.resolved).toEqual([]);
  });
});
