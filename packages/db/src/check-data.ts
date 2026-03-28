import { sql } from "drizzle-orm";
import { createTenantClient } from "./tenant.js";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL required"); process.exit(1); }

const { db, sql: pgSql } = createTenantClient(url);

const rows = await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);

console.log("--- Tables with data ---");
for (const r of rows as Array<{ tablename: string }>) {
  const c = await db.execute(sql.raw(`SELECT count(*) as n FROM "${r.tablename}"`));
  const count = Number((c as Array<{ n: string }>)[0].n);
  if (count > 0) console.log(`  ${r.tablename}: ${count}`);
}

await pgSql.end();
