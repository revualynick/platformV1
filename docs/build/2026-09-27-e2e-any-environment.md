# Browser suite against any environment, smoke tests after deploys

Status: merged 2026-09-27, not reviewed
Commits: 36cc8fb..96e92ab (7 commits) · Migration: none

## What and why
The Playwright suite assumed the laptop: its database container, port, secret and seed ids, plus data left over from old local runs. Against staging it failed 27 of 202. Now it runs against any environment, staging deploys run a smoke set automatically, and running it on the production build found three real problems.

## What changed
- `e2e/helpers/env.ts`: `WEB_URL`, `API_URL`, `INTERNAL_API_SECRET`, `E2E_PSQL` (SQL on stdin), `userId(email)`. Onboarding and realtime specs use it; no hard-coded ids or ports.
- Seed: "recent activity" relative to today (two weeks of engagement, a completed reflection, an escalation raised by a colleague, a pulse alert), which the regression checks need; and it now clears sign-in tables with the users.
- New `e2e/specs/one-on-one-notes.spec.ts`; `diag.spec.ts` removed (no assertions).
- `scripts/staging/e2e.sh` (full or smoke, own tunnel on 4000/4001); `deploy.sh` runs smoke after deploying; `SEED=force` reseeds.
- Test robustness for the production build: logout waits for in-flight requests; locators skip the hidden copy Next.js streams page parts through; new rows must settle to exactly one visible copy; month check accepts "Sep" and "Sept".

## Real problems found
1. **Reseeding locked seeded people out of signing in**: the seed wiped users but kept `auth_user` rows, whose emails are unique. Fixed in the seed; the test login also relinks by email.
2. **New goal cycle sometimes not shown until reload** (production build). Partly fixed with `router.refresh()`; still intermittent (backlog).
3. The sign-out race and streaming duplicates are test issues, but only the production build exposes them, which is why the suite needs to run there.

## How it was tested
- Full suite against staging, no retries: 190 passed, 2 skipped, 12 failed (11 known mobile overflow, 1 goal cycle refresh).
- Smoke set after deploy: passes.
- **Not run:** the suite against the laptop's local stack since these changes (defaults are unchanged, so it should still work).

## Review checklist
- [ ] `scripts/staging/e2e.sh smoke` passes from a fresh terminal.
- [ ] No test output prints the test-login key (a trace script of mine did once; the key was rotated).
- [ ] The seed's new fixtures read sensibly on the dashboards (Sarah's reflection, David's escalation).

## Not done / limits
- Mobile overflow (11 tests) is a real layout job, in the backlog.
- Goal cycle refresh bug; audit of other dialogs (backlog).

## Later changes
