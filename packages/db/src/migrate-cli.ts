// `pnpm --filter @revualy/db migrate`: the same migration path the API runs at
// boot (runMigrations), so the pseudonym secret and org id reach migrations
// that need them (0043). drizzle-kit migrate would skip them.
import { runMigrations } from "./migrate.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
runMigrations(url)
  .then(() => console.log("migrations applied"))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
