import { describe, expect, it } from "vitest";
import { allowedModes, effectiveMode } from "../ingestion-mode.js";

describe("1:1 ingestion mode: admin limit, manager choice", () => {
  it("allows modes up to the limit, and not automatic while no source exists", () => {
    expect(allowedModes("manual", true)).toEqual(["manual"]);
    expect(allowedModes("semi_automatic", true)).toEqual(["manual", "semi_automatic"]);
    expect(allowedModes("automatic", true)).toEqual(["manual", "semi_automatic", "automatic"]);
    expect(allowedModes("automatic", false)).toEqual(["manual", "semi_automatic"]);
  });

  it("uses the manager's choice within the limit", () => {
    expect(effectiveMode({ maxMode: "automatic", defaultMode: "semi_automatic" }, "manual", true)).toBe("manual");
    expect(effectiveMode({ maxMode: "automatic", defaultMode: "manual" }, "automatic", true)).toBe("automatic");
  });

  it("falls back to the org default when the manager hasn't chosen", () => {
    expect(effectiveMode({ maxMode: "automatic", defaultMode: "manual" }, null, true)).toBe("manual");
  });

  it("caps a choice or default above the limit at the limit", () => {
    expect(effectiveMode({ maxMode: "manual", defaultMode: "semi_automatic" }, "automatic", true)).toBe("manual");
    expect(effectiveMode({ maxMode: "semi_automatic", defaultMode: "automatic" }, null, true)).toBe("semi_automatic");
  });

  it("turns automatic into semi-automatic while no automatic source exists", () => {
    expect(effectiveMode({ maxMode: "automatic", defaultMode: "automatic" }, null, false)).toBe("semi_automatic");
  });

  it("treats missing or unknown values as semi-automatic", () => {
    expect(effectiveMode({ maxMode: null, defaultMode: undefined }, "bogus", true)).toBe("semi_automatic");
  });
});
