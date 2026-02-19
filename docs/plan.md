# Revualy — Technical Plan

## Brief

Revualy is an AI-powered peer review platform. Feedback interactions happen via chat (Slack, Google Chat, Microsoft Teams). The system is **chat-platform agnostic** — core logic is fully decoupled from any specific platform via an adapter pattern. It continuously collects feedback (2-3 micro-interactions per week, 1-5 messages each), scores engagement quality, maps feedback to company core values, and surfaces insights through role-based dashboards.

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

**Message flow:** Platform webhook → Adapter (verify, normalize) → InboundMessage → BullMQ → Conversation Manager → AI Pipeline → OutboundMessage → AdapterRegistry → correct adapter → platform API

**LLM tiers:** Fast (Haiku/GPT-4o-mini) for scoring/classification, Standard (Sonnet/GPT-4o) for questions/follow-ups, Advanced (Opus/GPT-4o) for calibration/analysis.

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

**Data:** Single Postgres per instance (auth tables + business data). Redis for conversation state (24h TTL), WebSocket notes, rate limiter, leaderboard. No separate control plane DB needed for tenant instances — only for the marketing/demo site (leads, analytics).

---

## Reference

### Monorepo Structure

```
revualy/
├── packages/
│   ├── shared/                 # Domain types, crypto utils
│   ├── db/                     # Drizzle schema + migrations (22 migrations)
│   ├── chat-core/              # ChatAdapter interface + AdapterRegistry
│   ├── chat-adapter-slack/     # Slack adapter (complete)
│   ├── chat-adapter-gchat/     # Google Chat adapter (complete)
│   ├── chat-adapter-teams/     # Teams adapter (complete — Bot Framework + Adaptive Cards)
│   └── ai-core/                # LLM gateway + Anthropic provider
├── apps/
│   ├── api/                    # Fastify server (22 route modules) + BullMQ workers (5 queues)
│   └── web/                    # Next.js 15 dashboards (employee, manager, admin, marketing)
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

### Architecture Refresh (Phase 6 — in progress)

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
