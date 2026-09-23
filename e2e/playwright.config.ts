import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config. Assumes the web app is already running on :3001 and the API on
 * :3000 (start with `set -a; source .env; set +a; pnpm dev`). Auth is handled
 * per-test via the key-gated /api/test-login endpoint (see helpers/auth.ts),
 * so TEST_LOGIN_ENABLED=true and TEST_LOGIN_KEY must be set in the env that
 * launched the web server AND the env running these tests.
 */
export default defineConfig({
  testDir: "./specs",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  // 1 retry absorbs dev-server compile-on-first-visit timing noise; real render
  // bugs fail deterministically and survive the retry.
  retries: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "results.json" }],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: process.env.WEB_URL ?? "http://localhost:3001",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Default suite runs on Chromium. WebKit/Safari can be checked on demand by
  // temporarily adding `{ name: "webkit", use: { ...devices["Desktop Safari"] } }`
  // and running `--project=webkit` (see docs/local-testing.md — note the known
  // WebKit-only NextAuth /api/auth/session console error).
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
