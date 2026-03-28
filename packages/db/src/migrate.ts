import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export async function runMigrations(connectionString: string): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);
  try {
    await migrate(db, {
      migrationsFolder: new URL("./migrations", import.meta.url).pathname,
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
