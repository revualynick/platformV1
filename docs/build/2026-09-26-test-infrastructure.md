# Test and migration infrastructure

Status: merged 2026-09-26, not reviewed
Commits: ce5bdd6, 11e749c (vitest config) · Migration: none

## What and why
Merging the privacy work exposed three problems that made results depend on luck: tests shared the dev database, whose rows are encrypted under a different key; the built `@revualy/db` package carried a stale copy of the migrations; and two migration commands behaved differently.

## What changed
- **Dedicated test database.** `apps/api/src/__tests__/global-setup.ts` creates `revualy_test` if needed and migrates it with test secrets before any test runs. `setup.ts` always points tests at it (`TEST_DATABASE_URL` overrides), even when the shell has the dev `DATABASE_URL` loaded. The setup refuses a database whose name doesn't contain "test".
- **One file at a time** (`apps/api/vitest.config.ts`, `fileParallelism: false`): integration suites share one database and the sweeper and ticket expiry act on all of it, so parallel files interfered. The full suite takes about 23 s.
- **Migrations in the build.** `packages/db` build now copies `src/migrations` into `dist/migrations`. The old copy stopped at 0029, so anything importing the built package locally applied only 29 migrations. Production was unaffected: the Dockerfile copies them.
- **One migration path.** `pnpm --filter @revualy/db migrate` runs `runMigrations` (`src/migrate-cli.ts`), the same code the API runs at boot, so migration 0043 gets the pseudonym secret. drizzle-kit stays as `migrate:kit`.
- **Stabilised tests.** The schema-sync test checks columns with `LIMIT 0` rather than reading rows. The crypto speed budget is judged on the fastest of seven runs, with the budget unchanged.

## How it was tested
- Dropped `revualy_test` and ran the suite from scratch: created, migrated to 0044, 558 of 558 pass. Two consecutive serial runs pass.

## Review checklist
- [ ] Run `npx vitest run` in `apps/api` with `.env` loaded, and confirm `revualy_dev` is untouched (row counts before and after).
- [ ] `pnpm --filter @revualy/db build` leaves `dist/migrations` matching `src/migrations`.

## Not done / limits
- `pnpm tenant:fleet migrate` still lacks the pseudonym secret (backlog).
- Local Docker Postgres occasionally fails `CREATE DATABASE` with "Permission denied" under load (backlog).

## Later changes
