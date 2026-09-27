#!/usr/bin/env bash
# Runs ON the Linux box, called by scripts/staging/deploy.sh from the laptop.
# Builds the release's Docker images (the same Dockerfiles Railway builds),
# then switches staging to them.
#
# Layout under ~/revualy-staging:
#   releases/<sha>/   one directory per deployed commit (last 3 kept)
#   current -> releases/<sha>
#   staging.env       secrets, generated on the first run, never leaves the box
#   data/             Postgres and Redis volumes
#
# Everything listens on 127.0.0.1 only. Open it from the laptop with
#   ssh -N -L 3001:localhost:3001 -L 3000:localhost:3000 nick@linuxbox.local
# then browse http://localhost:3001.
#
# TEST_LOGIN=off (passed through by deploy.sh) runs with the test login
# disabled, as production does. SEED=force reseeds (wipes staging data).
# E2E=smoke runs the quick browser set afterwards (from deploy.sh, laptop side).
set -euo pipefail

ROOT="$HOME/revualy-staging"
RELEASE="${1:?release directory}"
SHA="$(basename "$RELEASE")"
ENV_FILE="$ROOT/staging.env"
export PATH="$HOME/.local/bin:$PATH"

log() { printf '\n== %s\n' "$*"; }

mkdir -p "$ROOT/data/postgres" "$ROOT/data/redis"

# 1. Secrets, once. Values are generated here and never printed.
if [ ! -f "$ENV_FILE" ]; then
  log "Generating staging.env (first run)"
  umask 077
  rnd() { openssl rand -hex "$1"; }
  PG_PASS="$(rnd 24)"; REDIS_PASS="$(rnd 24)"
  cat > "$ENV_FILE" <<EOF
# Revualy staging on the Linux box. Generated $(date -u +%Y-%m-%dT%H:%M:%SZ). Local to this box.
STAGING_ROOT=$ROOT
POSTGRES_PASSWORD=$PG_PASS
REDIS_PASSWORD=$REDIS_PASS
# Host-side URLs (seeding from the box); the containers use service names instead.
DATABASE_URL=postgresql://revualy:$PG_PASS@127.0.0.1:55432/revualy_staging
REDIS_URL=redis://:$REDIS_PASS@127.0.0.1:56379
ORG_ID=staging-org
APP_URL=http://localhost:3001
NEXTAUTH_URL=http://localhost:3001
CORS_ORIGIN=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3000
INTERNAL_API_SECRET=$(rnd 32)
NEXTAUTH_SECRET=$(rnd 32)
AUTH_SECRET=$(rnd 32)
WS_TOKEN_SECRET=$(rnd 32)
ENCRYPTION_KEY=$(rnd 32)
REVIEWER_PSEUDONYM_SECRET=$(rnd 32)
TEST_LOGIN_ENABLED=true
TEST_LOGIN_KEY=$(rnd 24)
DEMO_MODE=false
LLM_PROVIDER=anthropic
LOG_LEVEL=info
EOF
  chmod 600 "$ENV_FILE"
fi
# Added later: the fleet ops token (C3 step 8), generated here if missing, never printed.
if ! grep -q '^OPS_TOKEN=' "$ENV_FILE"; then
  printf 'OPS_TOKEN=%s\n' "$(openssl rand -hex 32)" >> "$ENV_FILE"
fi
set -a; . "$ENV_FILE"; set +a
export STAGING_ROOT="$ROOT" RELEASE_SHA="$SHA"
if [ "${TEST_LOGIN:-on}" = "off" ]; then export TEST_LOGIN_ENABLED=false; fi

COMPOSE=(docker compose -p revualy-staging -f "$RELEASE/scripts/staging/docker-compose.yml")

# 2. Retire the pre-Docker setup (user services running node directly), if present.
for unit in revualy-staging-api revualy-staging-web; do
  if systemctl --user list-unit-files "$unit.service" >/dev/null 2>&1 && [ -f "$HOME/.config/systemd/user/$unit.service" ]; then
    log "Removing old user service $unit"
    systemctl --user disable --now "$unit.service" >/dev/null 2>&1 || true
    rm -f "$HOME/.config/systemd/user/$unit.service"
  fi
done
systemctl --user daemon-reload

# 3. Build the images. The running containers keep serving until this passes.
log "Build images for $SHA (Railway's Dockerfiles)"
"${COMPOSE[@]}" build api web

# 4. Switch: data services, then the new API (it migrates at boot, as on Railway) and web.
log "Switch staging to $SHA (test login: ${TEST_LOGIN_ENABLED})"
ln -sfn "$RELEASE" "$ROOT/current"
"${COMPOSE[@]}" up -d --wait postgres redis
"${COMPOSE[@]}" up -d --force-recreate api web

# 5. Health (the API finishes migrating before it listens).
log "Health"
ok=""
for _ in $(seq 1 90); do
  api=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3000/health || true)
  web=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3001/login || true)
  if [ "$api" = "200" ] && [ "$web" = "200" ]; then ok=1; break; fi
  sleep 2
done
if [ -z "$ok" ]; then
  echo "Staging did not come up (api=$api web=$web). Logs: docker compose -p revualy-staging logs --tail 50 api web"
  exit 1
fi

# 6. Seed only an empty database. The seed runs from source on the box
# (it isn't part of the production images), so it needs a one-off install.
USERS=$("${COMPOSE[@]}" exec -T postgres psql -U revualy -d revualy_staging -tAc "select count(*) from users" 2>/dev/null || echo 0)
if [ "${USERS// /}" = "0" ] || [ "${SEED:-auto}" = "force" ]; then
  log "Seed demo org (database was empty, or SEED=force: this wipes staging data)"
  (cd "$RELEASE" && CI=true pnpm install --frozen-lockfile >/dev/null && pnpm turbo build --filter=@revualy/db^... >/dev/null && pnpm --filter @revualy/db seed)
fi

echo "Staging is up at $SHA (api $api, web $web, test login $TEST_LOGIN_ENABLED)"

# 7. Keep the last three releases and their images.
ls -1dt "$ROOT"/releases/*/ | tail -n +4 | while read -r old; do
  sha="$(basename "$old")"
  rm -rf "$old"
  docker image rm "revualy-staging-api:$sha" "revualy-staging-web:$sha" >/dev/null 2>&1 || true
done
