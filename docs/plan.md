# Revualy — Technical Architecture Plan

## Context

Revualy is a greenfield AI-powered peer review platform where all feedback interactions happen via chat (Slack, Google Chat, Microsoft Teams). The system must be **chat-platform agnostic** — core logic fully decoupled from any specific platform. It continuously collects feedback (2-3 micro-interactions per week, 1-5 messages each), scores engagement quality, maps feedback to company core values, and surfaces insights through role-based dashboards.

**Beta plan:** First beta company is a Google Chat shop. Build order is **Slack first** (faster dev, better SDK) then **Google Chat fast-follow** (via official Google Chat API + Pub/Sub — Workspace admin access confirmed). This validates the adapter pattern early by proving platform-agnosticism with the second adapter.

---

## Architecture: Chat-Agnostic Modular Monolith

### Why Modular Monolith (Not Microservices)
- Single deployment, one CI/CD pipeline — startup speed
- In-process calls between modules (no network overhead)
- Clear module boundaries via TypeScript packages — extractable to services later if needed

### Chat Adapter Pattern (Hexagonal Architecture)

The core abstraction that makes everything platform-agnostic:

```
packages/
  chat-core/              → Unified types: ChatAdapter interface, InboundMessage, OutboundMessage
  chat-adapter-slack/     → Implements ChatAdapter using @slack/bolt + Block Kit
  chat-adapter-teams/     → Implements ChatAdapter using botbuilder + Adaptive Cards
  chat-adapter-gchat/     → Implements ChatAdapter using Google Chat API + Cards v2
```

**Adding a new platform** = create a new adapter package implementing 5 methods. Zero changes to core logic, AI pipeline, or dashboards.

**ChatAdapter interface:**
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

**Message flow:**
```
Platform webhook → Adapter (verify, normalize) → InboundMessage (canonical)
    → Event Bus (BullMQ) → Conversation Manager → AI Pipeline
    → OutboundMessage (canonical) → Adapter Registry → correct adapter → platform API
```

### LLM Gateway (Provider-Agnostic)
Same pattern for AI — abstract behind a gateway with model tiers:
- **Fast** (Haiku/GPT-4o-mini): engagement scoring, simple classification
- **Standard** (Sonnet/GPT-4o): question generation, follow-ups
- **Advanced** (Opus/GPT-4o): complex calibration, nuanced flagging

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Language** | TypeScript (Node.js 20 LTS) | Unified front/back. All chat SDKs have first-class TS support. |
| **API** | Fastify | Fast, schema validation, plugin arch maps to modules |
| **Primary DB** | PostgreSQL 16 + pgvector | Structured data, JSONB flexibility, RLS for multi-tenancy, vector embeddings |
| **Graph DB** | Neo4j (AuraDB managed) | Relationship web queries (multi-hop, weighted paths, cluster detection) |
| **Cache/Queue** | Redis 7 + BullMQ | Conversation state (hot path), job scheduling, leaderboard sorted sets |
| **Frontend** | Next.js 15 (App Router) | SSR dashboards, React ecosystem, Tailwind CSS v4 |
| **Charts** | Recharts | Engagement trends, values radar, calibration distributions |
| **Auth** | NextAuth.js + Google/Microsoft SSO | Aligns with GChat/Teams identity providers |
| **ORM** | Drizzle ORM | Type-safe, SQL-first, less magic than Prisma |
| **Monorepo** | Turborepo + pnpm workspaces | Manages packages, incremental builds |
| **CI/CD** | GitHub Actions | Standard, good Turborepo caching |
| **Monitoring** | Sentry + Axiom | Error tracking + logs/metrics |

### Hosting
- **Early stage (months 1-6):** Railway — zero DevOps, PostgreSQL + Redis included, fast iteration
- **Growth stage (6-18m):** AWS — ECS Fargate, RDS, ElastiCache, CloudFront

---

## Data Architecture

### PostgreSQL — Database-Per-Org (Data Sovereignty)
Each organization gets its own isolated PostgreSQL database. This ensures:

- **Complete data sovereignty** — No risk of cross-tenant data leakage. Each org's data is physically separated.
- **Regional hosting** — Databases can be provisioned in different regions per customer (EU, US, APAC) for compliance.
- **Independent backups & lifecycle** — Per-org backup schedules, retention policies, and data deletion.
- **Simpler queries** — No `org_id` filtering needed; the connection itself scopes to the tenant.

**How it works:**
- A **control plane database** (shared) stores: org registry, org-to-database connection mappings, platform-level config, billing metadata.
- Each **tenant database** contains all org-specific tables.
- On each API request, middleware resolves the authenticated user's org → looks up the database connection string → routes all queries to that org's database.
- Connection pooling via PgBouncer or a pooler per database to manage connections efficiently.

Key tables per tenant DB: `users`, `user_platform_identities`, `teams`, `core_values`, `user_relationships`, `questionnaires`, `questionnaire_themes`, `conversations`, `conversation_messages`, `feedback_entries`, `feedback_value_scores`, `kudos`, `engagement_scores`, `escalations`, `escalation_audit_log`, `questions`, `interaction_schedule`, `pulse_check_triggers`, `calendar_events`, `notification_preferences`, `calendar_tokens`

- Encryption at rest per database (RDS AES-256 + pgcrypto for sensitive columns like `raw_content`)
- pgvector extension enabled per tenant DB for semantic search

### Neo4j (Relationship Web) — Per-Org Isolation
- `(:User)-[:WORKS_WITH {strength, source, meetingCount30d, lastReviewedAt}]->(:User)`
- `(:User)-[:REPORTS_TO]->(:User)`
- `(:User)-[:MEMBER_OF]->(:Team)`
- Synced from tenant PostgreSQL via event-driven updates
- Used for: peer selection, web visualization, cross-team collaboration analysis
- Isolated per org using separate Neo4j databases (supported in Neo4j 4+) or `orgId` property scoping on AuraDB

### Redis (Hot State)
- Active conversation state (JSON, 24h TTL)
- Leaderboard sorted sets
- Rate limiter state
- Session cache

---

## Core System Modules

| Module | Responsibility |
|--------|---------------|
| `chat` | Adapter registry, webhook handling, outbound messaging |
| `conversation` | Multi-turn state machine (initiate → respond → follow-up → close) |
| `ai` | LLM gateway, question generation, analysis pipelines |
| `feedback` | Storage, retrieval, anonymization, export |
| `relationships` | Neo4j graph management, calendar sync, connection strength |
| `calibration` | Leniency/severity detection, cross-team comparison, outliers |
| `engagement` | Interaction scoring, weekly leaderboard computation |
| `kudos` | Real-time capture, weekly digest generation |
| `escalation` | Flagging pipeline, HR feed, audit trail |
| `users` | Auth, profiles, onboarding state, preferences |
| `org` | Company config, core values, teams, manager hierarchy |
| `integrations` | Calendar sync, company comms ingestion |
| `pulse` | Comms listener, organic follow-up, sentiment aggregation |

---

## AI Pipeline

### Questionnaire Model

Questionnaires define the *direction* of data collection, not rigid scripts. Each questionnaire contains **themes** — high-level intents describing what data to collect. The AI rewords themes into natural conversation based on context, relationship history, and conversational flow.

**Structure:**
```
Questionnaire
├── name, category, source (built_in | custom | imported)
├── verbatim: boolean  ← locks AI to exact wording when true
└── themes[]
    ├── intent: what you want to learn
    ├── dataGoal: what data this produces
    ├── examplePhrasings[]: how AI might phrase it
    └── coreValue: optional value alignment
```

**Sources:**
- **Built-in** — System-provided questionnaires (Sprint Peer Review, Weekly Self-Reflection)
- **Custom** — Created in-platform by admins
- **Imported** — Loaded from plain text (e.g. existing company survey templates)

**Verbatim mode:** When HR needs consistent wording for benchmarking or compliance, toggling verbatim locks the AI to the exact first example phrasing. Default is adaptive mode where AI rewords freely.

**AI-discovered themes:** The AI continuously analyzes team communications and feedback patterns to suggest new question themes admins might not have considered (e.g. "cross-team handoff friction detected in 14 Slack messages"). Admins can accept themes into questionnaires or dismiss them.

### Interaction Scheduling (daily BullMQ cron)
- Check each user's weekly schedule (target: 2-3 interactions)
- Pick optimal time based on timezone + activity patterns
- Select interaction type (peer review, self-reflection, 360, pulse check)
- Select review subject via Neo4j (strongest connections not reviewed recently)
- Select questionnaire and themes for the interaction type
- Enqueue delayed conversation job

### Conversation Orchestrator
- Creates conversation record + Redis state
- Selects themes from the assigned questionnaire
- Generates contextual opening question (adapts theme phrasing to context, or uses verbatim wording)
- Handles inbound replies, decides follow-up vs. close (1-5 messages)
- On close: enqueues async analysis job

### Feedback Analysis (async post-conversation)
Runs in parallel:
- Sentiment analysis
- Engagement quality scoring (word count, specificity, examples, elaboration)
- Core values mapping (per-value scores with evidence)
- Problematic language detection (coaching vs. escalation severity)
- Embedding generation (pgvector)
- AI summary generation

### Calibration Engine (weekly batch)
- Reviewer leniency/severity: flag if >1.5 std deviations from org mean
- Cross-team comparison: similar roles across teams
- Outlier detection: individual ratings far from consensus
- Blind review mode: strip names/demographics

---

## LLM Cost Model (100-Person Company)

Based on 8 LLM call sites across conversation orchestration and the analysis pipeline. Assumes **3 conversations per person per week** (~1,300/month) with ~4 exchange rounds each.

### Per-Conversation Token Usage

| Call | Tier | Input | Output |
|------|------|------:|-------:|
| Opening question | standard | ~400 | ~80 |
| Decision (×3 rounds) | fast | ~2,000 | ~15 |
| Follow-up questions (×3) | standard | ~2,700 | ~240 |
| Sentiment analysis | fast | ~1,700 | ~5 |
| Engagement scoring | fast | ~1,800 | ~30 |
| AI summary | standard | ~1,700 | ~150 |
| Problematic language flags | standard | ~1,800 | ~100 |
| Core values mapping | fast | ~2,200 | ~300 |

### Monthly Cost Estimate

| Tier | Model | Input Tokens | Output Tokens | Cost |
|------|-------|-------------:|--------------:|-----:|
| fast | Claude Haiku 4.5 ($1/$5 per MTok) | 10.0M | 455K | ~$12 |
| standard | Claude Sonnet 4.6 ($3/$15 per MTok) | 8.6M | 741K | ~$37 |
| | | | **Total** | **~$49/mo** |

### Pricing

At **$3/employee/month**, a 100-person company generates **$300/month revenue** against ~$49 in inference costs — **~83% gross margin** on AI spend. The analysis pipeline runs async via BullMQ and qualifies for Anthropic's batch API (50% discount), which could reduce inference costs to ~$30-35/month.

The `advanced` tier (Opus) is not used in any current call site. Cost scales linearly with headcount.

---

## Monorepo Structure

```
revualy/
├── packages/
│   ├── chat-core/              # ChatAdapter interface + canonical types
│   ├── chat-adapter-slack/     # Slack implementation (complete)
│   ├── chat-adapter-teams/     # Teams implementation (stub — Phase 5)
│   ├── chat-adapter-gchat/     # Google Chat implementation (stub — Phase 4)
│   ├── ai-core/                # LLM gateway + provider adapters
│   ├── shared/                 # Domain types, utilities
│   └── db/                     # Drizzle schema (control-plane + tenant), migrations
├── apps/
│   ├── api/                    # Fastify server + BullMQ workers
│   │   └── src/
│   │       ├── modules/        # auth, chat, conversation, feedback, manager, notifications, etc. (16 route files)
│   │       ├── lib/            # email, calendar, availability, interaction-scheduler, analysis-pipeline
│   │       └── workers/        # conversation, analysis, scheduler, notification, calendar-sync queues
│   └── web/                    # Next.js 15 dashboards
│       └── src/app/
│           ├── (employee)/     # Employee: dashboard, feedback, engagement, kudos
│           ├── (manager)/      # Manager: team overview, feedback, flagged, leaderboard, questions, org-chart
│           └── (admin)/        # Admin: settings, values, questionnaires, integrations, escalations
├── docs/                       # Architecture docs
└── docker-compose.yml          # PostgreSQL+pgvector, Redis 7, Neo4j 5
```

---

## API Design (REST + OpenAPI)

```
/api/v1/auth/*                    # Login, SSO, token refresh
/api/v1/users/:id/feedback        # Feedback (RBAC-filtered)
/api/v1/users/:id/relationships   # Relationship web
/api/v1/users/:id/engagement      # Engagement scores
/api/v1/users/:id/export          # Data export
/api/v1/kudos                     # Create + list digest
/api/v1/leaderboard               # Weekly leaderboard
/api/v1/feedback/flagged           # Flagged items (manager/HR)
/api/v1/escalations               # HR feed
/api/v1/admin/org                  # Org config, core values
/api/v1/admin/questionnaires      # Questionnaire CRUD + theme management
/api/v1/admin/relationships        # Graph overrides
/api/v1/admin/integrations         # Platform connections
/api/v1/notifications/preferences  # Notification preferences (GET/PATCH)
/api/v1/integrations/google/*      # Google Calendar OAuth (authorize, callback, status)
/api/v1/manager/questionnaires     # Manager-scoped question bank CRUD
/api/v1/manager/org-chart          # Manager reporting tree + threads
/api/v1/manager/relationships      # Manager-scoped relationship creation
/webhooks/slack/*                  # Slack adapter
/webhooks/teams/*                  # Teams adapter
/webhooks/gchat/*                  # Google Chat adapter
```

---

## Frontend Design System

"Warm Editorial" — intentionally avoids generic SaaS/AI aesthetics.

- **Fonts:** Fraunces (display/serif) + Outfit (body/sans)
- **Palette:** Cream (#FFFBF5), Forest green (#2D5A3D), Terracotta (#C4654A), warm stone scale
- **Cards:** rounded-2xl, warm shadows, staggered entry animations
- **Textures:** Subtle grain overlay, dot-grid patterns
- **Navigation path bar:** A breadcrumb-style path bar (e.g. "Team → Sarah Chen → Feedback") that stays hidden by default and reveals on hover over the top edge of the content area. Slides down with a subtle transition. Shows the full navigation path so users always know where they are, without eating vertical space. Appears across all dashboard layouts (employee, manager, admin).
- **Charts:** Recharts (LineChart, RadarChart, AreaChart) with forest/terracotta palette

### Dashboard Pages

**Employee** (`/dashboard`)
- Overview: engagement ring, stats, upcoming interaction, trend chart, values radar, recent feedback
- `/dashboard/feedback` — Full feedback history with sentiment, values, quality scores
- `/dashboard/engagement` — Score breakdown, weekly metrics table, trend chart
- `/dashboard/kudos` — Received/given kudos with value badges

**Manager** (`/team`)
- Overview: team stats, trend chart (high/avg/low bands), leaderboard, member grid, flagged items
- `/team/feedback` — All team feedback with reviewer→subject flow, per-member sidebar
- `/team/flagged` — Language/behavior flags, at-risk members, coaching tips
- `/team/leaderboard` — Rankings with historical weeks, participation stats
- `/team/[userId]` — **Per-reportee page** (like Culture Amp's 1-on-1 view). Dedicated page per direct report showing their engagement history, values radar, recent feedback, and a persistent **1-1 notes** section. Managers can add timestamped private notes (talking points, coaching observations, follow-up items). Notes are only visible to the manager, not the employee or admin. Notes persist across meetings and form a running record for performance conversations. Data model: `manager_notes` table (managerId, subjectUserId, content, createdAt, updatedAt).

**Admin** (`/settings`)
- Overview: org stats, core values list, integrations, escalation feed
- `/settings/values` — Core values CRUD with alignment scores
- `/settings/questions` — Questionnaire builder with themes, verbatim toggle, AI-discovered themes
- `/settings/integrations` — Platform connection cards with descriptions
- `/settings/escalations` — Detail view with audit trail timeline, related feedback

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-4) ✅
- Monorepo setup (Turborepo, Docker Compose for local dev)
- PostgreSQL schema + Drizzle ORM (control plane + tenant)
- `chat-core` package with adapter interface + registry
- Slack adapter (complete), GChat/Teams adapters (stubs)
- `ai-core` LLM gateway with model tiers
- Fastify API with 14 module route files + BullMQ workers
- Next.js dashboard shells (3 role-based views)
- GitHub Actions CI pipeline
- All 13 dashboard pages with production-grade UI

### Phase 2: Core Loop (Weeks 5-8) ✅
- ✅ `user_relationships` table — threads with tags, strength, source (mirrors org chart frontend)
- ✅ `questionnaires` + `questionnaire_themes` tables — theme-based questionnaire model
- ✅ Shared types: `UserRelationship`, `RelationshipGraph`, `Questionnaire`, `QuestionnaireTheme`
- ✅ Neo4j driver setup — `syncReportsTo`, `syncThread`, `getRelationshipWeb` graph operations
- ✅ Tenant context middleware — per-request DB resolution via `tenantPlugin`
- ✅ Relationships API — full CRUD (threads + reporting lines + org graph endpoint)
- ✅ Questionnaires API — full CRUD with themes, verbatim toggle
- ✅ Users API — profile CRUD, engagement scores (wired to Drizzle)
- ✅ Feedback API — RBAC-filtered feedback, flagged items, export (wired to Drizzle)
- ✅ Org admin API — core values CRUD, questionnaire management, relationship overrides
- ✅ Conversation orchestrator — multi-turn state machine (initiate → explore themes → follow-up → close)
- ✅ AI question generation — theme-aware, verbatim mode support, contextual follow-ups via LLMGateway
- ✅ Feedback analysis pipeline — sentiment, engagement scoring, core values mapping, language flagging, AI summary (parallel)
- ✅ Interaction scheduler — daily cron, weekly targets, subject selection via relationship strength, delayed job enqueue
- ✅ Chat webhook → BullMQ pipeline — inbound messages enqueued as conversation reply jobs
- ✅ Conversation admin API — list, view with messages, force-close
- ✅ User/org/team models + auth (NextAuth.js with Google/Microsoft SSO, RBAC middleware, session provider)
- ✅ Wire dashboards to real API data (all employee + manager pages via Promise.allSettled + mock fallback)
- ✅ Redis + BullMQ wiring — `server.ts` initializes state Redis, creates queues, starts workers, injects conversation queue into chat routes. Workers share queue instances. Graceful shutdown on SIGTERM/SIGINT.
- ✅ Code debt sweep — Zod validation, FK constraints + indexes, idempotent seed, LRU tenant pool (max 50)
- ✅ Admin mutation buttons — Values Add/Edit/Delete, Questionnaires New/Edit/Verbatim toggle, Overview Add/Edit. Server Actions + client component islands (Modal, ValuesList, ValuesCard, QuestionnairesList). Soft-delete for values (isActive: false).

**Remaining stubs (to be completed in later phases):**
- Leaderboard endpoint (returns empty — needs Redis sorted sets, Phase 4)
- Escalation module (returns empty — needs audit trail, Phase 4)
- Reflections page (frontend mock only — no self-reflection API, Phase 5)
- AI provider SDKs not integrated (LLM gateway abstraction exists, no Anthropic/OpenAI SDK wired)
- Outlook calendar integration (Phase 5 — Google Calendar done in Phase 3)

### Phase 2.5: Marketing Site + Demo Funnel
- SEO-optimized landing pages (public routes in Next.js app, no auth required)
- Pages: Hero/landing (`/`), Features, Pricing, About — all server components for crawlability
- Meta tags, Open Graph, JSON-LD structured data, semantic HTML
- CTA flow funnels to live demo dashboards (`/dashboard`, `/team`, `/settings`)
- Demo mode: visitors can explore all 13 dashboard pages with mock data (no login wall)
- Design: uses existing "Warm Editorial" system (Fraunces/Outfit, forest/terracotta/cream palette)
- Built with frontend-design plugin for distinctive, non-generic aesthetics
- Google Search Console + sitemap.xml + robots.txt
- **Copy direction:** Avoid generic "feedback" language. Lead with *real-time insight* — the value prop is that managers and teams get continuous signal about culture, values alignment, and team health as it happens, not in a quarterly report. Frame the product around insight and visibility, not process and reviews. Key phrases: "real-time insight into your team's culture", "see what's happening, not what happened", "continuous signal, not annual noise".

### Phase 3: Intelligence (Weeks 9-12) ✅
- ✅ **Kudos system** — Full CRUD API with user name joins (`giverName`/`receiverName`), Zod validation (`createKudosSchema`, `kudosQuerySchema`), Send Kudos modal (client component with receiver/value selects), server action, dashboard page wired to live API
- ✅ **Email notifications** — Resend wrapper (stub-logs without API key), three HTML email templates (weekly digest, flag alert, nudge) with warm editorial palette, notification preferences table + GET/PATCH API, worker cases for `schedule_weekly_digests` (Monday 9am UTC cron), `weekly_digest`, `flag_alert`, `nudge`. RFC 8058 one-click unsubscribe headers.
- ✅ **Calendar-aware interaction scheduling**
  - ✅ Google Calendar OAuth (authorize/callback/status routes via `googleapis`)
  - ✅ Token storage in `calendar_tokens` table with refresh-on-expiry
  - ✅ Calendar sync worker (15-min repeatable cron) — fetches next 7 days, upserts into `calendar_events`
  - ✅ Availability engine: `findFreeSlots()` finds gaps, `scoreSlot()` prefers mid-morning/mid-afternoon, `findBestSlot()` combines both
  - ✅ `calculateSendTime()` now async — checks calendar availability first, falls back to preferred time + jitter
  - ✅ Auto-relationship inference from co-attendees (>=2 shared meetings → `user_relationships` with `source: "calendar"`)
  - Outlook sync deferred to Phase 5
- ✅ **Manager question bank + sub-org chart**
  - ✅ `createdByUserId` + `teamScope` columns on `questionnaires` table (migration 0004)
  - ✅ Manager-scoped API routes: GET/POST/PATCH questionnaires (ownership check), GET org-chart (BFS reporting tree), POST relationships (both users must be in tree)
  - ✅ `getReportingTree()` BFS helper walks `users.managerId` for full direct/indirect report tree
  - ✅ Question bank page ("My Team" vs "Org-Wide" sections) + Create Questionnaire modal (name, category, verbatim, dynamic themes)
  - ✅ Org chart page: CSS flexbox tree with recursive `TreeNode` component, relationship threads overlay, stats cards
  - ✅ `selectQuestionnaire()` updated to prefer team-scoped questionnaires for the user's team
  - RBAC enforced: `requireRole("manager")` preHandler, ownership checks on PATCH, tree-scope checks on relationships
- Core values mapping in feedback analysis (already implemented in Phase 2 analysis pipeline)
- Language flagging + manager coaching alerts (already implemented in Phase 2 analysis pipeline)
- AI theme discovery from comms analysis (deferred — requires LLM SDK wiring)

**Not implemented in Phase 3 (deferred):**
- Demo chat interactions (animated preview + live interactive demo) — deferred to Phase 4
- Outlook calendar integration — deferred to Phase 5

**New dependencies added:** `resend`, `googleapis`
**New migrations:** 0002 (notification_preferences), 0003 (calendar_tokens), 0004 (questionnaire scope columns)

### Phase 4: Google Chat Adapter + Beta Launch (Weeks 13-16)
- [x] **1:1 Meeting Sessions** — replaced chat-style notes with real-time live sessions
  - Database: `one_on_one_sessions`, `one_on_one_action_items`, `one_on_one_agenda_items` (migration 0007)
  - REST API: full CRUD for sessions, action items, agenda items (10 endpoints)
  - Agenda generator: auto-populates from open action items, flagged feedback, kudos, team questionnaire themes
  - WebSocket (`@fastify/websocket`): real-time notes relay, presence, request-edit, Redis-backed persistence
  - Frontend: `SessionEditor` (manager), `SessionViewer` (employee), `SessionList`, schedule form
  - Pages: manager `/team/members/[userId]/one-on-one`, employee `/dashboard/one-on-ones/[sessionId]`
- [x] **Rate limiting** — `@fastify/rate-limit` with 100 req/min global limit, tenant-aware key generator
- [x] **LLM gateway route injection** — `app.llm` and `app.adapters` decorated on FastifyInstance with TS declaration merging
- [x] **Leaderboard API** — real DB query on `engagement_scores` + `users`, weighted composite score, ISO week grouping
- [x] **Escalation pipeline** — expanded schema (migration 0008), standalone filing, full CRUD (5 endpoints), audit trail notes
  - Types: harassment, bias, retaliation, other; Severities: low/medium/high/critical
  - Statuses: open → investigating → resolved/dismissed
  - Any user can file, admins manage, reporter + admin can view/add notes
- [x] **Google Chat adapter** — verification token auth (no JWT), `sendMessage` via Chat API Cards v2, `resolveUser` via members API
- [x] **Notification preferences page** — `/dashboard/settings` with toggle rows, server actions, sidebar nav link
- [x] **Onboarding wizard** — 3-step flow (profile, notifications, calendar), middleware redirect, `PATCH /users/me/onboarding` endpoint
- Google Workspace app setup + admin installation at beta company
- Demo chat interactions (animated preview + live interactive demo, deferred from Phase 3)
- **Beta launch with Google Chat company**

**New dependencies added (Phase 4):** `@fastify/rate-limit`
**New migrations (Phase 4):** 0008 (escalation pipeline expansion)

### Phase 5: Advanced Features + Teams (Weeks 17-20)
- Calibration engine
- Pulse check: comms ingestion + follow-up
- 360 manager reviews (aggregated upward feedback)
- Self-reflection interactions + reflections page
- Relationship web visualization (D3.js — replace CSS flexbox org chart)
- Data export, blind review mode
- Microsoft Teams adapter (third platform)
- Outlook calendar integration
- AI theme discovery (requires LLM SDK wiring)

---

## Verification

- **Chat agnosticism:** Write a test that sends the same OutboundMessage through each adapter and verifies platform-native formatting
- **Conversation flow:** End-to-end test: schedule → initiate → 3-turn conversation → close → verify feedback_entries + engagement_scores populated
- **Questionnaire modes:** Verify adaptive mode produces varied phrasing across conversations; verbatim mode produces identical wording
- **RBAC:** Test that employee cannot access `/api/v1/feedback/flagged`, manager can see team but not other teams, admin sees all
- **Encryption:** Verify `feedback_entries.raw_content` is encrypted at rest, decrypts correctly on read
- **Leaderboard:** Run 10 scored interactions, verify top 3 ranking is correct
- **Escalation:** Submit flagged feedback, verify it appears in HR feed and not in manager dashboard
- **Calibration:** Seed biased reviewer data, verify leniency/severity detection fires

---

## Code Review Findings

### First Review (2026-02-17)
Full static analysis — 40 findings (18 high/critical, 16 medium, 6 low). **37 fixed**, 3 acceptable (single-tenant workers, pre-beta destructive migration, intentional GChat token auth, standard TS cast pattern).

### Second Review (2026-02-18)
Comprehensive review across API server, frontend, and all packages. 30 new findings not covered by the first review.

#### Critical / High (10)

1. **WebSocket token exposed in URL** — `apps/web/.../one-on-ones/[sessionId]/page.tsx`, manager equivalents
   WS auth token passed as `?token=...` query param. Leaks to browser history, server logs, referrer headers.

2. **Calendar OAuth tokens stored unencrypted** — `packages/db/src/schema/tenant.ts:485-507`
   `accessToken`/`refreshToken` in `calendar_tokens` are plain text. Grants access to user Google calendars if DB is compromised.

3. **Neo4j operations have no error handling** — `packages/db/src/neo4j.ts:59-96`
   All sync functions throw unhandled if Neo4j is down. Neo4j is supplementary — shouldn't crash the app.

4. **Unvalidated WebSocket message payloads** — `apps/web/src/components/session-editor.tsx:57-80`, `session-viewer.tsx:39-66`
   Incoming WS messages cast directly (`msg.content as string`) without schema validation.

5. **Prompt injection risk in LLM prompts** — `apps/api/src/lib/conversation-orchestrator.ts:319-330`
   User names and feedback content interpolated directly into LLM system prompts without sanitization.

6. **Missing transaction in initiateConversation** — `apps/api/src/lib/conversation-orchestrator.ts:107-121`
   Conversation record and first message inserted separately. Message failure orphans the conversation.

7. **Onboarding check trusts JWT claim, not DB** — `apps/web/src/middleware.ts:25-31`
   `user.onboardingCompleted` read from token only. Tampered JWT bypasses onboarding flow.

8. **Hardcoded sidebar usernames** — `apps/web/src/app/(manager)/layout.tsx:20`, `(admin)/layout.tsx:19`
   Both pass `userName="Alex Thompson"` instead of reading from auth session.

9. **Missing session ownership check** — `apps/web/src/app/(employee)/dashboard/one-on-ones/[sessionId]/page.tsx`
   Any authenticated employee can load any 1:1 session by ID. No `employeeId` validation.

10. **Tenant pool eviction can leak memory** — `packages/db/src/tenant.ts:36-50`
    If all entries share identical `lastUsed` timestamps, eviction silently fails and pool grows unbounded.

#### Medium (14)

11. **Unsafe type assertions on Neo4j results** — `packages/db/src/neo4j.ts:217-276`
    `getRelationshipWeb` casts results without null checks. Missing nodes crash the function.

12. **Escalation schema allows orphaned records** — `packages/db/src/schema/tenant.ts:272-304`
    No CHECK constraint requiring at least one of `feedbackEntryId` or `reporterId` to be non-null.

13. **Missing unique constraint on escalations per feedback** — same file
    Duplicate escalations for the same feedback entry are possible.

14. **Missing "cancelled" status for 1:1 sessions** — `packages/db/src/schema/tenant.ts:511-539`
    Only "scheduled"/"active"/"completed". No way to represent cancellations.

15. **OpenAI adapter doesn't extract system messages** — `packages/ai-core/src/providers/openai-compat.ts:34-37`
    Unlike Anthropic adapter, system messages aren't separated from user/assistant messages.

16. **Neo4j driver initialization race condition** — `packages/db/src/neo4j.ts:8-21`
    Concurrent `getNeo4jDriver()` calls can both trigger `initNeo4j()`, creating duplicate drivers.

17. **Stale data from sequential 1:1 API calls** — `apps/web/.../[userId]/one-on-one/page.tsx:22-59`
    Active session loaded, then detail fetched separately. Status can change between calls.

18. **Missing error boundaries on dashboard pages** — multiple pages
    No `error.tsx` files. A chart component throw crashes the entire page.

19. **Optimistic WS updates without rollback** — `apps/web/src/components/session-editor.tsx:111-118`
    Notes update local state immediately; WS send failure causes state divergence with no recovery.

20. **Analysis pipeline uses console.error** — `apps/api/src/lib/analysis-pipeline.ts:74-80`
    Errors go to console, not Fastify structured logger. Invisible in centralized logging.

21. **LLM JSON parse fallback generates unreliable scores** — `apps/api/src/lib/analysis-pipeline.ts:190-206`
    Invalid JSON triggers heuristic scoring fallback that still writes to DB as if reliable.

22. **Hardcoded fallback `ws://localhost:3000`** — `apps/web/.../[sessionId]/page.tsx:57`
    Falls back to insecure localhost WS URL if `NEXT_PUBLIC_WS_URL` not set.

23. **Missing input validation on admin form submissions** — `apps/web/src/app/(admin)/settings/actions.ts:13-26`
    FormData values extracted with `as string` casts, no Zod validation before API call.

24. **WebSocket room cleanup incomplete** — `apps/api/src/modules/one-on-one/ws.ts:100-117`
    Room cleaned only when both sockets disconnect. One-sided disconnects leak rooms in memory.

#### Low (6)

25. **`as any` cast in 1:1 page** — `apps/web/.../[userId]/one-on-one/page.tsx:133`
26. **GChat card ID uses `Date.now()`** — `packages/chat-adapter-gchat/src/adapter.ts:126` — weak entropy, use `crypto.randomUUID()`
27. **Missing null check on Slack `event.user`** — `packages/chat-adapter-slack/src/adapter.ts:100-102`
28. **`console.warn` in production WS components** — `session-editor.tsx:62`, `session-viewer.tsx:44`
29. **`LLMProvider` typed as generic `string`** — `packages/ai-core/src/types.ts:3` — should be union type
30. **Inconsistent error handling in server actions** — `apps/web/.../onboarding/actions.ts:16` — `String(e)` loses error type


continuing the plan for switching NextAuth.js from JWT to database-backed sessions. Let me read the key files to design the implementation plan.