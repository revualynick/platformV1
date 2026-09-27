import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "@revualy/shared/server";

/** Review finding 2026-09-28: encrypt("") stores "", which decrypt refused as a pre-v1 secret. */
describe("empty secrets", () => {
  it("round-trip with legacy reads off", () => {
    const before = process.env.ENCRYPTION_LEGACY_READS;
    process.env.ENCRYPTION_LEGACY_READS = "off";
    try {
      expect(decrypt(encrypt(""))).toBe("");
      expect(decrypt(encrypt("refresh-token"))).toBe("refresh-token");
    } finally {
      if (before === undefined) delete process.env.ENCRYPTION_LEGACY_READS;
      else process.env.ENCRYPTION_LEGACY_READS = before;
    }
  });
});
