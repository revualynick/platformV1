import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/__tests__/global-setup.ts"],
    // One file at a time: the integration suites share revualy_test and the
    // sweeper and ticket expiry act on the whole database, so parallel files
    // interfered (2026-09-26). About 23 s for the full suite.
    fileParallelism: false,
    setupFiles: ["src/__tests__/setup.ts"],
  },
});
