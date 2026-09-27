# Beta gate: monitoring, alerts and the real-Workspace checklist

Status: merged 2026-09-28, not reviewed
Commits: b4411c9, 1821080 · Migration: 0050 · Design: `docs/c3-plan.md` step 8

## What and why
C3 step 8 needs three things before real employees use the product: monitoring with alerts, a checklist for the real Google Workspace, and a full code review. This note covers the first two. The review has its own note.

Nick runs platform operations through Claude Code, so there's no ops dashboard in the product. Each tenant works out its own status and emails the operator, and `pnpm tenant:fleet health` shows every tenant's status.

## What changed
- **Checks** (`apps/api/src/lib/ops-status.ts`): all counts or ages, never names or content.
  - `inbound_stuck`: incoming chat messages not processed after 10 minutes. Fail.
  - `undelivered`: bot replies not sent after 15 minutes. Fail.
  - `unanswered`: people waiting over 15 minutes for a reply. Fail.
  - `stale_open`: conversations quiet for over 26 hours but still open. Warn.
  - `analysis_missing`: finished conversations not analysed after 2 hours. Warn.
  - `model_fallbacks`: at least 5 answers, and at least 20%, judged without the model in 24 hours. Warn.
  - `failed_jobs`: 5 or more jobs failed for good in the last hour. Warn.
  - `audit_chain`: the audit log's hash chain is broken. Fail.
  - `encryption_legacy_reads`: legacy reads are still on. Warn.
  - Heartbeats: `job_sweep` (warn after 15 minutes, fail after 30), `job_scheduling-pass` and `job_calendar-model` (warn after 26 hours, fail after 50), `job_calendar-sync` (warn after 45 minutes, fail after 3 hours). A job that hasn't had its first chance since boot isn't late.
- **Heartbeats** (migration 0050 `ops_heartbeats`): written from the workers' completed and failed events. Only error class names are kept, never messages.
- **Alerts** (`ops-alerts.ts`, job `ops_check` every 15 minutes): email to `OPS_ALERT_EMAIL` on a new problem, again every 6 hours for a failure or 24 for a warning, and once on recovery. Always written to the logs as well. The choice of what to send is a pure function (`decideAlerts`) with its own tests.
- **Access:**
  - API `GET /api/v1/ops/status`: internal secret (server to server) or a super admin. Returns 503 while anything fails.
  - Web `GET /api/ops/status`: bearer `OPS_TOKEN`. The API is private on Railway, so this route is the way in. It returns 404 when the token isn't set.
  - `pnpm tenant:fleet health` adds a row for each failing check.
  - `OPS_TOKEN` and `OPS_ALERT_EMAIL` are fleet-wide operator variables. Staging generates an `OPS_TOKEN` on the box.
- **Checklist** (`docs/real-workspace-checklist.md`): setup, install and authentication (every Google Chat assumption we've never seen live is marked), reaching people, a conversation end to end, what people see, 1:1 notes, and a review after the first week.

## Where it differs from the design
- The plan said "counters". These are worked out from the database on demand, not incremented in code. There's no metrics system to run, and they can't drift from the truth. The cost is a few queries every 15 minutes.
- One ops token for the whole fleet, not one per tenant. Provisioning deletes each tenant's secrets file, so a per-tenant token would have nowhere to live. If the token leaked, it would expose status counts for every tenant, but no personal data.

## How it was tested
- `ops-alerts.test.ts` (3): raise once, repeat after the interval, warn to fail raised at once, recovery reported once.
- `ops-status.integration.test.ts` (4):
  - stuck inbound, undelivered and unanswered each fail, and the output holds no message text
  - heartbeat ageing and the grace period after boot
  - an alert sent once and remembered
  - endpoint access: internal call and super admin allowed, admin refused, no secret refused
- `scripts/tenant/__tests__/fleet-ops.test.ts` (3). API 616/616, tenant scripts 34/34, typecheck 17/17.
- Staging: the route answered 401 without a token and with a wrong one, and 200 with the right one, every check ok.
- **Not run:** an alert email through Resend (staging has no email key), and the checklist itself (needs the Chat app).

## Review checklist
- [ ] Are the thresholds right for a beta of about 120 people? They sit behind the sweeper's own.
- [ ] Is any check likely to fire every week for no good reason? `failed_jobs` is the most likely.
- [ ] Is one fleet-wide ops token acceptable?

## Not done / limits
- An alert email hasn't been delivered for real yet.
- There's no alert if the api container is down entirely: the check runs inside it. Railway's own crash alerts cover that, and so does `fleet health` from the laptop.
- The audit chain check reads the whole chain every 15 minutes. That's fine at beta volumes, but it should verify incrementally from a stored head once the log is large (this ties in with the backlog item on anchoring the chain head).
