import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as controlPlaneSchema from "./schema/control-plane.js";

export type ControlPlaneDb = ReturnType<typeof createControlPlaneClient>;

let controlPlaneInstance: ControlPlaneDb | null = null;

export function createControlPlaneClient(connectionString?: string) {
  const connStr =
    connectionString ?? process.env.CONTROL_PLANE_DATABASE_URL ?? "";
  const sql = postgres(connStr, { max: 10 });
  return drizzle(sql, { schema: controlPlaneSchema });
}

export function getControlPlaneDb(): ControlPlaneDb {
  if (!controlPlaneInstance) {
    controlPlaneInstance = createControlPlaneClient();
  }
  return controlPlaneInstance;
}
