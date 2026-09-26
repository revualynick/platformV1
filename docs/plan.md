# Revualy — Technical Plan

## Brief

Revualy is an AI-powered peer review platform. Feedback interactions happen via chat (Slack, Google Chat, Microsoft Teams). The system is **chat-platform agnostic** — core logic is fully decoupled from any specific platform via an adapter pattern. It continuously collects feedback in short chat check-ins (each week at most one peer check-in and one or two personal ones, up to 3 exchanges each, anchored to real calendar meetings where possible), scores engagement quality, maps feedback to company core values, and surfaces insights through role-based dashboards.

**Business model:** $30/mo base + $3/employee/month. ~$49/mo inference cost per 100 employees. Per-tenant infrastructure ~$20-25/mo on Railway.

| Company Size | Monthly Revenue | Infra + Inference | Gross Margin |
|---|---|---|---|
| 10 employees | $60 | ~$30 | ~50% |
| 50 employees | $180 | ~$35 | ~81% |
| 200 employees | $630 | ~$50 | ~92% |
| 500 employees | $1,530 | ~$75 | ~95% |

## Spec Decisions (fixed)

**Architecture:** Per-tenant isolated deployments. Each customer gets their own subdomain (`acme.revualy.com`) running the full stack (API + web + Postgres + Redis). Deployed on Railway, auto-deployed from GitHub. Chat-agnostic modular monolith — clear module boundaries via TypeScript packages.

**Deployment model:**
- `revualy.com` — Marketing site + demo database + lead-gated chat demo (same codebase, `DEMO_MODE=true`)
- `acme.revualy.com` — Customer instance (full stack, own Postgres + Redis)
- Each instance is identical code, different env vars (`DATABASE_URL`, `REDIS_URL`, `ORG_ID`, etc.)
- Provisioning: manual via Railway dashboard for beta, GitHub Actions automation later

**ChatAdapter interface** — adding a platform = implement 5 methods, zero core changes:
```typescript
interface ChatAdapter {
  readonly platform: ChatPlatform;
  verifyWebhook(headers, body): Promise<WebhookVerification>;
  normalizeInbound(rawPayload): Promise<InboundMessage | null>;
  sendMessage(message: OutboundMessage): Promise<string>;
  resolveUser(platformUserId): Promise<PlatformUser | null>;
  sendTypingIndicator(channelId): Promise<void>;
}
```

**Message flow:** Platform webhook → Adapter (verify, normalize) → stored in `inbound_messages` (encrypted) → BullMQ job carrying only the id → inbound router (identity, keywords, open conversation) → turn engine (Postgres, one structured LLM call per turn, reference path for sensitive turns) → outbox → AdapterRegistry → correct adapter → platform API

**LLM tiers (Anthropic, latest models; pin once stable):** fast `claude-haiku-4-5` (calendar model, classification), standard `claude-sonnet-5` (turn planner, analysis), advanced `claude-opus-5-5` (serious concerns on the reference path). `LLM_MODEL_*` env vars pin a tier. For alpha and beta, quality comes before token cost (Nick, 2026-09-26).

| Layer | Technology |
|-------|-----------|
| **Language** | TypeScript (Node.js 20 LTS) |
| **API** | Fastify 5 + BullMQ (5 queues, 5 workers) |
| **Database** | PostgreSQL 16 + pgvector (Drizzle ORM) |
| **Cache/Queue** | Redis 7 + BullMQ |
| **Frontend** | Next.js 15 (App Router), Tailwind CSS v4, Recharts |
| **Auth** | NextAuth.js (DB sessions, Google OAuth, `@auth/drizzle-adapter`) |
| **Monorepo** | Turborepo + pnpm workspaces |
| **Hosting** | Railway (per-tenant instances) |
| **Email** | Resend |
| **Calendar** | Google Calendar API (`googleapis`) |

**Data:** Single Postgres per instance (auth tables + business data), including all conversation state. Redis for BullMQ jobs, the Teams store, WebSocket notes, rate limiter, leaderboard. Sensitive columns encrypted at rest (AES-256-GCM, v1 format, keyring). No separate control plane DB needed for tenant instances — only for the marketing/demo site (leads, analytics).

---

## Reference

### Monorepo Structure

```
revualy/
├── packages/
│   ├── shared/                 # Domain types, crypto utils
│   ├── db/                     # Drizzle schema + migrations (0000 to 0041)
│   ├── chat-core/              # ChatAdapter interface + AdapterRegistry
│   ├── chat-adapter-slack/     # Slack adapter (complete)
│   ├── chat-adapter-gchat/     # Google Chat adapter (complete)
│   ├── chat-adapter-teams/     # Teams adapter (complete — Bot Framework + Adaptive Cards)
│   └── ai-core/                # LLM gateway + Anthropic provider
├── apps/
│   ├── api/                    # Fastify server (22 route modules) + BullMQ workers (5 queues)
│   └── web/                    # Next.js 15 dashboards (employee, manager, admin, marketing)
├── scripts/tenant/             # Tenant provisioning + fleet tooling (dry run by default)
├── docker-compose.yml          # PostgreSQL+pgvector, Redis 7 (local dev)
├── Dockerfile                  # API multi-stage build (Railway)
└── .env.example                # Required env vars per instance
```

### Core Modules

| Module | Responsibility |
|--------|---------------|
| `chat` | Adapter registry, webhook handling, outbound messaging |
| `conversation` | Multi-turn state machine (initiate → explore → follow-up → close) |
| `ai` | LLM gateway, question generation, analysis pipeline |
| `feedback` | Storage, retrieval, flagged items, RBAC-filtered access |
| `relationships` | Postgres relationship graph, calendar sync, connection strength |
| `engagement` | Interaction scoring, weekly leaderboard |
| `kudos` | Real-time capture, weekly digest generation |
| `escalation` | Flagging pipeline, CRUD, audit trail notes |
| `one-on-one` | Live sessions (WebSocket), agenda generator, action items |
| `users` | Auth, profiles, onboarding, preferences |
| `org` | Core values, teams, manager hierarchy |
| `integrations` | Google Calendar OAuth, token management |
| `notifications` | Email (Resend), preferences, weekly digest/flag alert/nudge workers |
| `calibration` | Reviewer bias detection, cross-team comparison, std-dev alerts |
| `pulse` | Sentiment monitoring, configurable thresholds, cooldown, auto-trigger |
| `three-sixty` | 360 manager reviews, initiate/collect/aggregate, admin + reviewer RBAC |
| `reflections` | Self-reflection conversations, LLM extraction, weekly tracking |
| `export` | CSV/JSON data export, blind review mode, PII sanitization |
| `themes` | AI theme discovery, batch LLM clustering, promote to questionnaires |
| `demo` | Lead-gated interactive chat demo (marketing site) |

### AI Pipeline

**Questionnaires** define direction of data collection via themes (not rigid scripts). AI rewords themes into natural conversation. Verbatim mode locks to exact wording for compliance.

**Conversation Orchestrator:** Create conversation → select themes → generate opening → handle replies (1-5 messages) → close → enqueue analysis.

**Feedback Analysis (async, parallel):** Sentiment → Engagement scoring → Core values mapping → Problematic language detection → AI summary. Returns `{ success, failedSteps, feedbackEntryId }`.

**Interaction Scheduler (daily cron):** Check weekly targets → pick optimal time (timezone + calendar) → select subject via relationship strength → select questionnaire → enqueue delayed job.

### API Routes

```
/api/v1/auth/*                    # Login, SSO, session
/api/v1/users/:id                 # Profile CRUD
/api/v1/users/:id/feedback        # Feedback (RBAC-filtered)
/api/v1/users/:id/relationships   # Relationship web
/api/v1/users/:id/engagement      # Engagement scores
/api/v1/users/:id/manager         # Set/update manager
/api/v1/users/me/onboarding       # Complete onboarding
/api/v1/kudos                     # Create + list
/api/v1/leaderboard               # Weekly leaderboard
/api/v1/feedback/flagged           # Flagged items (manager/HR)
/api/v1/escalations               # CRUD + audit trail notes
/api/v1/conversations             # List, view, force-close
/api/v1/one-on-one-sessions       # Sessions, action items, agenda, WebSocket tokens
/api/v1/reflections               # Self-reflections CRUD + start/complete
/api/v1/calibration               # Calibration reports + history
/api/v1/pulse                     # Pulse check config + triggers
/api/v1/three-sixty               # 360 reviews + responses
/api/v1/export                    # Data export (feedback, engagement, users, escalations)
/api/v1/admin/org                 # Org config, core values CRUD
/api/v1/admin/questionnaires      # Questionnaire + theme CRUD
/api/v1/admin/themes              # AI-discovered themes, promote/dismiss
/api/v1/manager/questionnaires    # Manager-scoped question bank
/api/v1/manager/org-chart         # Reporting tree
/api/v1/manager/notes             # Private notes CRUD
/api/v1/notifications/preferences # GET/PATCH notification settings
/api/v1/integrations/google/*     # Calendar OAuth (authorize, callback, status)
/api/v1/demo/*                    # Demo conversation start/reply (lead-gated)
/webhooks/slack/*                 # Slack adapter
/webhooks/gchat/*                 # Google Chat adapter
/webhooks/teams/*                 # Teams adapter
```

### Frontend

**Design system:** "Warm Editorial" — Fraunces (display) + Outfit (body), cream/forest/terracotta/warm stone palette, rounded-2xl cards, staggered entry animations, Recharts with forest/terracotta colors.

**Marketing pages (public):** Landing, features, pricing, about, demo chat (lead-gated)

**Employee pages:** Dashboard overview, feedback history, engagement breakdown, kudos, reflections, 1:1 session viewer, onboarding wizard, settings (notification prefs)

**Manager pages:** Team overview with trend chart, member grid, flagged items, leaderboard, per-reportee detail (engagement, values, feedback, notes, 1:1 sessions), question bank, org chart

**Admin pages:** Org settings, core values CRUD, questionnaire builder, theme management, integrations, escalation feed with audit trail, calibration reports, pulse config, 360 reviews, data export

### Verification Checklist

- **Chat agnosticism:** Same OutboundMessage through each adapter → verify platform-native formatting
- **Conversation flow:** Schedule → initiate → 3-turn → close → verify feedback_entries + engagement_scores
- **Questionnaire modes:** Adaptive produces varied phrasing; verbatim produces identical wording
- **RBAC:** Employee can't access flagged, manager sees team only, admin sees all
- **Escalation:** Flagged feedback → HR feed, not manager dashboard
- **Per-tenant isolation:** Each subdomain instance has independent data, auth, and config

---

## Active Context

<!-- Append new entries at the bottom of this section. Most recent = last. -->

### What's Built (Phases 1-5) ✅

**Foundation:** Monorepo (Turborepo + pnpm), PostgreSQL schema (22 migrations via Drizzle), Slack adapter (complete), GChat adapter (complete), Teams adapter (complete — Bot Framework REST API, Adaptive Cards, JWT verification via jose), LLM gateway (Anthropic SDK wired), Fastify API (22 route modules), BullMQ (5 queues + workers + graceful shutdown), Next.js dashboards (all pages wired to live API with mock fallback).

**Core Loop:** Conversation orchestrator (multi-turn state machine), AI question generation (theme-aware, verbatim support), feedback analysis pipeline (sentiment, engagement, values, flagging, summary — parallel with graceful degradation), interaction scheduler (daily cron, calendar-aware, Postgres peer selection), Redis conversation state, full CRUD for users, relationships, questionnaires, feedback, org config.

**Intelligence:** Kudos system, email notifications (Resend + 3 templates + worker), Google Calendar sync (OAuth, token refresh, event upsert, co-attendee relationship inference), manager question bank + org chart, admin mutation UIs, calibration engine (reviewer bias detection, cross-team comparison), pulse check system (sentiment monitoring, configurable thresholds), 360 manager reviews, self-reflection interactions, AI theme discovery.

**Advanced Features:** 1:1 live sessions (WebSocket, agenda generator, action items), rate limiting, leaderboard API (DB-backed, weighted composite), escalation pipeline (5 endpoints, audit trail), relationship web visualization (D3.js force graph), data export + blind review mode (CSV/JSON, PII sanitization), N+1 query optimization.

**Auth:** NextAuth.js with DB sessions (`@auth/drizzle-adapter`), Google OAuth, RBAC (`requireAuth`/`requireRole` preHandlers), edge-safe cookie middleware, role/onboarding guards in server layouts.

**Code quality:** Three code review rounds (130+ findings, all resolved). TOCTOU race prevention, timing-safe secret comparison, OAuth state HMAC validation, input validation (Zod schemas on all endpoints), DB constraints, error boundaries, prompt injection sanitization, fail-closed defaults. 64 unit tests (vitest). Post-Phase 6 full codebase audit confirmed zero critical/high issues, no unused dependencies, no stale Neo4j or TENANT_DATABASE_URL references.

### Architecture Refresh (Phase 6, complete)

**Decision:** Shift from shared multi-tenant app to per-tenant isolated deployments.

**Changes:**
- **Remove Neo4j** — defined but never used (all queries already use Postgres). Eliminates a database from every tenant stack.
- **Per-tenant deployments on Railway** — each customer gets `subdomain.revualy.com` with own Postgres + Redis
- **Simplify tenant context** — `ORG_ID` + `DATABASE_URL` from env vars (no control plane routing)
- **Merge auth tables into tenant DB** — single Postgres per instance (no separate control plane for tenants)
- **Demo mode** — marketing site at `revualy.com` with `DEMO_MODE=true`, curated demo data, lead-gated chat demo
- **Pricing** — $30/mo base + $3/employee/month

**TODO (Phase 6):**
- [x] Remove Neo4j (delete `neo4j.ts`, remove `neo4j-driver` dep, remove from docker-compose)
- [x] Simplify tenant context (env-based orgId + dbUrl, remove connection pool/LRU)
- [x] Merge auth tables into tenant schema (single DB per instance)
- [x] Demo mode infrastructure (lead capture, email gate, rate limiting)
- [x] Dockerfiles for Railway deployment (API + web)
- [x] `.env.example` with all required env vars documented
- [x] Railway deployment guide (`docs/deployment.md`)

**Cleanup (low priority):** Dead control plane code remains (`packages/db/src/client.ts` exports, `schema/control-plane.ts`, `drizzle.config.control-plane.ts`, `migrations-control-plane/`). Kept for potential future use by demo/marketing site. Two stale comments reference "control plane" (`server.ts:226` TODO, `users/routes.ts:99`). `auth.ts` still has `CONTROL_PLANE_DATABASE_URL` fallback (harmless — only used during build).

### Beta Launch Blocklist
- [x] Phase 6 architecture changes (above)
- [ ] Google Workspace admin setup — install GChat app at beta company
- [x] Wire LLM provider SDK (Anthropic) into `ai-core` gateway
- [ ] End-to-end test: chat webhook → conversation → analysis → dashboard
- [x] Demo chat interactions page (animated preview + live interactive)
- [ ] First Railway deployment (demo site + one beta tenant)
- [ ] Curated demo seed data

### Remaining Backlog
- [ ] GitHub Actions provisioning automation (add tenant YAML → auto-deploy)
- [ ] Outlook calendar integration
- [ ] Production monitoring + alerting
- [ ] Stripe billing integration
- [ ] Employee handover system (reorg manager changes) — see spec below

### Employee Handover System (backlog spec)
**Problem:** When an employee moves between managers (reorg, transfer, promotion), the only lever today is changing `users.managerId`. That silently flips reporting-tree access — the new manager instantly gains everything tree-scoped (individual goals, shared personal goals, engagement, feedback, 1:1 access), while the outgoing manager loses it — with no transition, no record, and no handling of the two things that *don't* auto-transfer: the employee's private reflections and the outgoing manager's private notes. There's no structured way to pass context between the two managers.

**Two parts the feature must cover:**

1. **Access transition (consent-aware).** A managed handover action (admin or the two managers) instead of a bare `managerId` edit. Must decide, per data type, what transfers:
   - `self_reflections` — **private to the employee by design** (the UI promises "only you and your AI coach can see these"). Must be consent-gated: the employee opts in to sharing history (or a window of it) with the incoming manager; default is *no transfer*. Never silently expose.
   - `manager_notes` — outgoing manager's private observations. Offer transfer/copy to the incoming manager with the outgoing manager's consent; otherwise archive.
   - `goals` `shareWithManager` on personal goals — "shared with manager" currently resolves via the live reporting tree, so a reorg re-points it at the new manager automatically. Decide whether that's desired or whether the employee should re-confirm the share for the new manager.
   - Auto-transferring by tree today (feedback, engagement, individual goals, 1:1 sessions) — confirm these are acceptable to pass immediately, or gate them too.

2. **Handover conversations.** A structured, recorded handover artifact between outgoing and incoming manager — likely a new `interactionType` in the conversation orchestrator (alongside peer_review / self_reflection / three_sixty / pulse_check) or a dedicated `handovers` table: prompts for context (strengths, in-flight goals, watch-items, active flags/escalations), producing a summary both managers sign off on. Should surface open escalations and in-cycle goals for the employee so nothing is dropped mid-transition.

**Touch points:** `users.managerId` + `getReportingTree`; `self_reflections`, `manager_notes`, `goals` (shareWithManager), `one_on_one_sessions`, `escalations`; conversation orchestrator (new interaction type) or new schema; admin People/Access UI (the handover action) + an audit trail. **Key tension to resolve at design time:** reflection privacy vs. continuity of coaching — err toward employee consent, and log every access grant.

### Remediation pass (2026-07-14, post-review)
A four-lens review (backend, frontend, employee UX, manager/admin UX) was fully remediated:
- **Data integrity**: goals check-in/apply/delete and the check-in pipeline now use transactions; transcript give-up has an attempt ceiling; pipeline error codes are sanitized (no content echo); `GET /goals` and feedback export are paginated (`limit`/`offset` + `hasMore`).
- **Honesty**: web pages log load failures (`lib/page-errors.ts`) and render `DataUnavailable` instead of masquerading as empty; chat messages over 2000 chars get a bot acknowledgment instead of silent truncation (conversation dedup key now includes user id).
- **Self-explanation**: `lib/glossary.ts` + `InfoHint` define every metric once; `DismissibleCard` powers the employee orientation, manager check-in-suggestion explainer (with live Google-connection status), and the admin setup checklist; the bot now opens with a deterministic intro (purpose, duration, static privacy line) and closes with "what happens next".
- **Wired previously-dead UI**: manager Flagged Investigate/Dismiss (new `POST /escalations/:id/review`, reporting-tree scoped) and admin escalation transitions (existing PATCH) with confirmation dialogs; assessment invite is a real email (endpoint + notification worker + template).
- **Decisions recorded**: weekly digest boundaries are UTC (documented in workers); export caps documented in responses; webhooks exempt from IP rate limiting (signature-verified); accessibility pass added dialog semantics/focus traps/aria labels.

### Review findings (2026-09-23)
Whole-codebase review of the uncommitted work. Full notes in `.claude/log.md`.

**Fixed:**
- [x] Chat webhooks 401'd: `tenantPlugin` required `x-internal-secret` on `/webhooks/*`, which platforms never send. Now exempt (like `/ws/`); adapter signature verification is the gate. Covered by smoke tests.
- [x] BullMQ 5 rejected colon-joined custom job ids (`initiate`, `weekly-digest`, `team-insights`, `nudge`), so scheduling, digests, insights and nudges never enqueued. Now built via `lib/job-ids.ts` `buildJobId()`. Covered by `job-ids.test.ts`.

**Open:**
- [ ] `schedule_nudges` only finds users with an engagement row this week, so zero-activity users are never nudged
- [ ] `engagement_scores.streak` has no writer outside seed; leaderboard and digest always see 0
- [ ] `uq_user_relationship_pair` makes duplicate or re-created (soft-deleted) relationships 500 on all four create routes; needs upsert/reactivate or 409
- [ ] Self-reflection analysis failure returns `success: false` but the worker never retries; reflections also skip flag detection (needs a deliberate safeguarding decision)
- [ ] 360 completion runs the LLM aggregation inside a DB transaction; `analyzing` status never visible
- [ ] Team-insight month keys use local-time `Date` then `toISOString()` (wrong outside UTC)
- [ ] Member detail page allows direct reports only; API allows full tree + admins
- [ ] `test-login` open redirect via `redirect` param, `secure: false` cookie, key accepted in query string

**Deep review (same day):** see `docs/archive/review-2026-09-23-deep.md`. C3, H1 to H3, H5, M1, M2, M5 and M6 are fixed; H4, M3 and M4 are in `docs/backlog.md`.

### Decision: chat identity + routing (2026-09-23, fixes review C3)
- **One chat platform per tenant** (Google Chat OR Slack OR Teams). Replaces `SCHEDULER_PLATFORM` env; only one `integrations` row may be connected.
- **Google Chat:** identity is automatic from the user's Google account (`users/{id}` = `authAccounts.providerAccountId`, `users/{email}` alias also valid). No admin mapping. To confirm on the beta Workspace: DM space discovery (`findDirectMessage`) after domain-wide admin install.
- **Slack / Teams:** admin- or manager-driven linking. Directory pull (Slack `users.list` + `users:read.email`; Teams Graph/roster), email-based suggestions, bulk confirm, manual exceptions, unknown-sender queue. Per-person status unlinked → linked → reachable (Teams needs a conversation reference from app install).
- **Safeguard:** manually linked accounts get an identity-confirmation DM before any feedback conversation is sent.
- **Routing:** inbound platformUserId → `user_platform_identities` → userId → the user's single open conversation (one open conversation per person at a time).
- **Beta platform: Google Chat** (confirmed). Adapter must handle `ADDED_TO_SPACE` to capture the DM space name (currently only `MESSAGE` is normalised).
- **Store everything (Nick):** no inbound message is ever silently dropped. Late replies and afterthoughts attach to the user's most recent conversation; user-initiated messages are stored and answered; `help` and `stop` handled explicitly; unmatched events counted.
- **Expiry is a state, not limbo:** unanswered conversations move to `incomplete`, partial answers are analysed and marked partial (kept out of engagement scoring noise).
- **Per-theme outcome** (answered / weak / unanswered) recorded, as the foundation for the planned re-presentation feature: weak or unanswered themes get re-asked in a later conversation with different wording. Also fix `decideNextAction` judging replies without seeing the question.
- **Resolved (Nick):** managers can link (scoped to their reporting tree); Google Chat app not yet installed on the beta Workspace, so M1 is proved locally with signed event fixtures; the re-presentation engine is in C3 scope.
- **Implementation plan:** `docs/c3-plan.md` (M1 Google Chat beta path, M2 re-presentation, M3 Slack/Teams linking).

### Beta hardening progress (2026-09-24 to 2026-09-26)
- **C3 steps 5 and 6 done:** conversation engine on Postgres (seq ordering, row locks, atomic turn claim, outbox, inbound ledger), sweeper every 5 minutes, partial feedback, per-theme outcomes, one structured LLM call per turn. Details in `docs/c3-plan.md`.
- **Bot design:** script path for routine turns; a harness-shaped reference path (reads playbook references with a tool) for concerns. Serious concerns (wellbeing, conduct, safety) go to Opus 5.5, confirmed by experiments 3 and 4 and the topic grid: 100% of safety cases caught, no false alarms on everyday turns, and Opus avoided Sonnet's over-escalation of ordinary criticism. Never refer to emergency services; live escalation to a named person instead.
- **Evaluation harness** (`apps/api/eval/`): frozen snapshots, hard-rule checks, blind two-judge panel, local-model paraphrases, 93-case topic grid; runs on the Linux box.
- **Contact limits:** at most one peer and one or two personal check-ins a week, 3 exchanges each; a 3-day gap, and a rest after a rich check-in.
- **Meeting anchors and the calendar model:** check-ins refer to a real shared meeting; Haiku proposes check-in jobs from calendar metadata and a code gate rejects invented references, 1:1s and sensitive meetings (migrations 0038, 0039).
- **1:1 ingestion v2** (0041): automatic, semi-automatic (default) and manual modes; tasks, between-meeting goals and goal suggestions from Gemini notes; sensitive items withheld.
- **Customer data imports** (0040): stage, map, dry run, approve, commit; CSV, Sheets, XLSX and unordered text.
- **Tenant provisioning** (`scripts/tenant/`, skill `revualy-tenant`): dry run by default.

### Decision: privacy, anonymity and agent access (2026-09-26)
Full design in `docs/design/privacy-and-agent-access.md`. In short (Nick): reviews of others are pseudonymous, aggregated and released with a lag, and re-identification needs a super-admin secret and is immutably logged; self data is plain id-to-name and two-party (subject and manager), with wider sharing needing the subject's approval; raw inputs such as Gemini transcripts are kept, encrypted; chat agents never touch the database and work from tickets prepared by a job agent whose proposals pass a code gate. Not built yet; steps 1 to 3 come before real employees.

### Docs tidy (2026-09-26)
Outdated reviews and plans moved to `docs/archive/` (index in `docs/archive/README.md`); open items consolidated in `docs/backlog.md`; `docs/README.md` indexes what's current. The root README is now the running summary of the product, architecture and decisions.

### Privacy build (2026-09-26, evening)
Privacy steps 1 to 3, C3 step 7 (encryption backfill) and the typed decision layer are merged; see `docs/build/` for one reviewable note each. Built in parallel by Opus agents in worktrees, merged in migration order (0042, 0043, 0044). Merging exposed and fixed: tests sharing the dev database, a stale migrations copy in the built db package, and two migration commands that behaved differently. API suite: 558 tests, run one file at a time.

