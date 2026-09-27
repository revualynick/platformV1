# Staging on the Linux box

Status: current (set up 2026-09-26). A copy of Revualy that stays up on the Linux box (`nick@linuxbox.local`), separate from the laptop and from the live service.

## What it is
- **Built like production:** the API and web app run as Docker containers built from the same Dockerfiles Railway uses (`Dockerfile`, `apps/web/Dockerfile`: Node 20 on Alpine, production dependencies only). The API runs migrations at boot, as on Railway.
- Postgres 16 (pgvector) and Redis 7 run alongside in the same Docker project (`revualy-staging`), with data in `~/revualy-staging/data`. Containers restart unless stopped.
- **Everything listens on 127.0.0.1 only.** Nothing is reachable from the network; you get in through an SSH tunnel.
- It never touches Railway or GitHub. Deploys come straight from the laptop's git history.
- Its own secrets live in `~/revualy-staging/staging.env` on the box (mode 600), generated on the first deploy and never copied anywhere.
- The bot and 1:1 extraction use the Anthropic key in `~/.config/revualy-eval/anthropic.env` if it's there. That's the 7-day test key; when it expires, model calls fail and everything else keeps working.
- The API and web containers are capped at 2 cores and 2 GB each, so staging doesn't compete with eval runs.

## Use it
From the laptop:
```bash
ssh -N -L 3001:localhost:3001 -L 3000:localhost:3000 nick@linuxbox.local
```
Then open http://localhost:3001. Because your browser sees `localhost`, Google sign-in and "Connect Google" work (see Limits for who can sign in). The seeded demo people have no Google accounts, so for them use the test login:

```
http://localhost:3001/api/test-login?email=jordan.wells@acmecorp.com&key=<TEST_LOGIN_KEY>&redirect=/team
```
The key is in `staging.env` on the box: `ssh nick@linuxbox.local 'grep TEST_LOGIN_KEY ~/revualy-staging/staging.env'`. Seeded people are listed in `e2e/helpers/auth.ts` (Jordan is a manager, Sarah an employee, Dana an admin).

Port clash: if the laptop's own dev servers are running on 3000 and 3001, stop them first, or tunnel to other local ports (`-L 4001:localhost:3001 -L 4000:localhost:3000`; the web app then works on 4001, but Google sign-in won't, because the registered address is 3001).

## Deploy
```bash
scripts/staging/deploy.sh            # the last commit
scripts/staging/deploy.sh <commit>   # a specific one
```
It unpacks that commit into `~/revualy-staging/releases/<sha>`, builds the two images while the current containers keep serving, then replaces the containers, checks health, and seeds only an empty database. The last three releases and their images are kept, so rolling back is `scripts/staging/deploy.sh <older commit>`.

`TEST_LOGIN=off scripts/staging/deploy.sh` deploys with the test login disabled, as production runs; `/api/test-login` then returns 404. Deploy again without it to turn it back on.

## Test it
```bash
scripts/staging/e2e.sh            # full browser suite (e2e/) against staging
scripts/staging/e2e.sh smoke      # quick set: auth guards, every route renders, 1:1 notes
scripts/staging/e2e.sh full -g onboarding --retries=0   # extra args go to Playwright
```
It opens its own tunnel on local ports 4000/4001 and reads the test-login key and internal secret from the box without printing them. `deploy.sh` runs the smoke set after every deploy (`E2E=off` to skip). `SEED=force scripts/staging/deploy.sh` reseeds staging (wipes its data, including sign-ins).

## Look after it
```bash
ssh nick@linuxbox.local 'docker compose -p revualy-staging ps'
ssh nick@linuxbox.local 'docker compose -p revualy-staging logs --tail 100 api'
ssh nick@linuxbox.local 'docker compose -p revualy-staging stop'   # stop (start again with: start)
ssh nick@linuxbox.local 'readlink ~/revualy-staging/current'   # what's deployed (the commit is the directory name)
```
Reset the data: `docker compose -p revualy-staging down`, delete `~/revualy-staging/data`, then deploy again (it reseeds).

## How it differs from production (Railway)
- Same: the code, the Dockerfiles and so the images, Node 20, production mode, Postgres 16 with pgvector, Redis 7, migrations at boot, one database per tenant, the same variable names.
- Different: plain HTTP through an SSH tunnel instead of HTTPS behind Cloudflare, so secure cookies, redirects and CORS differ slightly; Docker Postgres and Redis instead of Railway's managed ones (exact Railway versions not checked); 127.0.0.1 instead of Railway's private network; the test login is on unless deployed with `TEST_LOGIN=off`.

## Limits
- Only people who can SSH to the box can use it. For a colleague or beta tester, it needs an HTTPS tunnel on a staging subdomain instead.
- Google sign-in and Connect Google are configured (2026-09-26): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_CALENDAR_REDIRECT_URI` are in `staging.env`, copied from the laptop's client file. Registered return addresses: `http://localhost:3001/api/auth/callback/google` and `http://localhost:3001/api/integrations/google/callback`. Only addresses in the org's allowed domains can sign in (seeded: acmecorp.com, revualy.com); a new address is created as an employee.
- Chat platforms (Google Chat, Slack, Teams) can't reach it: webhooks need a public HTTPS address.
- Surviving a reboot relies on Docker starting at boot and `restart: unless-stopped`; not yet tested with an actual reboot.
