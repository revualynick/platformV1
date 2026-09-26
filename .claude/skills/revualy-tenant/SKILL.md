---
name: revualy-tenant
description: Use when Nick asks to provision, set up, onboard or create a new Revualy customer or tenant (subdomain.revualy.com), resume or recover a half-finished provisioning, list tenants, migrate every tenant's database, or check fleet health. Drives scripts/tenant/provision.ts and scripts/tenant/fleet.ts, dry run first.
allowed-tools: Bash(pnpm tenant:provision:*), Bash(pnpm tenant:fleet:*), Read
---

# Revualy tenant provisioning

Each customer is an isolated Railway project (api, web, Postgres, Redis) at
`<subdomain>.revualy.com`. The scripts automate the manual procedure in
`docs/deployment.md`, which stays the reference.

## When to use

- "Set up / provision / onboard <customer>", "new tenant", "create acme.revualy.com"
- "Carry on with <tenant>", "provisioning failed at ...", "re-run the DNS step"
- "List tenants", "migrate all tenants", "are the tenants healthy?"

Not for: the demo site (apex domain, `DEMO_MODE=true`), key rotation (`docs/key-rotation.md`).

## Safety rules (non-negotiable)

1. **Dry run first, always.** Every command defaults to a dry run that prints the exact
   commands and API requests and changes nothing. Show Nick the output (or a faithful
   summary of it) before anything else.
2. **`--apply` only with Nick's explicit approval of that specific run.** Approval for one
   step or one tenant is not approval for the next. Never add `--apply` on your own
   initiative, and never to "just check something".
3. **Never print, echo, paste or commit a secret.** Do not `cat` the secrets file
   (`~/.revualy/tenants/<sub>/secrets.json`), do not run `railway variables` yourself,
   do not run `--reveal-key` (it refuses non-terminal output anyway). If a secret ever
   appears in your context, stop and tell Nick so he can rotate it.
4. **Key backup before anything is written.** The encryption key is unrecoverable if lost,
   and every encrypted field goes with it. The script will not write secrets to Railway
   until the key has been revealed in Nick's own terminal and he confirms with
   `--key-backed-up`. Only pass `--key-backed-up` after Nick has said, in this
   conversation, that the key is stored in the password manager.
5. **Never run `pnpm --filter=@revualy/db seed` or `bootstrap` against a tenant.** Both wipe
   every table. The provisioning seed is `seed:defaults`, which only adds missing rows.
6. State files (`scripts/tenant/state/*.json`) hold ids and progress only. They are
   gitignored; never force-add them.

## Commands

```bash
# 1. Dry run a new tenant (safe, no changes)
pnpm tenant:provision --name "Acme Corp" --subdomain acme \
  --admin-email ops@acme.com --chat-platform google_chat \
  --region europe-west4-drams3a --template <railway-template-code>

# 2. After Nick approves: apply. Later runs need only --subdomain.
pnpm tenant:provision --subdomain acme --apply

# Nick, in HIS OWN terminal (not through Claude Code):
pnpm tenant:provision --subdomain acme --reveal-key

# 3. After Nick confirms the key is in the password manager:
pnpm tenant:provision --subdomain acme --key-backed-up            # dry run
pnpm tenant:provision --subdomain acme --key-backed-up --apply

# 4. After Nick adds the Google OAuth redirect URIs:
pnpm tenant:provision --subdomain acme --oauth-configured --apply

# Fleet
pnpm tenant:fleet list
pnpm tenant:fleet migrate --canary acme          # dry run: order + commands
pnpm tenant:fleet migrate --canary acme --apply  # stops at first failure
pnpm tenant:fleet health                         # dry run: prints the requests
```

Steps, in order: `railway-project`, `secrets`, `env-vars`, `dns`, `oauth`, `migrate`,
`seed`, `readiness`. Exit code 2 means a live run paused for Nick (key backup or OAuth).

Operator environment the live run reads (never pass these on the command line):
`CLOUDFLARE_API_TOKEN` (Zone.DNS edit on revualy.com), optional `CLOUDFLARE_ZONE_ID`,
`RAILWAY_API_TOKEN` or a `railway login` session, optional `REVUALY_RAILWAY_TEMPLATE`, and
the fleet-wide `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`,
`RESEND_API_KEY` (anything missing becomes a manual follow-up). Chat platform credentials
are always set by hand, per customer.

## Recovering from a failed step

Every step is idempotent and records completion in the state file only when it succeeds.
The failure message names the step and the exact re-run command.

1. Read the error. Fix the cause (often: token missing, template not found, DNS conflict).
2. Dry run from that step: `pnpm tenant:provision --subdomain acme --from-step dns`.
3. With Nick's approval, add `--apply`.

Specific cases:

- **railway-project: "project already exists but is not in the state file"**: someone created
  it by hand or a previous state file was lost. Do not delete anything. Ask Nick.
- **railway-project: "some but not all services"**: a template deploy half-finished. Fix in
  the Railway dashboard; re-deploying would duplicate services. If it says services are
  "not visible yet", wait a minute and re-run the step.
- **secrets: "local secrets file is missing"**: if env-vars has not run, nothing reached
  Railway. Restore the file from the password manager, or (only if no data exists anywhere)
  clear `encryptionKey`, `keyRevealedAt`, `keyBackedUpAt` and `completedSteps.secrets` in
  the state file and re-run. Never do this after env-vars.
- **env-vars: "already has ENCRYPTION_KEYS with a different key"**: stop. Something else
  wrote a key; overwriting it would orphan data. Nick decides.
- **dns: "already has a ... record"**: the name is taken in Cloudflare. Not overwritten on
  purpose. Nick resolves it in Cloudflare, then re-run `--from-step dns`.
- **readiness failures**: usually a deploy still in progress or a missing follow-up
  variable (Google client, chat credentials). Check `railway logs` from
  `~/.revualy/tenants/<sub>/railway`, fix, re-run `--from-step readiness`.
- **fleet migrate stopped at a tenant**: later tenants were not touched. Fix that tenant,
  then re-run with `--only` for the remainder.

## Where things live

- `scripts/tenant/provision.ts`, `fleet.ts`, `lib/` (logic), `__tests__/` (vitest, no network)
- `~/.revualy/tenants/<sub>/railway/`: directory linked to that tenant's Railway project;
  every railway command runs there, so one tenant's link can never point at another's project
- `~/.revualy/tenants/<sub>/secrets.json`: mode 600, exists only between `secrets` and
  `env-vars`, then deleted
- Override locations with `REVUALY_TENANT_STATE_DIR` and `REVUALY_TENANT_HOME`
