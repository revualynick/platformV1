# Staging on the Linux box

Status: current (set up 2026-09-26). A copy of Revualy that stays up on the Linux box (`nick@linuxbox.local`), separate from the laptop and from the live service.

## What it is
- The API and web app run as user services (`revualy-staging-api`, `revualy-staging-web`), restart on failure and survive reboots.
- Postgres and Redis run in Docker (project `revualy-staging`), with data in `~/revualy-staging/data`.
- **Everything listens on 127.0.0.1 only.** Nothing is reachable from the network; you get in through an SSH tunnel.
- It never touches Railway or GitHub. Deploys come straight from the laptop's git history.
- Its own secrets live in `~/revualy-staging/staging.env` on the box (mode 600), generated on the first deploy and never copied anywhere.
- The bot and 1:1 extraction use the Anthropic key in `~/.config/revualy-eval/anthropic.env` if it's there. That's the 7-day test key; when it expires, model calls fail and everything else keeps working.
- CPU and memory are capped (2 cores, 2 GB per service) so it doesn't compete with eval runs.

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
It unpacks that commit into `~/revualy-staging/releases/<sha>`, installs and builds it while the current version keeps running, migrates, seeds only an empty database, switches the `current` link and restarts, then checks health. The last three releases are kept, so rolling back is `scripts/staging/deploy.sh <older commit>`.

## Look after it
```bash
ssh nick@linuxbox.local 'systemctl --user status revualy-staging-api revualy-staging-web'
ssh nick@linuxbox.local 'journalctl --user -u revualy-staging-api -n 100'
ssh nick@linuxbox.local 'systemctl --user stop revualy-staging-api revualy-staging-web'   # stop
ssh nick@linuxbox.local 'readlink ~/revualy-staging/current'   # what's deployed (the commit is the directory name)
```
Reset the data: stop the services, `docker compose -p revualy-staging down`, delete `~/revualy-staging/data`, then deploy again (it reseeds).

## Limits
- Only people who can SSH to the box can use it. For a colleague or beta tester, it needs an HTTPS tunnel on a staging subdomain instead.
- Google sign-in and Connect Google are configured (2026-09-26): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_CALENDAR_REDIRECT_URI` are in `staging.env`, copied from the laptop's client file. Registered return addresses: `http://localhost:3001/api/auth/callback/google` and `http://localhost:3001/api/integrations/google/callback`. Only addresses in the org's allowed domains can sign in (seeded: acmecorp.com, revualy.com); a new address is created as an employee.
- Chat platforms (Google Chat, Slack, Teams) can't reach it: webhooks need a public HTTPS address.
- Surviving a reboot is set up (user services enabled, lingering on, containers `restart: unless-stopped`) but hasn't been tested with an actual reboot.
