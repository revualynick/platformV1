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
- Domain `revualy.com` with wildcard DNS pointing to Railway
- Google Cloud project with OAuth credentials
- Anthropic API key
- Resend account for transactional email

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
NODE_ENV=production
```

### 4. Run Migrations

```bash
# Connect to the Railway Postgres instance
railway run --service api pnpm --filter=@revualy/db migrate
```

### 5. Seed Initial Data

```bash
railway run --service api pnpm --filter=@revualy/db seed
```

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
