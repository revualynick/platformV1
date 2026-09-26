import { describe, it, expect, afterEach } from "vitest";
import crypto from "node:crypto";
import {
  encrypt,
  decrypt,
  encryptField,
  decryptField,
  isEncryptedValue,
  assertEncryptionReady,
  resetKeyringForTests,
  decryptLegacySecret,
  currentKeyId,
  configuredKeyIds,
  storedKeyId,
} from "@revualy/shared/server";
import { sealCachedNotes, openCachedNotes } from "../../modules/one-on-one/ws.js";

// setup.ts sets ENCRYPTION_KEY to this value.
const TEST_KEY = "0123456789abcdef".repeat(4);
const OTHER_KEY = "fedcba9876543210".repeat(4);
const AAD = "feedback_entries.raw_content";

function withEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetKeyringForTests();
}

afterEach(() => {
  withEnv({ ENCRYPTION_KEY: TEST_KEY, ENCRYPTION_KEYS: undefined, ENCRYPTION_LEGACY_READS: undefined });
});

describe("legacy-read switch (ENCRYPTION_LEGACY_READS)", () => {
  it("refuses legacy plaintext by default (unset means off)", () => {
    expect(() => decryptField("old row", AAD)).toThrow(/ENCRYPTION_LEGACY_READS=off/);
  });

  it("reads legacy plaintext and pre-v1 secrets when switched on", () => {
    withEnv({ ENCRYPTION_LEGACY_READS: "on" });
    expect(decryptField("old row", AAD)).toBe("old row");
    expect(decrypt(legacySharedFormat("tok", TEST_KEY))).toBe("tok");
  });

  it("refuses them when off, but still reads v1 and empty values", () => {
    const v1 = encryptField("new row", AAD);
    const legacy = legacyApiFormat("tok", TEST_KEY);
    withEnv({ ENCRYPTION_LEGACY_READS: "off" });
    expect(() => decryptField("old row", AAD)).toThrow(/ENCRYPTION_LEGACY_READS=off/);
    expect(() => decrypt(legacy)).toThrow(/ENCRYPTION_LEGACY_READS=off/);
    expect(decryptField(v1, AAD)).toBe("new row");
    expect(decryptField("", AAD)).toBe("");
    // The backfill can still read pre-v1 secrets to rewrite them.
    expect(decryptLegacySecret(legacy)).toBe("tok");
  });

  it("rejects an unknown setting at startup", () => {
    withEnv({ ENCRYPTION_LEGACY_READS: "maybe" });
    expect(() => assertEncryptionReady()).toThrow(/ENCRYPTION_LEGACY_READS/);
  });

  it("exposes key ids without the keys", () => {
    withEnv({ ENCRYPTION_KEYS: `k2:${OTHER_KEY},k1:${TEST_KEY}` });
    expect(currentKeyId()).toBe("k2");
    expect(configuredKeyIds()).toEqual(["k2", "k1"]);
    expect(storedKeyId(encryptField("x", AAD))).toBe("k2");
    expect(storedKeyId("plain")).toBeNull();
  });
});

describe("1:1 live notes cache (Redis)", () => {
  it("stores ciphertext bound to the session and reads it back", () => {
    const sealed = sealCachedNotes("s1", "agenda: pay review");
    expect(sealed).not.toContain("pay review");
    expect(openCachedNotes("s1", sealed)).toBe("agenda: pay review");
    expect(openCachedNotes("s2", sealed)).toBeNull();
  });

  it("ignores plaintext left over from before encryption", () => {
    expect(openCachedNotes("s1", "old plaintext notes")).toBeNull();
  });
});

/** The two formats that existed before v1, reproduced for back-compat tests. */
function legacySharedFormat(plaintext: string, keyHex: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}
function legacyApiFormat(plaintext: string, keyHex: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return `${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}

describe("field encryption", () => {
  it("round-trips and never stores plaintext", () => {
    const stored = encryptField("Sam unblocked the release", AAD);
    expect(stored.startsWith("enc:v1:k1:")).toBe(true);
    expect(stored).not.toContain("Sam");
    expect(isEncryptedValue(stored)).toBe(true);
    expect(decryptField(stored, AAD)).toBe("Sam unblocked the release");
  });

  it("uses a fresh IV per write", () => {
    expect(encryptField("same", AAD)).not.toBe(encryptField("same", AAD));
  });

  it("round-trips unicode", () => {
    const text = "Café naïve 👍 £50–£60";
    expect(decryptField(encryptField(text, AAD), AAD)).toBe(text);
  });

  it("stores empty strings as-is", () => {
    expect(encryptField("", AAD)).toBe("");
    expect(decryptField("", AAD)).toBe("");
  });

  it("returns legacy plaintext unchanged (pre-backfill rows)", () => {
    withEnv({ ENCRYPTION_LEGACY_READS: "on" });
    expect(decryptField("old plaintext row", AAD)).toBe("old plaintext row");
  });

  it("rejects ciphertext moved to another column (AAD binding)", () => {
    const stored = encryptField("secret", AAD);
    expect(() => decryptField(stored, "manager_notes.content")).toThrow();
  });

  it("rejects tampered ciphertext", () => {
    const stored = encryptField("secret", AAD);
    const packed = Buffer.from(stored.slice("enc:v1:k1:".length), "base64");
    packed[packed.length - 1] ^= 0x01;
    expect(() => decryptField(`enc:v1:k1:${packed.toString("base64")}`, AAD)).toThrow();
  });

  it("rejects an unknown key id", () => {
    const stored = encryptField("secret", AAD).replace("enc:v1:k1:", "enc:v1:k9:");
    expect(() => decryptField(stored, AAD)).toThrow(/unknown encryption key id/);
  });
});

describe("key rotation", () => {
  it("writes with the first key and still reads values under older keys", () => {
    const underOld = encryptField("written before rotation", AAD); // k1 = TEST_KEY
    withEnv({ ENCRYPTION_KEYS: `k2:${OTHER_KEY},k1:${TEST_KEY}` });

    const underNew = encryptField("written after rotation", AAD);
    expect(underNew.startsWith("enc:v1:k2:")).toBe(true);
    expect(decryptField(underOld, AAD)).toBe("written before rotation");
    expect(decryptField(underNew, AAD)).toBe("written after rotation");
  });

  it("rejects malformed ENCRYPTION_KEYS", () => {
    withEnv({ ENCRYPTION_KEYS: "k2:not-hex" });
    expect(() => assertEncryptionReady()).toThrow();
    withEnv({ ENCRYPTION_KEYS: `K2:${OTHER_KEY}` });
    expect(() => assertEncryptionReady()).toThrow();
  });
});

describe("secrets (tokens and config)", () => {
  it("writes v1 and reads both legacy formats", () => {
    withEnv({ ENCRYPTION_LEGACY_READS: "on" });
    expect(encrypt("ya29.token").startsWith("enc:v1:")).toBe(true);
    expect(decrypt(encrypt("ya29.token"))).toBe("ya29.token");
    expect(decrypt(legacySharedFormat("legacy-shared", TEST_KEY))).toBe("legacy-shared");
    expect(decrypt(legacyApiFormat('{"a":1}', TEST_KEY))).toBe('{"a":1}');
  });

  it("reads legacy values under a rotated-out key", () => {
    withEnv({ ENCRYPTION_LEGACY_READS: "on" });
    const legacy = legacySharedFormat("old token", TEST_KEY);
    withEnv({ ENCRYPTION_KEYS: `k2:${OTHER_KEY},k1:${TEST_KEY}` });
    expect(decrypt(legacy)).toBe("old token");
  });
});

describe("fail closed", () => {
  it("throws on every operation when no key is configured", () => {
    withEnv({ ENCRYPTION_KEY: undefined, ENCRYPTION_KEYS: undefined });
    expect(() => assertEncryptionReady()).toThrow(/Encryption key missing/);
    expect(() => encryptField("x", AAD)).toThrow();
    expect(() => encrypt("x")).toThrow();
    expect(() => decrypt("enc:v1:k1:AAAA")).toThrow();
  });
});

/**
 * Performance budget: encryption must add no noticeable delay (at most 1 ms
 * of crypto per request). Measured locally at 0.03 ms per bot turn and
 * 2.6 ms per 1,000-row export; thresholds sit well above that so slower CI
 * machines don't flake, while a real regression (e.g. a per-call KDF at
 * 50-100 ms) still fails.
 */
describe("performance budget", () => {
  const short = "Sam has been great in standups, especially when unblocking the team.";
  const long = short.repeat(30); // ~2 KB feedback entry

  // Fastest of several timed runs: the full suite runs files in parallel,
  // so a single run can be descheduled mid-measurement. The fastest run is
  // what the code costs; the budget itself stays strict.
  function time(fn: () => void): number {
    for (let i = 0; i < 50; i++) fn(); // warm up
    let best = Infinity;
    for (let run = 0; run < 7; run++) {
      const start = process.hrtime.bigint();
      fn();
      best = Math.min(best, Number(process.hrtime.bigint() - start) / 1e6);
    }
    return best;
  }

  it("a bot turn (decrypt 10-message history, encrypt 2) stays under 1 ms", () => {
    const stored = encryptField(short, "conversation_messages.content");
    const ms = time(() => {
      for (let i = 0; i < 10; i++) decryptField(stored, "conversation_messages.content");
      encryptField(short, "conversation_messages.content");
      encryptField(short, "conversation_messages.content");
    });
    expect(ms).toBeLessThan(1);
  });

  it("decrypting a 1,000-row export stays under 30 ms", () => {
    const stored = encryptField(long, AAD);
    const ms = time(() => {
      for (let i = 0; i < 1000; i++) decryptField(stored, AAD);
    });
    expect(ms).toBeLessThan(30);
  });
});
