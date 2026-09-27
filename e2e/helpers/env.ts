import { execSync } from "node:child_process";

/**
 * Where the suite runs. Defaults are the laptop's local stack; the staging
 * runner (scripts/staging/e2e.sh) sets these for the Linux box.
 *
 *   WEB_URL             web app (also used by playwright.config.ts)
 *   API_URL             API, for protocol-level tests (WebSocket, tokens)
 *   INTERNAL_API_SECRET the target's internal secret
 *   E2E_PSQL            a command that runs psql against the target DB and
 *                       reads SQL from stdin, in tuples-only unaligned mode
 */
export const WEB_URL = process.env.WEB_URL ?? "http://localhost:3001";
export const API_URL = process.env.API_URL ?? "http://localhost:3000";
export const WS_URL = API_URL.replace(/^http/, "ws");
export const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? "";

const PSQL =
  process.env.E2E_PSQL ?? "docker exec -i revualy-postgres-1 psql -U revualy -d revualy_dev -t -A -v ON_ERROR_STOP=1";

/** Run SQL against the target database; returns trimmed output. */
export function psql(sql: string): string {
  return execSync(PSQL, { input: sql, stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
}

/** A seeded user's id, by email (ids differ between databases). */
export function userId(email: string): string {
  const id = psql(`SELECT id FROM users WHERE email = '${email.replace(/'/g, "''")}';`);
  if (!id) throw new Error(`No user ${email} in the target database`);
  return id;
}
