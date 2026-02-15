import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/tenant.ts",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://revualy:revualy@localhost:5432/revualy_dev",
  },
});
