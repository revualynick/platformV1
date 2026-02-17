# Revualy — Claude Code Instructions

## What is this project?
AI-powered peer review platform. Feedback interactions happen via chat (Slack, Google Chat, Teams). The system is **chat-platform agnostic** — core logic is fully decoupled from any specific platform via an adapter pattern.

Read `docs/plan.md` for the full architecture, tech stack, data model, and implementation phases.

## Current state
**Phase 1 (Foundation), Phase 2 (Core Loop), Phase 3 (Intelligence) complete. Phase 4 in progress.** See `docs/plan.md` for full checklists.

Phase 4 progress: 1:1 meeting sessions (replaced old chat-style notes). Session model with real-time WebSocket sync, AI agenda generation, action items, and agenda tracking. `@fastify/websocket` installed.

**Next up:** Remaining Phase 4 items (Google Chat adapter, escalation pipeline, leaderboard, beta launch).

## Repo structure
```
apps/api/         — Fastify server + BullMQ workers (16 route modules, 5 queues)
apps/web/         — Next.js 15 dashboards (App Router, server components)
packages/shared/  — Domain types + utilities
packages/chat-core/         — ChatAdapter interface + AdapterRegistry
packages/chat-adapter-slack/ — Slack adapter (complete)
packages/chat-adapter-gchat/ — Google Chat adapter (partial stub)
packages/chat-adapter-teams/ — Teams adapter (stub)
packages/ai-core/           — LLMGateway (abstraction only, no SDK wired)
packages/db/                — Drizzle schema (control plane + tenant), Neo4j ops, seed, migrations
docs/plan.md                — Full architecture + phase checklist
```

## Key commands
```bash
pnpm turbo typecheck              # Typecheck all packages
pnpm turbo typecheck --filter=@revualy/api   # Typecheck API only
pnpm turbo typecheck --filter=@revualy/web   # Typecheck web only
pnpm turbo build                  # Build all packages
pnpm dev                          # Start dev (api + web)
docker compose up -d              # PostgreSQL, Redis, Neo4j
```

## Conventions
- **Package names:** `@revualy/api`, `@revualy/web`, `@revualy/shared`, `@revualy/db`, `@revualy/chat-core`, `@revualy/ai-core`, `@revualy/chat-adapter-slack`, etc.
- **Imports:** Use `.js` extensions in import paths (ESM)
- **Validation:** Zod schemas in `apps/api/src/lib/validation.ts`, use `parseBody()` helper
- **Auth/RBAC:** `requireAuth` / `requireRole` prehandlers in `apps/api/src/lib/rbac.ts`
- **Tenant context:** `request.tenant` gives `{ orgId, db, userId }` per request
- **Error handling:** Global Fastify `setErrorHandler` — 400 for validation, 500 for everything else
- **Frontend API calls:** Server-side `lib/api.ts` with `Promise.allSettled` + mock fallback
- **BullMQ:** Workers share queue instances from `createQueues()`. Never create ad-hoc `new Queue()` inside workers.
- **Redis state:** Conversation state via `SETEX`/`GET`/`DEL`, 24h TTL, key `conv:{id}`. WebSocket notes: `1on1:content:{sessionId}`, 24h TTL.
- **WebSocket:** `@fastify/websocket` for 1:1 sessions. In-memory room map + Redis cache for reconnection. Dedicated ioredis instance (not BullMQ's).
- **Drizzle:** Can't chain `.where()` — build conditions array, then `.where(and(...conditions))`
- **Self-referencing FKs:** Use raw SQL migrations (Drizzle can't express inline)
- **Fastify 5:** `decorateRequest("prop")` without second arg (no null)

## Known gaps (as of Phase 4 — 1:1 sessions complete)
- Leaderboard endpoint returns empty (needs Redis sorted sets — Phase 4)
- Escalation module returns empty (needs audit trail — Phase 4)
- Reflections page is pure mock (no self-reflection API — Phase 5)
- LLM gateway has no provider SDKs wired (Anthropic/OpenAI)
- Rate limiting not implemented
- GChat adapter: inbound normalization works, outbound/auth are stubs (Phase 4)
- Teams adapter: full stub (Phase 5)
- Outlook calendar integration not built (Phase 5 — Google Calendar done)
- Email notification preferences have no frontend settings page (API ready)
- 1:1 agenda generator is data-only (no LLM prioritization yet — upgradable later)
