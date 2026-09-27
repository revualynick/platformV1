# Revualy

AI-powered peer feedback that happens in chat. Instead of annual review forms, a bot holds short check-ins with people in Google Chat, Slack or Teams, about colleagues they actually worked with and meetings they actually attended. Dashboards turn the results into themes, goals and coaching for employees, managers and admins.

This README is the running summary. It is kept current: when something important changes, update the relevant section here and add a line to the decisions log. Detail lives in `docs/` (index in `docs/README.md`), open work in `docs/backlog.md`, and what was built and how to review it in `docs/build/`.

## Where it stands (2026-09-26)

- **Phase:** beta hardening on the `beta-hardening` branch, not yet merged or pushed. Roadmap in `docs/c3-plan.md`: steps 0 to 7 done, 8 onwards open.
- **Beta platform:** Google Chat, one chat platform per tenant. The app isn't installed on the beta Workspace yet.
- **Deployed:** a demo on Railway (`revualy-demo`, Europe West). No customer tenants yet.
- **Review:** build notes for each merged piece are in `docs/build/`, with a checklist for human or agent review.
- **Before real employees use it:** privacy steps 2 and 3 (`docs/design/privacy-and-agent-access.md`), running the encryption backfill on each tenant, and the beta gate (monitoring, real-Workspace checks, full review).
- **Tests:** 464 API tests and a clean typecheck across 17 packages at the last merge, plus Playwright end-to-end specs and an LLM evaluation harness.

## How it works

1. **Plan.** Each night a calendar model (Haiku) reads meeting metadata and proposes check-ins: who to ask, about whom, and which shared meeting to refer to. A code gate rejects invented references, 1:1s and sensitive meetings.
2. **Ask.** The scheduler picks from those proposals within contact limits: at most one peer check-in and one or two personal ones a week, up to 3 exchanges each, with a gap of 3 days and a rest after a rich conversation. "You were on the Acme call with Jon on Tuesday. How did he do?"
3. **Talk.** Every inbound message is stored first, then processed. Routine turns take one structured LLM call (Sonnet 5), with code enforcing the rules. Messages that raise a concern go to a reference path that reads the concerns playbook before answering; serious concerns (wellbeing, conduct, safety) go to Opus 5.5. For wellbeing and safety the bot hands over rather than judging risk: it offers to put the person in touch with the organisation's support contact, and passes on a name only if they say yes. It never refers to emergency services and doesn't over-flag a bad day.
4. **Analyse.** Finished conversations are analysed for themes, sentiment, core values and engagement. Unanswered conversations become incomplete and are analysed as partial.
5. **1:1s.** Gemini notes and transcripts from Google Meet 1:1s become tasks, between-meeting goals and goal suggestions. The default is semi-automatic: the manager approves each import.
6. **Show.** Dashboards for employees, managers and admins; exports; calibration; 360 reviews; pulse checks; kudos.

## Privacy model (agreed, being built)

- **Reviews of others** are stored under a pseudonym, aggregated, and released with a lag. Only a super admin can re-identify a reviewer, and every use is written to an immutable log.
- **Self data** (reflections, personal check-ins) is private to the person and their manager. Wider sharing needs the person's approval.
- **1:1 content** stays between the two people in the 1:1. Skip-levels, HR and admins see signals (are 1:1s happening, are goals moving), not content, unless there's a transfer or a formal issue.
- **Raw inputs** are encrypted at rest. The chat bot never touches the database: it works from a ticket prepared by a job agent, and a code gate decides what goes into each ticket.

Full design: `docs/design/privacy-and-agent-access.md`.

## Architecture

- **Per-tenant isolated deployments** on Railway: each customer gets `name.revualy.com` with its own API, web app, Postgres and Redis. The marketing and demo site runs the same code with `DEMO_MODE=true`.
- **Chat-platform agnostic:** a `ChatAdapter` interface with Slack, Google Chat and Teams adapters.
- **Stack:** TypeScript, Turborepo and pnpm; Fastify 5 API with BullMQ workers; Next.js 15 web app; PostgreSQL 16 with pgvector via Drizzle (migrations 0000 to 0041); Redis 7 for jobs; Anthropic models through a provider-agnostic gateway (fast, standard and advanced tiers).
- **Auth:** NextAuth with database sessions and Google OAuth; role checks on every route.

```
apps/api/                    Fastify API, workers, bot engine, eval harness (apps/api/eval)
apps/web/                    Next.js dashboards and marketing site
packages/shared/             Domain types, encryption
packages/db/                 Drizzle schema, migrations, seed
packages/chat-core/          ChatAdapter interface and registry
packages/chat-adapter-*/     Slack, Google Chat, Teams
packages/ai-core/            LLM gateway, Anthropic provider
scripts/tenant/              Tenant provisioning and fleet tooling
e2e/                         Playwright specs
docs/                        Plans, designs, backlog (see docs/README.md)
```

More in `docs/plan.md`.

## Running it locally

```bash
docker compose up -d                    # Postgres + Redis
set -a; source .env; set +a             # see env.example
pnpm install
pnpm --filter @revualy/db migrate
pnpm --filter @revualy/db seed          # demo org; wipes existing data
pnpm dev                                # API :3000, web :3001
pnpm turbo typecheck
(cd apps/api && npx vitest run)
```

Full guide: `docs/local-testing.md`. Staging on the Linux box: `docs/staging.md`. Deployment: `docs/deployment.md`.

## Decisions log

Newest first. Each line links to where the detail lives. When a decision replaces an earlier one, say so.

- **2026-09-27** Wellbeing and safety: recognise and hand over, don't judge risk. The bot offers to ask the organisation's support contact to get in touch; a name reaches a person only with a yes, never what they wrote; no watchlist, counts only. Replaces live safety escalation and W1/W2/S1/S2. `docs/bot/concerns-playbook.md`
- **2026-09-27** Break-glass: an admin can open read-only content access to one person for a formal process, on a logged reason, for a dated period and up to 30 days. No second approver for the content view; raw content will need one. The subject is told unless a hold is set, and a hold ends with the grant. `docs/build/2026-09-27-break-glass.md`
- **2026-09-26** Privacy tiers, consent-based sharing, raw inputs kept encrypted, and the ticket air gap between chat agents and data. `docs/design/privacy-and-agent-access.md`
- **2026-09-26** A deterministic decision layer driven by a reasoning model, in the spirit of Jev (TypeSafe AI), built on our own models rather than adopting Jev. For alpha and beta, quality comes before token cost. `docs/backlog.md`
- **2026-09-26** 1:1 ingestion defaults to semi-automatic. Calendar model weighting to become client-adjustable sliders.
- **2026-09-26** Safety and concern wording to be refined from established literature on professional feedback, not invented. `docs/bot/concerns-playbook.md`
- **2026-09-26** Contact limits: one peer and one or two personal check-ins a week, 3 exchanges each; don't contact someone again soon after a rich check-in. Replaces the original "2 to 3 interactions a week, 1 to 5 messages each".
- **2026-09-26** Check-ins are anchored to real calendar meetings; a separate calendar model feeds a job list.
- **2026-09-26** Serious concerns go to Opus 5.5 on a harness-shaped reference path; routine turns stay on a script path. Quality and predictability before speed. Never contact emergency services; escalate to a named person instead.
- **2026-09-26** Use the latest models; pin versions once stable.
- **2026-09-24** Message order comes only from `seq`, assigned under a row lock. Platform timestamps are kept as evidence, never used for ordering. `docs/c3-plan.md`
- **2026-09-23** One chat platform per tenant; beta on Google Chat; store every inbound message, never drop one. `docs/plan.md`
- **2026-09-23** Governing priorities: secure, fast, robust. Encryption at rest is a requirement and must add no noticeable delay.
- **Phase 6** Per-tenant isolated deployments on Railway; Neo4j removed; auth tables in the tenant database. Pricing $30 a month plus $3 per employee.

The original product vision (relationship web, custom question banks, pulse checks, calibration, onboarding, engagement leaderboard) is kept in `docs/archive/original-vision-readme.md`. Most of it is built; where it conflicts with the log above, the log wins. In particular, its promise of "full org visibility" for HR and admins is replaced by the privacy model.
