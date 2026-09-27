import { describe, it, expect } from "vitest";
import { SignJWT, generateKeyPair } from "jose";
import { createChatTokenVerifier } from "../verify.js";

/**
 * Review finding 2026-09-28: a token naming an unknown signing key used to
 * trigger a fresh fetch of Google's certificates every time. Forged tokens
 * with random key ids must not each cost an outbound request.
 */

describe("Google Chat certificate fetching", () => {
  it("refetches for an unknown key id at most once a minute", async () => {
    let fetches = 0;
    const fetchImpl = (async () => {
      fetches++;
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const verifier = createChatTokenVerifier({ audience: "123456789012", fetchImpl });
    const { privateKey } = await generateKeyPair("RS256");
    const forged = async () =>
      new SignJWT({})
        .setProtectedHeader({ alg: "RS256", kid: `random-${Math.random()}` })
        .setIssuer("chat@system.gserviceaccount.com")
        .setAudience("123456789012")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);

    for (let i = 0; i < 5; i++) {
      const res = await verifier.verify(await forged());
      expect(res.ok).toBe(false);
    }
    // One load for the empty cache; no refetch per forged token.
    expect(fetches).toBe(1);

    // Many at once share one fetch too.
    fetches = 0;
    const fresh = createChatTokenVerifier({ audience: "123456789012", fetchImpl });
    await Promise.all(Array.from({ length: 5 }, async () => fresh.verify(await forged())));
    expect(fetches).toBe(1);
  });
});
