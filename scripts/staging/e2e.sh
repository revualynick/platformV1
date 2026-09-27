#!/usr/bin/env bash
# Run the browser suite (e2e/) against staging on the Linux box, from the
# laptop, over a temporary SSH tunnel on local ports 4000/4001 (so it never
# clashes with a dev server or your own tunnel on 3000/3001).
#   scripts/staging/e2e.sh            # full suite
#   scripts/staging/e2e.sh smoke      # quick set: auth guards, every route renders, 1:1 notes
#   scripts/staging/e2e.sh full -g onboarding   # extra args go to playwright
# Secrets are read from the box into this process only; never printed.
set -euo pipefail
HOST="${STAGING_HOST:-nick@linuxbox.local}"
MODE="${1:-full}"; shift || true
cd "$(git rev-parse --show-toplevel)/e2e"

ssh -N -o ExitOnForwardFailure=yes -L 4001:localhost:3001 -L 4000:localhost:3000 "$HOST" &
TUNNEL=$!
trap 'kill $TUNNEL 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do
  curl -s -o /dev/null --max-time 2 http://localhost:4001/login && break
  sleep 0.5
done

SECRETS="$(ssh "$HOST" 'grep -E "^(TEST_LOGIN_KEY|INTERNAL_API_SECRET)=" ~/revualy-staging/staging.env')"
TEST_LOGIN_KEY="$(printf '%s\n' "$SECRETS" | sed -n 's/^TEST_LOGIN_KEY=//p')"
INTERNAL_API_SECRET="$(printf '%s\n' "$SECRETS" | sed -n 's/^INTERNAL_API_SECRET=//p')"
export TEST_LOGIN_KEY INTERNAL_API_SECRET
export WEB_URL=http://localhost:4001 API_URL=http://localhost:4000
export E2E_PSQL="ssh $HOST docker exec -i revualy-staging-postgres-1 psql -U revualy -d revualy_staging -t -A -v ON_ERROR_STOP=1"

if [ "$MODE" = "smoke" ]; then
  npx playwright test specs/auth-guards.spec.ts specs/routes.spec.ts specs/one-on-one-notes.spec.ts --retries=0 "$@"
else
  npx playwright test "$@"
fi
