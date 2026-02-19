# Revualy — Technical Plan

## Brief

Revualy is an AI-powered peer review platform. Feedback interactions happen via chat (Slack, Google Chat, Microsoft Teams). The system is **chat-platform agnostic** — core logic is fully decoupled from any specific platform via an adapter pattern. It continuously collects feedback (2-3 micro-interactions per week, 1-5 messages each), scores engagement quality, maps feedback to company core values, and surfaces insights through role-based dashboards.

**Business model:** $3/employee/month. ~$49/mo inference cost per 100 employees (~83% gross margin).

## Spec Decisions (fixed)

**Architecture:** Chat-agnostic modular monolith. Single deployment, one CI/CD pipeline. Clear module boundaries via TypeScript packages — extractable to services later if needed.

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
| **Primary DB** | PostgreSQL 16 + pgvector (Drizzle ORM) |
| **Graph DB** | Neo4j (relationship web queries) |
| **Cache/Queue** | Redis 7 + BullMQ |
| **Frontend** | Next.js 15 (App Router), Tailwind CSS v4, Recharts |
| **Auth** | NextAuth.js (DB sessions, Google OAuth, `@auth/drizzle-adapter`) |
| **Monorepo** | Turborepo + pnpm workspaces |
| **Email** | Resend |
| **Calendar** | Google Calendar API (`googleapis`) |

**Data:** Database-per-org (control plane DB + tenant DBs, resolved via middleware). Neo4j for relationship web. Redis for conversation state (24h TTL), WebSocket notes, rate limiter, leaderboard.

---

## Reference

### Monorepo Structure

```
revualy/
├── packages/
│   ├── shared/                 # Domain types, crypto utils
│   ├── db/                     # Drizzle schema (control-plane + tenant), Neo4j ops, 14 migrations
│   ├── chat-core/              # ChatAdapter interface + AdapterRegistry
│   ├── chat-adapter-slack/     # Slack adapter (complete)
│   ├── chat-adapter-gchat/     # Google Chat adapter (complete — needs Workspace admin setup)
│   ├── chat-adapter-teams/     # Teams adapter (stub — Phase 5)
│   └── ai-core/                # LLM gateway + provider adapters (abstraction only)
├── apps/
│   ├── api/                    # Fastify server (16 route modules) + BullMQ workers (5 queues)
│   └── web/                    # Next.js 15 dashboards (employee, manager, admin)
└── docker-compose.yml          # PostgreSQL+pgvector, Redis 7, Neo4j 5
```

### Core Modules

| Module | Responsibility |
|--------|---------------|
| `chat` | Adapter registry, webhook handling, outbound messaging |
| `conversation` | Multi-turn state machine (initiate → explore → follow-up → close) |
| `ai` | LLM gateway, question generation, analysis pipeline |
| `feedback` | Storage, retrieval, flagged items, RBAC-filtered access |
| `relationships` | Neo4j graph management, calendar sync, connection strength |
| `engagement` | Interaction scoring, weekly leaderboard |
| `kudos` | Real-time capture, weekly digest generation |
| `escalation` | Flagging pipeline, CRUD, audit trail notes |
| `one-on-one` | Live sessions (WebSocket), agenda generator, action items |
| `users` | Auth, profiles, onboarding, preferences |
| `org` | Core values, teams, manager hierarchy |
| `integrations` | Google Calendar OAuth, token management |
| `notifications` | Email (Resend), preferences, weekly digest/flag alert/nudge workers |

### AI Pipeline

**Questionnaires** define direction of data collection via themes (not rigid scripts). AI rewords themes into natural conversation. Verbatim mode locks to exact wording for compliance.

**Conversation Orchestrator:** Create conversation → select themes → generate opening → handle replies (1-5 messages) → close → enqueue analysis.

**Feedback Analysis (async, parallel):** Sentiment → Engagement scoring → Core values mapping → Problematic language detection → AI summary. Returns `{ success, failedSteps, feedbackEntryId }`.

**Interaction Scheduler (daily cron):** Check weekly targets → pick optimal time (timezone + calendar) → select subject via Neo4j → select questionnaire → enqueue delayed job.

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
/api/v1/admin/org                 # Org config, core values CRUD
/api/v1/admin/questionnaires      # Questionnaire + theme CRUD
/api/v1/manager/questionnaires    # Manager-scoped question bank
/api/v1/manager/org-chart         # Reporting tree
/api/v1/manager/notes             # Private notes CRUD
/api/v1/notifications/preferences # GET/PATCH notification settings
/api/v1/integrations/google/*     # Calendar OAuth (authorize, callback, status)
/api/v1/demo/*                    # Demo conversation start/reply
/webhooks/slack/*                 # Slack adapter
/webhooks/gchat/*                 # Google Chat adapter
/webhooks/teams/*                 # Teams adapter (stub)
```

### Frontend

**Design system:** "Warm Editorial" — Fraunces (display) + Outfit (body), cream/forest/terracotta/warm stone palette, rounded-2xl cards, staggered entry animations, Recharts with forest/terracotta colors.

**Employee pages:** Dashboard overview, feedback history, engagement breakdown, kudos, 1:1 session viewer, onboarding wizard, settings (notification prefs)

**Manager pages:** Team overview with trend chart, member grid, flagged items, leaderboard, per-reportee detail (engagement, values, feedback, notes, 1:1 sessions), question bank, org chart

**Admin pages:** Org settings, core values CRUD, questionnaire builder, integrations, escalation feed with audit trail

### Verification Checklist

- **Chat agnosticism:** Same OutboundMessage through each adapter → verify platform-native formatting
- **Conversation flow:** Schedule → initiate → 3-turn → close → verify feedback_entries + engagement_scores
- **Questionnaire modes:** Adaptive produces varied phrasing; verbatim produces identical wording
- **RBAC:** Employee can't access flagged, manager sees team only, admin sees all
- **Escalation:** Flagged feedback → HR feed, not manager dashboard

---

## Active Context

<!-- Append new entries at the bottom of this section. Most recent = last. -->

### What's Built (Phases 1-4) ✅

**Foundation:** Monorepo (Turborepo + pnpm), PostgreSQL schema (19 migrations via Drizzle), control-plane + tenant DB pattern, Slack adapter (complete), GChat adapter (complete), Teams adapter (complete), LLM gateway abstraction (Anthropic SDK wired), Fastify API (22 route modules), BullMQ (5 queues + workers + graceful shutdown), Next.js dashboards (all pages wired to live API with mock fallback).

**Core Loop:** Conversation orchestrator (multi-turn state machine), AI question generation (theme-aware, verbatim support), feedback analysis pipeline (sentiment, engagement, values, flagging, summary — parallel with graceful degradation), interaction scheduler (daily cron, calendar-aware, Neo4j peer selection), Redis conversation state, full CRUD for users, relationships, questionnaires, feedback, org config.

**Intelligence:** Kudos system, email notifications (Resend + 3 templates + worker), Google Calendar sync (OAuth, token refresh, event upsert, co-attendee relationship inference), manager question bank + org chart, admin mutation UIs.

**Phase 4:** 1:1 live sessions (WebSocket, agenda generator, action items), rate limiting, leaderboard API (DB-backed, weighted composite), escalation pipeline (5 endpoints, audit trail), Google Chat adapter, notification preferences page, onboarding wizard (3-step + middleware redirect).

**Auth:** NextAuth.js with DB sessions (`@auth/drizzle-adapter`), Google OAuth, RBAC (`requireAuth`/`requireRole` preHandlers), edge-safe cookie middleware, role/onboarding guards in server layouts, auth sync to control plane.

**Code quality:** Three code review rounds (93+ findings, all resolved). TOCTOU race prevention, escalation authorization, circular manager detection, input validation, DB constraints, error boundaries, prompt injection sanitization. 64 unit tests (vitest).

**Phase 5 (complete):** Calibration engine (reviewer bias detection, cross-team comparison, std-dev alerts), pulse check system (sentiment monitoring, configurable thresholds, cooldown, auto-trigger), 360 manager reviews (initiate/collect/aggregate workflow, admin + reviewer RBAC), self-reflection interactions (conversation-based, LLM extraction, reflections page wired to live API), relationship web visualization (D3.js force graph, team coloring, drag/zoom/click), data export + blind review mode (CSV/JSON, PII sanitization, anonymous labeling), Microsoft Teams adapter (Bot Framework REST API, Adaptive Cards, OAuth2), AI theme discovery (batch LLM clustering, upsert/promote to questionnaire themes), N+1 query optimization (parallelized queries in orchestrator/pipeline/relationships), test coverage (64 tests across 4 suites).

### Beta Launch Blocklist
- [ ] Google Workspace admin setup — install GChat app at beta company
- [x] Wire LLM provider SDK (Anthropic) into `ai-core` gateway
- [ ] End-to-end test: GChat webhook → conversation → analysis → dashboard
- [x] Demo chat interactions page (animated preview + live interactive)
- [ ] Production deployment (Railway) + env config

### Remaining Backlog
- [ ] Outlook calendar integration
- [ ] Production monitoring + alerting
