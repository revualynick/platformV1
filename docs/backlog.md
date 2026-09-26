# Backlog

One list of everything open, so nothing lives only in an old review or a session log. When an item is done, delete it here and record it in `.claude/log.md`. When a new review or session finds something, add it here with its source.

Last consolidated: 2026-09-26, from `docs/c3-plan.md`, `docs/plan.md`, the archived reviews and the 2026-09-26 session. "Checked" means I confirmed in the code on that date that it's still open; "not re-checked" means it's carried over from its source as last recorded.

## Before beta (real employees)

- **Set `REVIEWER_PSEUDONYM_SECRET` on Railway** (demo and test tenant) and backfill or reseed their databases (`ENCRYPTION_LEGACY_READS=on` until then) before deploying this branch.
- **Encrypt existing data on each tenant** (C3 step 7 tooling merged 2026-09-26): run `pnpm --filter @revualy/db encryption check`, `backfill`, `check`, or simply reseed. Only the demo and Nick's test tenant hold pre-encryption rows; legacy reads are off by default. See `docs/key-rotation.md`.
- **Pseudonym secret behind a KMS or signing service**, so the API environment alone can't re-identify reviewers (today anyone with the API env and the user list can).
- **Verify the 2026-09-26 merges end to end:** nothing has run against real models or Railway. Deploy the branch to the test tenant, re-run the topic grid on the Linux box against the ticket-based engine, and walk each build note's review checklist.
- **C3 step 8, beta gate:** monitoring counters and alerts, real-Workspace verification checklist, full code review.
- **Google Chat app install** on the beta Workspace (needed for step 8).
- **Wire the reference path into live conversations.** Needs the consent flow. Safety wording will be refined later from established literature on professional feedback, not invented (Nick, 2026-09-26).
- **Revoke the eval API key** on the Linux box when its 7 days are up.

## Bugs

- **H4 Slack bot may process its own messages** (checked 2026-09-26: no `bot_id` filter in the Slack adapter). Only matters once Slack is a tenant platform (C3 step 10).
- **M4 demo LLM spend** (not re-checked): the 3-a-day limit is per unverified email; on real tenants the authenticated `/demo/start` creates real conversations about a real colleague.
- **B17 `next build` prerender failure on /404** (not re-checked; Railway builds may have since passed).
- **`NEXT_PUBLIC_WS_URL` isn't baked into the web build** (found by the provisioning agent, not re-checked). Live 1:1 sessions may not connect in production.
- **First-review leftovers** (C3 step 11, not re-checked): nudge query misses zero-activity users; `engagement_scores.streak` has no writer; duplicate or re-created relationships 500; self-reflection analysis never retried and skips flag detection; 360 aggregation runs inside a transaction; team-insight month keys use local time; member detail page scope differs between web and API; `test-login` open redirect, insecure cookie, key in query string.

## Decisions waiting on Nick


- **Privacy design open questions** (5, at the end of the design doc).
- **Calendar model:** priority weighting as client-adjustable sliders, possibly a learning algorithm later (Nick, 2026-09-26). Still open: focus when the title is hidden, one check-in per meeting, joiner dates, whether sensitive-looking titles reach Haiku at all.
- **Imports:** users with direct reports in the file become managers automatically; new `read-excel-file` dependency; historical feedback is stored but nothing shows it.
- **1:1 ingestion v2:** the sensitive-content backstop over-withholds; a running "meeting notes" Doc can duplicate tasks; uploads allowed in every mode; pair detection is direct reports only. Default mode is semi-automatic (Nick, 2026-09-26).
- **Provisioning:** create the Railway template; guard `seed.ts`, which wipes data; migrations need a public Postgres connection.
- **Topic grid:** 8 borderline expectations in `apps/api/eval/lib/topic-grid.ts`.
- **Admin assistant:** 11 open questions in `docs/design/admin-assistant.md`.
- **Paraphrases file** is only on the Linux box; copying it back needs Nick's permission.

## Features and later work

- **Privacy follow-ups** (from `docs/build/2026-09-26-privacy-step-2-pseudonyms.md` and `...-step-3-tickets.md`):
  - Move the peer feedback write from the analysis pipeline into ticket write-back (the pseudonym hook exists, deliberately unwired to avoid double writes).
  - Anchor the audit chain head outside the database, and a scheduled chain verify.
  - Timing correlation: `feedback_entries.created_at`, behavioural signal times and engagement rows.
  - Escalation screens and pulse triggers still show named data; `imported_feedback.source_key` includes the author id.
  - Chat side still writes `conversation_theme_outcomes` and `checkin_jobs` status directly; personal-ticket goals unused in prompts; 1:1 follow-up tickets not created; reference path not yet called from the orchestrator.
  - Re-run the topic grid on the box to check first-name prompts didn't shift bot quality.
  - Privacy steps 4 to 6: raw transcript storage with per-person keys, row-level security, sharing grants and handover summaries.
- **Typed decisions:** run the calibration on the Linux box (command in `docs/build/2026-09-26-typed-decisions.md`), then decide thresholds and tier; add specs for sensitivity and ticket context.

- **Deterministic layer driven by a reasoning model** (Nick, 2026-09-26): a typed decision layer in the spirit of Jev, built on our own models. The reasoning model returns choices and scores against a fixed schema, and code decides what happens. For alpha and beta, quality comes before token cost.
- C3 step 9: re-presentation engine (re-ask weak or unanswered themes), tuned with beta data.
- C3 step 10: Slack and Teams linking.
- Automatic 1:1 source (Meet REST API or a shared Drive folder) behind `MeetingSource`; web UI for approvals, uploads, between-meeting goals and the mode setting; verify Gemini notes format and location on a real Workspace; proper PDF parsing.
- Employee handover system (spec in `docs/plan.md`), now shaped by the handover summary in the privacy design.
- Outlook calendar integration.
- Stripe billing.
- Production monitoring and alerting.
- Curated demo seed data.
- GitHub Actions provisioning automation.

## Technical debt

- `pnpm tenant:fleet migrate` runs migrations under the Postgres service's variables, which lack `REVIEWER_PSEUDONYM_SECRET`, so migration 0043 would refuse on a tenant with feedback rows. Deployed tenants migrate at API boot with the secret, so this only affects the fleet tool. Fix: run it through the API service, or pass the secret (found 2026-09-26).
- Local Postgres (Docker bind mount on macOS) occasionally fails `CREATE DATABASE` under heavy parallel load with "could not open file ... Permission denied". Intermittent, environmental; seen twice on 2026-09-26.


- Read-only Postgres role for the web app.
- Parity tests for endpoints migrated to direct reads; auth matrix tests.
- Service-layer caching.
- Timezone-aware scheduling (`date-fns-tz`) before non-UTC customers.
- Dialog escape and backdrop close; duplicated `COMMON_TIMEZONES`.
- Mobile layout for the app shell.
- Dead control-plane code (`packages/db/src/client.ts` exports, `schema/control-plane.ts`, `drizzle.config.control-plane.ts`, `migrations-control-plane/`).
