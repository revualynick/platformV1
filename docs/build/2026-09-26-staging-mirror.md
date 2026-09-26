# Staging on the Linux box, mirroring production's build

Status: merged 2026-09-26, not reviewed
Commits: bf67c74 (first staging), 8725411 (Docker images), 8364a02 (redirect fix) · Migration: none · Design: `docs/staging.md`

## What and why
Nick wanted builds off the laptop and never against the live service. Staging now runs on the Linux box, always on, reached only through an SSH tunnel, and built from the same Dockerfiles Railway uses, so a problem in the production build shows up there first. It found one straight away.

## What changed
- `scripts/staging/deploy.sh` (laptop): ships a committed revision with `git archive`; `TEST_LOGIN=off` deploys as production.
- `scripts/staging/box-deploy.sh` (box): generates secrets on first run, builds the API and web images, replaces the containers, lets the API migrate at boot, seeds only an empty database, health-checks, keeps three releases.
- `scripts/staging/docker-compose.yml`: Postgres 16 with pgvector, Redis 7, API and web images from `Dockerfile` and `apps/web/Dockerfile`; everything on 127.0.0.1; API and web capped at 2 cores and 2 GB.
- Google sign-in and Connect Google configured on staging (client settings copied from the laptop's client file, never printed).
- **Bug fixed, found by the mirror:** in the standalone production build, `request.url` carries the server's bind address, so every redirect built from it (middleware to `/login` and `/home`, both Google connect routes, the test login) pointed at `0.0.0.0` or `127.0.0.1`, even behind a proxy. `apps/web/src/lib/public-url.ts` builds redirects from `X-Forwarded-Host`/`Proto` or `Host`. Likely affected the Railway deployment too; not verified there.
- The Google connect route now only accepts same-site `returnTo` paths.

## How it was tested
- Deploys to staging: first host build, then Docker build, then with `TEST_LOGIN=off` (the test login returned 404 with the correct key), then back on.
- Redirects checked with curl both as the tunnel sends them (`Host: localhost:3001`) and as a proxy would (`X-Forwarded-Host`, `X-Forwarded-Proto: https`): both correct after the fix, both wrong before.
- The 1:1 pages render through the tunnel; a notes upload produced tasks, a goal and a suggestion with the real model.
- `NEXT_PUBLIC_WS_URL`: checked in the production image; it's read at runtime by server pages, so it isn't baked in at build, and the suspected "not baked into the web build" bug isn't one.
- **Browser suite against staging (Playwright, through the tunnel):** 172 passed, 3 skipped, 27 failed. None traced to this work: 11 mobile overflow (known, backlog), 9 onboarding and 2 realtime tests that assume the laptop (local `psql`, local internal secret), 3 regression tests tied to old local data and a hard-coded July date, 1 retry artefact (passes alone), 1 leftover diagnostic spec with no assertions.
- **Not run:** a reboot of the box; the redirect fix on Railway itself.

## Review checklist
- [ ] `docker compose -p revualy-staging ps` on the box shows four healthy containers, all ports on 127.0.0.1.
- [ ] Signed out, `http://localhost:3001/team` through the tunnel lands on `http://localhost:3001/login`.
- [ ] `publicUrl()` can't be used for an open redirect: it only takes paths from code or already-validated params.
- [ ] After the next Railway deploy, a signed-out visit to a protected page redirects to the public domain.

## Not done / limits
- HTTP through a tunnel instead of HTTPS behind Cloudflare; Docker databases instead of Railway's managed ones (versions not compared); reboot survival untested.
- Whether the browser can reach the API's WebSocket in production for live 1:1 sessions (the API isn't public).

## Later changes
