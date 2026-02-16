# Revualy — Claude Code Instructions

## What is this project?
AI-powered peer review platform. Feedback interactions happen via chat (Slack, Google Chat, Teams). The system is **chat-platform agnostic** — core logic is fully decoupled from any specific platform via an adapter pattern.

Read `docs/plan.md` for the full architecture, tech stack, data model, and implementation phases.

## Current state
**Phase 1 (Foundation), Phase 2 (Core Loop), and Phase 3 (Intelligence) are complete.** See `docs/plan.md` for full checklists.

Phase 3 added: Kudos system (full CRUD + modal), email notifications (Resend + templates + preferences + cron), Google Calendar sync (OAuth + availability engine + relationship inference), manager question bank + sub-org chart (scoped CRUD + BFS reporting tree + CSS tree page).

**Next up:** Phase 4 (Google Chat adapter + beta launch). Phase 2.5 (marketing site) is also unbuilt.

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
- **Redis state:** Conversation state via `SETEX`/`GET`/`DEL`, 24h TTL, key `conv:{id}`
- **Drizzle:** Can't chain `.where()` — build conditions array, then `.where(and(...conditions))`
- **Self-referencing FKs:** Use raw SQL migrations (Drizzle can't express inline)
- **Fastify 5:** `decorateRequest("prop")` without second arg (no null)

## Known gaps (as of Phase 3 complete)
- Leaderboard endpoint returns empty (needs Redis sorted sets — Phase 4)
- Escalation module returns empty (needs audit trail — Phase 4)
- Reflections page is pure mock (no self-reflection API — Phase 5)
- LLM gateway has no provider SDKs wired (Anthropic/OpenAI)
- Rate limiting not implemented
- GChat adapter: inbound normalization works, outbound/auth are stubs (Phase 4)
- Teams adapter: full stub (Phase 5)
- Marketing site / landing pages not built (Phase 2.5)
- Outlook calendar integration not built (Phase 5 — Google Calendar done)
- Email notification preferences have no frontend settings page (API ready)
