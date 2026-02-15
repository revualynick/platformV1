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

Key tables per tenant DB: `users`, `user_platform_identities`, `teams`, `core_values`, `user_relationships`, `questionnaires`, `questionnaire_themes`, `conversations`, `conversation_messages`, `feedback_entries`, `feedback_value_scores`, `kudos`, `engagement_scores`, `escalations`, `escalation_audit_log`, `questions`, `interaction_schedule`, `pulse_check_triggers`, `calendar_events`

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
│   │       ├── modules/        # auth, chat, conversation, feedback, etc. (14 route files)
│   │       └── workers/        # conversation, analysis, scheduler, notification queues
│   └── web/                    # Next.js 15 dashboards
│       └── src/app/
│           ├── (employee)/     # Employee: dashboard, feedback, engagement, kudos
│           ├── (manager)/      # Manager: team overview, feedback, flagged, leaderboard
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
- Kudos module (returns empty — Phase 3)
- Notification worker (weekly_digest, leaderboard_update — Phase 4)
- Reflections page (frontend mock only — no self-reflection API)
- AI provider SDKs not integrated (LLM gateway abstraction exists, no Anthropic/OpenAI SDK wired)

### Phase 2.5: Marketing Site + Demo Funnel
- SEO-optimized landing pages (public routes in Next.js app, no auth required)
- Pages: Hero/landing (`/`), Features, Pricing, About — all server components for crawlability
- Meta tags, Open Graph, JSON-LD structured data, semantic HTML
- CTA flow funnels to live demo dashboards (`/dashboard`, `/team`, `/settings`)
- Demo mode: visitors can explore all 13 dashboard pages with mock data (no login wall)
- Design: uses existing "Warm Editorial" system (Fraunces/Outfit, forest/terracotta/cream palette)
- Built with frontend-design plugin for distinctive, non-generic aesthetics
- Google Search Console + sitemap.xml + robots.txt

### Phase 3: Intelligence (Weeks 9-12)
- **Calendar-aware interaction scheduling**
  - Sync Google Calendar / Outlook calendars via OAuth (read-only)
  - Scan each user's calendar for free gaps (no meetings, no focus time blocks)
  - Score gaps by quality: prefer mid-morning/mid-afternoon lulls, avoid back-to-back meeting edges, respect "Do Not Disturb" / OOO status
  - Feed gap windows into the interaction scheduler so the bot only initiates feedback conversations when the user actually has breathing room
  - Fallback: if no calendar connected, use historical chat-activity patterns (existing behavior)
  - Store `calendar_events` per tenant DB, refresh on a 15-min polling interval (webhook where supported)
- Auto-relationship graph from calendar data (shared-meeting frequency → connection strength in Neo4j)
- Core values mapping in feedback analysis
- Language flagging + manager coaching alerts
- Kudos system (chat capture + dashboard display)
- AI theme discovery from comms analysis
- **Manager-driven question bank + sub-org chart**
  - Add a cut-down question bank UI to the manager tab so managers can create/edit questionnaire themes for their own teams without needing admin access
  - Manager-created themes are scoped to their team and feed into the org-wide question bank (admin can review/promote to global)
  - Add a sub-org chart view to the manager tab showing the manager's direct/indirect reports and their thread connections
  - Managers can create/edit thread connections between their reports (e.g. pairing two team members for peer review)
  - Sub-org chart thread connections sync upstream into the main org-wide relationship graph — manager edits are the primary source of truth for intra-team relationships
  - RBAC: managers can only see/edit relationships and themes within their reporting tree, not across the whole org

- **Demo chat interactions (marketing + lead capture)**
  - **Animated preview (no auth):** Looping chat interaction animation on the `/home` hub page showing a realistic 3-4 message feedback conversation between the Revualy bot and a user. Auto-types messages with realistic delays, pauses at the end, then resets. Pure CSS/JS animation — no video file. Visible to all visitors as a taste of the product.
  - **Live interactive demo (gated):** A working sample chat interaction behind a lead capture form (name, work email, company, team size). After submission, the user enters a sandbox chat UI where the Revualy bot walks them through an actual feedback conversation using the conversation orchestrator with a demo questionnaire. Uses mock peer data and a demo org context — no real account created. Conversation is disposable (not persisted beyond the session).
  - Lead capture data stored in the control plane DB (`demo_leads` table: name, email, company, team_size, created_at, interaction_completed boolean)
  - Follow-up: demo completion triggers a notification to the sales pipeline (email or webhook)

### Phase 4: Google Chat Adapter + Beta Launch (Weeks 13-16)
- **Google Chat adapter** (via Chat API + Pub/Sub for events, Cards v2 for rich messages)
- Google Workspace app setup + admin installation at beta company
- Escalation pipeline + HR feed
- Leaderboard + weekly digest + voucher tracking
- Onboarding flow (AI get-to-know-you)
- **Beta launch with Google Chat company**

### Phase 5: Advanced Features + Teams (Weeks 17-20)
- Calibration engine
- Pulse check: comms ingestion + follow-up
- 360 manager reviews (aggregated upward feedback)
- Self-reflection interactions
- Relationship web visualization (D3.js)
- Data export, blind review mode
- Microsoft Teams adapter (third platform)

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
