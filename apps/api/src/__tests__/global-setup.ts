import { createTenantClient } from "@revualy/db";
import { runMigrations } from "@revualy/db/migrate";

/**
 * Tests get their own database (revualy_test), created and migrated here
 * before any test file runs. They used to share revualy_dev, whose rows are
 * encrypted with the dev key, not the tests' fixed key, so any test that
 * read rows it hadn't written failed to decrypt them.
 *
 * If Postgres isn't running this does nothing, and the integration suites
 * skip themselves as before.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://revualy:revualy@localhost:5432/revualy_test";

export default async function setup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const name = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(name) || !name.includes("test")) {
    throw new Error(`Refusing to use ${name} as the test database: its name must contain "test"`);
  }
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = "/postgres";
  const { sql: admin } = createTenantClient(adminUrl.toString(), { max: 1 });
  try {
    const probe = admin`select 1 as ok from pg_database where datname = ${name}`;
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000));
    const [row] = await Promise.race([probe, timeout]);
    if (!row) await admin.unsafe(`create database ${name}`);
  } catch {
    return; // Postgres not reachable: integration suites skip themselves
  } finally {
    await admin.end({ timeout: 2 });
  }
  await runMigrations(TEST_DATABASE_URL, {
    pseudonymSecret: "test-only-reviewer-pseudonym-secret-not-real",
    orgId: "smoke-test-org",
  });
}
