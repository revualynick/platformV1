# Encryption Key Rotation

## Overview

Revualy encrypts sensitive data at rest using AES-256-GCM with a single `ENCRYPTION_KEY` (64-character hex string = 32 bytes). This document covers when and how to rotate it.

## What Gets Encrypted

| Table | Columns | Contents |
|-------|---------|----------|
| `calendar_tokens` | `access_token`, `refresh_token` | Google Calendar OAuth tokens |
| `auth_account` | `access_token`, `refresh_token`, `id_token` | NextAuth Google OAuth tokens |
| `integrations` | `config` (JSONB `{ _encrypted: "..." }`) | Platform API credentials (Slack, Teams, etc.) |

Both the **API** and **web** services share the same `ENCRYPTION_KEY`.

## When to Rotate

- Suspected key compromise
- Employee with key access leaves the organization
- Compliance policy requires periodic rotation
- Migrating to a new infrastructure provider

## Rotation Procedure

### 1. Generate a new key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Put the application in maintenance mode

Stop or drain both the API and web services to prevent concurrent encrypted writes during rotation.

```bash
railway down --service api -y
railway down --service web -y
```

### 3. Dry-run the rotation script

```bash
OLD_ENCRYPTION_KEY=<current-key> \
ENCRYPTION_KEY=<new-key> \
DATABASE_URL=<production-db-url> \
tsx scripts/rotate-encryption-key.ts --dry-run
```

Review the output — it shows how many rows will be rotated and any rows it can't decrypt (e.g., pre-migration plaintext tokens).

### 4. Run the rotation

```bash
OLD_ENCRYPTION_KEY=<current-key> \
ENCRYPTION_KEY=<new-key> \
DATABASE_URL=<production-db-url> \
tsx scripts/rotate-encryption-key.ts
```

### 5. Update the environment variable

```bash
railway variables set ENCRYPTION_KEY=<new-key> --service api
railway variables set ENCRYPTION_KEY=<new-key> --service web
```

### 6. Redeploy

```bash
railway redeploy --service api -y
railway redeploy --service web -y
```

### 7. Verify

```bash
railway logs --service api --latest --lines 20
```

Confirm the API starts without errors and auth/integration flows work.

## Other Secrets

| Secret | Rotation Impact | Procedure |
|--------|----------------|-----------|
| `WS_TOKEN_SECRET` | Safe to rotate anytime. In-flight WS handshakes (60s window) may fail once. | Set new value in Railway, redeploy API. |
| `INTERNAL_API_SECRET` | Requires updating on both API and web simultaneously. | Set on both services, redeploy both at once. |
| `NEXTAUTH_SECRET` | Invalidates all active sessions (users must re-login). | Set on web service, redeploy. |
| `GOOGLE_CLIENT_SECRET` | Requires updating in Google Cloud Console first. | Update in GCP, then set on web service. |

## Notes

- The script handles two encryption formats: the `@revualy/shared` binary format (calendar + auth tokens) and the API's colon-delimited format (integration configs).
- Rows that fail to decrypt are skipped with a warning — this handles pre-migration plaintext data gracefully.
- Always test with `--dry-run` first.
- Keep the old key available until you've verified the rotation succeeded.
