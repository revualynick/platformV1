# Revualy — Railway Deployment Guide

## Architecture

Each customer gets their own isolated deployment at `subdomain.revualy.com`:

```
acme.revualy.com
├── API service    (Fastify + BullMQ workers)
├── Web service    (Next.js 15)
├── PostgreSQL     (Railway managed)
└── Redis          (Railway managed)
```

The marketing/demo site at `revualy.com` uses the same codebase with `DEMO_MODE=true`.

## Prerequisites

- Railway account with team plan
- GitHub repo connected to Railway
- Domain `revualy.com` on Cloudflare (each tenant gets its own CNAME to its web service; a single wildcard cannot point at several Railway projects)
- Google Cloud project with OAuth credentials
- Anthropic API key
- Resend account for transactional email

## Provisioning a New Tenant (Scripted)

`scripts/tenant/provision.ts` automates the manual steps below, one idempotent step at a time, and is meant to be driven through Claude Code with the `revualy-tenant` skill (`.claude/skills/revualy-tenant/SKILL.md`). It is a **dry run by default**: it prints every command and API request, with secrets redacted, and changes nothing. `--apply` performs the steps.

```bash
# Dry run
pnpm tenant:provision --name "Acme Corp" --subdomain acme --admin-email ops@acme.com \
  --chat-platform google_chat --region europe-west4-drams3a --template <railway-template-code>

# Apply, then resume after each pause (only --subdomain is needed once state exists)
pnpm tenant:provision --subdomain acme --apply
pnpm tenant:provision --subdomain acme --reveal-key          # in your own terminal only
pnpm tenant:provision --subdomain acme --key-backed-up --apply
pnpm tenant:provision --subdomain acme --oauth-configured --apply

# Re-run from a failed step
pnpm tenant:provision --subdomain acme --from-step dns [--apply]

# Fleet
pnpm tenant:fleet list
pnpm tenant:fleet migrate --canary acme [--apply]
pnpm tenant:fleet health [--apply]
```

| Step | Manual equivalent |
|------|-------------------|
| `railway-project` | 1, 2: project from the Railway template, region pinned, api health check |
| `secrets` | 3: generates `ENCRYPTION_KEYS=k1:<hex>`, auth/internal/WS secrets and `ORG_ID`; pauses until the key is backed up |
| `env-vars` | 3: sets per-service variables over stdin; lists what must be set by hand |
| `dns` | 6: custom domain on web, Railway domain on api, Cloudflare records (unproxied) |
| `oauth` | 7: prints the Google Cloud Console changes; confirm with `--oauth-configured` |
| `migrate` | 4 |
| `seed` | 5, using the non-destructive `seed:defaults` |
| `readiness` | health, login path, test-login disabled, encryption round trip on api and web |

Prerequisites for `--apply`: the Railway CLI logged in, a Railway template containing services named exactly `api`, `web`, `Postgres` and `Redis`, `CLOUDFLARE_API_TOKEN` with DNS edit on the `revualy.com` zone, and optionally the fleet-wide `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY` in the environment. State (ids and progress, no secrets) is written to `scripts/tenant/state/<subdomain>.json`, which is gitignored.

The manual procedure below remains the reference for what the script does.

## Provisioning a New Tenant (Manual — Beta)

### 1. Create Railway Project

```bash
# In Railway dashboard:
# 1. New Project → from GitHub repo
# 2. Name: "revualy-{customer-slug}" (e.g. "revualy-acme")
```

### 2. Add Services

Create 4 services in the project:

| Service | Type | Config |
|---------|------|--------|
| **api** | GitHub (Dockerfile at root) | Port 3000, health check `/health` |
| **web** | GitHub (Dockerfile at `apps/web/Dockerfile`) | Port 3001 |
| **postgres** | Railway Plugin | PostgreSQL 16 |
| **redis** | Railway Plugin | Redis 7 |

### 3. Configure Environment Variables

Set these on **both** api and web services (Railway shares vars within a project):

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
ORG_ID=<generate UUID>
ORG_NAME=Acme Corp
NEXTAUTH_URL=https://acme.revualy.com
NEXTAUTH_SECRET=<openssl rand -base64 32>
INTERNAL_API_SECRET=<openssl rand -base64 32>
INTERNAL_API_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:3000
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
ANTHROPIC_API_KEY=<from Anthropic Console>
RESEND_API_KEY=<from Resend dashboard>
ENCRYPTION_KEY=<openssl rand -hex 32>
WS_TOKEN_SECRET=<openssl rand -base64 32>
TRUST_PROXY=1
NODE_ENV=production
# Google Chat tenants only:
GCHAT_SERVICE_ACCOUNT_KEY=<service account JSON>
GCHAT_PROJECT_ID=<project id>
GOOGLE_CHAT_AUDIENCE=<project NUMBER, or the https webhook URL, matching the Chat API Authentication audience setting>
```

**Encryption key (required on both services).** Feedback content, messages and notes are encrypted at rest, and both the API and the web server read them, so both refuse to start without `ENCRYPTION_KEY`. Each tenant gets its own key.

- **Back it up outside Railway** (password manager or vault) before any real data is written. Losing the key means the encrypted data cannot be recovered.
- **Rotation:** set `ENCRYPTION_KEYS=k2:<new hex>,k1:<old hex>` (newest first). New writes use `k2`; values under `k1` keep decrypting. Remove `k1` only after the re-encrypt job has rewritten everything (C3 plan step 7).
- Anyone with access to the Railway project can read both the database and the key. Treat project access accordingly.

### 4. Run Migrations

```bash
# Connect to the Railway Postgres instance
railway run --service api pnpm --filter=@revualy/db migrate
```

### 5. Seed Initial Data

```bash
SEED_ORG_NAME="Acme Corp" SEED_SUBDOMAIN=acme SEED_ADMIN_EMAIL=ops@acme.com \
  railway run --service Postgres -- sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" pnpm --filter=@revualy/db seed:defaults'
```

`seed:defaults` adds org settings (allowed login domain = the admin's email domain, or `SEED_ALLOWED_DOMAINS`), the default core values, the built-in questionnaires and the first `super_admin`, skipping anything that already exists. **Never run `seed` or `bootstrap.ts` against a tenant: both delete every table first** (`seed` then loads demo data).

`railway run` executes locally with the service's variables, so use the Postgres service's `DATABASE_PUBLIC_URL`; the private `DATABASE_URL` is not reachable from a laptop. The same applies to step 4.

### 6. Configure Custom Domain

In Railway dashboard → web service → Settings → Domains:
- Add `acme.revualy.com`
- Railway provisions SSL automatically

### 7. Configure Google OAuth

In Google Cloud Console → OAuth consent screen:
- Add `acme.revualy.com` to authorized domains
- Add `https://acme.revualy.com/api/auth/callback/google` to redirect URIs

## Demo Site Deployment

Same process as above, but with additional env var:

```
DEMO_MODE=true
```

And custom domain set to `revualy.com` (apex domain).

## Monitoring

- Railway provides built-in logs, metrics, and crash alerts
- API health check: `GET /health`
- Consider adding Sentry for error tracking (future)

## Scaling

Railway auto-scales based on traffic. Per-tenant isolation means one noisy tenant can't affect others.

To upgrade a tenant's resources:
1. Railway dashboard → Project → Service → Settings
2. Adjust CPU/memory limits
3. Changes apply on next deploy

## Cost Estimate Per Tenant

| Component | Monthly Cost |
|-----------|-------------|
| Postgres (1GB) | ~$5 |
| Redis (25MB) | ~$3 |
| API service | ~$5-10 |
| Web service | ~$5-10 |
| **Total infra** | **~$20-25** |

Revenue per tenant at 50 employees: $180/mo → ~86% gross margin.
