#!/usr/bin/env bash
# Runs ON the Linux box, called by scripts/staging/deploy.sh from the laptop.
# Builds the release that deploy.sh unpacked, then switches staging to it.
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
DATABASE_URL=postgresql://revualy:$PG_PASS@127.0.0.1:55432/revualy_staging
REDIS_URL=redis://:$REDIS_PASS@127.0.0.1:56379
ORG_ID=staging-org
APP_URL=http://localhost:3001
NEXTAUTH_URL=http://localhost:3001
CORS_ORIGIN=http://localhost:3001
INTERNAL_API_URL=http://127.0.0.1:3000
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
set -a; . "$ENV_FILE"; set +a

# 2. Data services (idempotent).
log "Postgres and Redis"
docker compose -p revualy-staging -f "$RELEASE/scripts/staging/docker-compose.yml" --env-file "$ENV_FILE" up -d --wait

# 3. Build the new release. Staging keeps running the old one until this passes.
log "Install and build $SHA"
cd "$RELEASE"
CI=true pnpm install --frozen-lockfile >/dev/null
# NODE_ENV=production for the build; NEXT_PUBLIC_WS_URL is baked into the web bundle.
NODE_ENV=production pnpm turbo build >/dev/null
# Next.js standalone output needs its static files and public dir beside it.
cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static
[ -d apps/web/public ] && cp -r apps/web/public apps/web/.next/standalone/apps/web/public

# 4. Migrate (same path the API runs at boot), then seed only an empty database.
log "Migrate"
pnpm --filter @revualy/db migrate
USERS=$(docker compose -p revualy-staging -f "$RELEASE/scripts/staging/docker-compose.yml" --env-file "$ENV_FILE" \
  exec -T postgres psql -U revualy -d revualy_staging -tAc "select count(*) from users" 2>/dev/null || echo 0)
if [ "${USERS// /}" = "0" ]; then
  log "Seed demo org (database was empty)"
  pnpm --filter @revualy/db seed
fi

# 5. Switch: services, symlink, restart.
log "Switch staging to $SHA"
mkdir -p "$HOME/.config/systemd/user"
cp "$RELEASE/scripts/staging/revualy-staging-api.service" "$RELEASE/scripts/staging/revualy-staging-web.service" \
  "$HOME/.config/systemd/user/"
sed -i "s#^Environment=HOST=#Environment=PATH=$(dirname "$(command -v node)"):/usr/bin:/bin\nEnvironment=HOST=#" \
  "$HOME/.config/systemd/user/revualy-staging-api.service"
sed -i "s#^Environment=HOSTNAME=#Environment=PATH=$(dirname "$(command -v node)"):/usr/bin:/bin\nEnvironment=HOSTNAME=#" \
  "$HOME/.config/systemd/user/revualy-staging-web.service"
ln -sfn "$RELEASE" "$ROOT/current"
systemctl --user daemon-reload
systemctl --user enable revualy-staging-api.service revualy-staging-web.service >/dev/null 2>&1
systemctl --user restart revualy-staging-api.service revualy-staging-web.service

# 6. Health check.
log "Health"
ok=""
for _ in $(seq 1 60); do
  api=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3000/health || true)
  web=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3001/login || true)
  if [ "$api" = "200" ] && [ "$web" = "200" ]; then ok=1; break; fi
  sleep 2
done
if [ -z "$ok" ]; then
  echo "Staging did not come up (api=$api web=$web). Logs: journalctl --user -u revualy-staging-api -u revualy-staging-web -n 50"
  exit 1
fi
echo "Staging is up at $SHA (api $api, web $web)"

# 7. Keep the last three releases.
ls -1dt "$ROOT"/releases/*/ | tail -n +4 | xargs -r rm -rf
