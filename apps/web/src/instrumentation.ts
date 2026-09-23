/**
 * Runs once when the Next.js server starts. Feedback content is encrypted
 * at rest and server components read it directly from the DB, so the web
 * server refuses to start without a valid key. It exits rather than staying
 * up and returning 500s, so a misconfigured deploy fails visibly.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertEncryptionReady } = await import("@revualy/shared/server");
    try {
      assertEncryptionReady();
    } catch (err) {
      console.error(`Fatal: ${(err as Error).message}`);
      process.exit(1);
    }
  }
}
