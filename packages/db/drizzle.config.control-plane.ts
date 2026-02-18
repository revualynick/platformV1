import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/control-plane.ts",
  out: "./src/migrations-control-plane",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.CONTROL_PLANE_DATABASE_URL ??
      "postgresql://revualy:revualy@localhost:5432/revualy_control",
  },
});
