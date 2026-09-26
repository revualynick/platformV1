import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/__tests__/global-setup.ts"],
    setupFiles: ["src/__tests__/setup.ts"],
  },
});
