# Revualy — Claude Code Instructions

## Context Recovery (post-compaction / clear / startup)
Before doing any work after compaction, `/clear`, or session start, re-orient:
1. Read `docs/plan.md` lines 1-50 (brief + spec) and last 50 lines (active context)
2. Run `git log --oneline -10` and `git diff --stat` to see recent work + uncommitted changes
3. Check task list (`TaskList`) if one exists
4. Only then proceed with the user's request

## What is this project?
AI-powered peer review platform. Feedback interactions happen via chat (Slack, Google Chat, Teams). The system is **chat-platform agnostic** — core logic is fully decoupled from any specific platform via an adapter pattern.

Read `docs/plan.md` for the full architecture, tech stack, data model, and implementation phases.

## Current state
**Phase 1 (Foundation), Phase 2 (Core Loop), Phase 3 (Intelligence) complete. Phase 4 mostly complete.** See `docs/plan.md` for full checklists.

Phase 4 complete: 1:1 sessions, rate limiting (`@fastify/rate-limit`), LLM gateway injection (`app.llm`/`app.adapters`), leaderboard API (DB-backed), escalation pipeline (5 endpoints + audit trail), Google Chat adapter (verification token + Chat API), notification preferences page (`/dashboard/settings`), onboarding wizard (3-step flow + middleware redirect).

**Next up:** Google Workspace admin setup, demo chat interactions, beta launch.

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

## Known gaps (as of Phase 4 — mostly complete)
- Reflections page is pure mock (no self-reflection API — Phase 5)
- LLM gateway has no provider SDKs wired (Anthropic/OpenAI)
- GChat adapter: needs Google Workspace admin setup to test end-to-end
- Teams adapter: full stub (Phase 5)
- Outlook calendar integration not built (Phase 5 — Google Calendar done)
- 1:1 agenda generator is data-only (no LLM prioritization yet — upgradable later)
- Demo chat interactions page not built (deferred from Phase 3)
- Google Workspace app installation/admin setup pending beta company
