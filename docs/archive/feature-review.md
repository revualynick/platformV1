# Feature & Service Review — March 28, 2026

Combined findings from Codex (5 reviews) and Claude reviewer agents (5 reviews).
Deduplicated across both sources.

---

## 1. BullMQ / Workers

### CRITICAL

#### 1.1 Analysis job not idempotent — duplicate feedback entries on retry
**Files:** `apps/api/src/lib/analysis-pipeline.ts:104-144`

`runAnalysisPipeline` inserts a `feedbackEntries` row inside a transaction with `attempts: 3`. If the job fails after INSERT but before BullMQ marks it complete, the retry creates a duplicate row. No unique constraint on `feedbackEntries.conversationId` and no `ON CONFLICT` guard.

**Fix:** Add unique constraint on `feedbackEntries.conversationId`, use `INSERT ... ON CONFLICT DO NOTHING RETURNING`, short-circuit if no row returned.

#### 1.2 Reply jobs silently dropped on lock contention
**Files:** `apps/api/src/workers/index.ts:236-240`

When `acquireConversationLock` returns `null`, the worker returns without throwing. BullMQ marks the job complete. A legitimate second reply arriving during LLM processing is permanently discarded.

**Fix:** Throw a retryable error so BullMQ applies exponential backoff. Use `MoveToDelayed` or short delay.

#### 1.3 Scheduler not idempotent — retries create duplicate conversations
**Files:** `apps/api/src/lib/interaction-scheduler.ts:128-155`

Schedule rows inserted then jobs enqueued without uniqueness guard. Retry creates duplicate schedule rows and duplicate conversation starts.

**Fix:** Add uniqueness constraint on schedule slot, give `initiate` job a deterministic `jobId` based on schedule entry ID.

### HIGH

#### 1.4 No `lockDuration`/`stalledInterval` config — stall detection mismatch
**Files:** `apps/api/src/workers/index.ts:191-328`

BullMQ defaults (30s) mismatched with conversation lock (60s heartbeat). Slow LLM calls can trigger stall detection and re-delivery before the first worker finishes.

**Fix:** Set `lockDuration: 90000`, `lockRenewTime: 30000` on conversation worker.

#### 1.5 Weekly digest fan-out not deduplicated
**Files:** `apps/api/src/workers/index.ts:337-356`

Sequential `await` loop enqueuing one job per user with no `jobId`. Retry sends duplicates.

**Fix:** Use `notificationQueue.addBulk()` with deterministic `jobId: weekly_digest:${orgId}:${userId}:${weekKey}`.

#### 1.6 `close` job only deletes Redis state — doesn't update DB or trigger analysis
**Files:** `apps/api/src/workers/index.ts:272-275`

**Fix:** Call `closeConversation()` to update DB status and enqueue analysis before deleting Redis state.

#### 1.7 `getStateRedis` swallows connection errors
**Files:** `apps/api/src/workers/index.ts:85-94`

`stateRedis.connect()` not awaited, `.catch()` silently swallows errors. No readiness signal.

**Fix:** `await stateRedis.connect()` in `initStateRedis`, throw on failure.

### MEDIUM

#### 1.8 Job payloads not runtime-validated
**Files:** `apps/api/src/workers/index.ts` (all worker cases)

All workers use `job.data as { ... }` casts with no Zod validation.

**Fix:** Add Zod schemas per job type, parse inside each processor before side effects.

#### 1.9 Calendar sync unbounded query
**Files:** `apps/api/src/workers/index.ts:530-532`

Loads all `calendarTokens` rows into memory with no LIMIT.

**Fix:** Paginate or use cursor-based batches.

#### 1.10 No shutdown timeout — graceful shutdown can hang indefinitely
**Files:** `apps/api/src/server.ts:267-284`

`Promise.allSettled` with no timeout. If any worker `.close()` hangs, shutdown hangs forever.

**Fix:** Wrap in `Promise.race` against a 10s timeout.

#### 1.11 Stale cron patterns persist in Redis across deploys
**Files:** `apps/api/src/server.ts:252-263`

Repeatable job re-registered on every startup. If cron pattern changes, old pattern persists.

**Fix:** Call `queue.removeRepeatable(...)` for old key before adding new one.

### LOW

#### 1.12 `preferredTime` treated as UTC, ignoring user timezone
**Files:** `apps/api/src/lib/interaction-scheduler.ts:297-314`

#### 1.13 Workers have no `.on("error")` listener
**Files:** `apps/api/src/workers/index.ts:191-553`

#### 1.14 `removeOnFail: 5000` can accumulate ~50 MB of dead jobs
**Files:** `apps/api/src/workers/index.ts:59`

---

## 2. Chat Adapters

### CRITICAL

#### 2.1 GChat: Broken HMAC comparison — webhook verification always fails
**Files:** `packages/chat-adapter-gchat/src/adapter.ts:65-83`

Both `expected` and `actual` are HMACs keyed on different strings, then compared. This always returns `false` for legitimate webhooks. The intent was timing-safe token comparison, but the implementation inverts the logic — it HMACs the secret and the token separately instead of comparing them directly.

**Fix:** Compare incoming token to `this.verificationToken` directly using timing-safe byte comparison:
```ts
const expected = Buffer.from(this.verificationToken);
const actual = Buffer.from(token);
if (expected.length === actual.length && crypto.timingSafeEqual(expected, actual)) { ... }
```

#### 2.2 GChat: No replay protection
**Files:** `packages/chat-adapter-gchat/src/adapter.ts:54-87`

No timestamp check. Captured webhook can be replayed indefinitely.

**Fix:** Validate event timestamp against ±5 minute window (like Slack adapter does).

#### 2.3 Silent message discard if conversation queue uninitialized
**Files:** `apps/api/src/modules/chat/routes.ts:6-10, 29-43`

Module-level `conversationQueue` starts as `null`. Real messages silently dropped before `setConversationQueue` is called.

**Fix:** Use Fastify's dependency injection (decorate on `app`) so routes can't register without the queue.

### HIGH

#### 2.4 Teams: JWT bypass if `NODE_ENV` misconfigured
**Files:** `packages/chat-adapter-teams/src/adapter.ts:89-95`

`TEAMS_SKIP_JWT_VERIFY=true` bypass only checks `NODE_ENV`. If `NODE_ENV=development` in a production Railway env (easy mistake), JWT verification disabled.

**Fix:** Only allow bypass when BOTH `TEAMS_SKIP_JWT_VERIFY=true` AND `NODE_ENV` is explicitly `development` or `test`.

#### 2.5 Teams: JWKS never refreshed after initial fetch
**Files:** `packages/chat-adapter-teams/src/adapter.ts:262-277`

If Bot Framework rotates signing keys, all JWTs become permanently unverifiable until process restart.

**Fix:** Remove the `if (this.jwks)` singleton guard; let `jose`'s `createRemoteJWKSet` handle its own caching/refresh.

#### 2.6 Slack: Fallback HMAC base string silently wrong
**Files:** `apps/api/src/modules/chat/routes.ts:71`, `packages/chat-adapter-slack/src/adapter.ts:49`

If `__rawBody` is missing, fallback `JSON.stringify(body)` produces different byte order than Slack's original. HMAC silently fails instead of returning 400.

**Fix:** Throw/return 400 if `__rawBody` is absent rather than falling back.

#### 2.7 No webhook-specific rate limiting
**Files:** `apps/api/src/server.ts:68-73`

Global rate limiter keys on `userId` which is always `null` for webhooks. Falls back to IP, throttling entire platform IP ranges.

**Fix:** Add per-route rate limits for webhook endpoints, keyed on platform type.

#### 2.8 Teams: `serviceUrl` SSRF dependency on call ordering
**Files:** `packages/chat-adapter-teams/src/adapter.ts:174-175, 244-259`

`serviceUrl` from untrusted `activity` is cached in `normalizeInbound`. Safety depends on `verifyWebhook` running first, but this ordering is implicit.

**Fix:** Validate `serviceUrl` again inside `cacheConversationRef`.

### MEDIUM

#### 2.9 Slack/GChat: Unsafe field casts in `normalizeInbound`
**Files:** Slack adapter:88-112, GChat adapter:89-115

No null/type guards on fields like `event.ts`, `event.channel`, `event.user`. Malformed payloads crash.

**Fix:** Add presence checks, return `null` if required fields absent.

#### 2.10 Slack: No replay dedupe within 5-minute window
**Files:** `packages/chat-adapter-slack/src/adapter.ts:41`

Timestamp window alone doesn't prevent replay within the valid window.

**Fix:** Short-TTL dedupe store keyed by Slack event ID.

#### 2.11 Teams: In-memory `conversationRefs` lost on restart
**Files:** `packages/chat-adapter-teams/src/adapter.ts:46-47`

All stored refs lost on container restart. Outbound messages fail until channels send new inbound.

**Fix:** Persist to Redis.

#### 2.12 GChat: `resolveUser` stub returns raw platform IDs as display names
**Files:** `packages/chat-adapter-gchat/src/adapter.ts:155-169`

Shows strings like `users/1234567890` in dashboard.

### LOW

#### 2.13 Teams: `stripBotMentions` regex over-matches partial words
#### 2.14 Teams: Token refresh thundering-herd race on concurrent sends
#### 2.15 `retryAsync` non-transient detection via string matching is brittle

---

## 3. AI / LLM Integration

### CRITICAL

#### 3.1 User feedback injected verbatim into analysis prompts — prompt injection
**Files:** `apps/api/src/lib/analysis-pipeline.ts:173-176, 210-222, 259-262, 300-313, 354-364`

`rawContent` (concatenation of all user messages) embedded verbatim in system-role prompts for sentiment, engagement, summary, flag detection, and core-values mapping. No sanitization applied.

**Fix:** Apply `stripControlChars` to `rawContent`, use XML/delimiter framing, add instruction to treat enclosed text as data.

#### 3.2 Unbounded conversation history — no per-message size limit on webhook path
**Files:** `apps/api/src/lib/conversation-orchestrator.ts:346-350`, `apps/api/src/modules/chat/routes.ts`

Demo path caps at 5000 chars but chat webhook path has no limit. Large Slack/Teams messages can overflow context window and drive up costs.

**Fix:** Enforce 2000-char max on `userMessage` in `handleReply`. Slice `priorMessages` to last 10 messages.

### HIGH

#### 3.3 `decideNextAction` embeds raw user reply in system prompt
**Files:** `apps/api/src/lib/conversation-orchestrator.ts:383-390`

`"The user replied: "${lastReply}"` — trivial injection surface.

**Fix:** Pass `lastReply` as a separate user-role message, or apply `stripControlChars` + XML delimiters.

#### 3.4 No per-tenant token budget or rate limiting on LLM calls
**Files:** `packages/ai-core/src/gateway.ts`, `apps/api/src/lib/analysis-pipeline.ts`

Each conversation analysis triggers 5 parallel LLM calls. No spend cap, no circuit breaker.

**Fix:** Track cumulative tokens in Redis keyed by `orgId:date`. Throw/degrade when budget exceeded.

#### 3.5 No retry or timeout on LLM API calls
**Files:** `packages/ai-core/src/providers/anthropic.ts:34`, `packages/ai-core/src/providers/openai-compat.ts:59`

No timeout, no retry for transient errors. Orchestrator failures leave orphaned conversation rows.

**Fix:** Add 30s `AbortSignal` timeout, retry with backoff for 429/5xx. Wrap orchestrator calls in try/catch.

#### 3.6 Raw PII sent to external LLM APIs
**Files:** `apps/api/src/lib/conversation-orchestrator.ts`, `apps/api/src/lib/analysis-pipeline.ts`

Employee names, emails, and sensitive HR content sent verbatim. No redaction.

**Fix:** Redact names/emails before prompt construction. Gate external LLM use behind explicit policy.

#### 3.7 `x-demo-email` header trivially forgeable
**Files:** `apps/api/src/modules/demo/routes.ts:118-120, 289-296`

Anyone who knows another user's email can claim/continue their demo conversation.

**Fix:** Issue a signed demo token after lead registration; require token (not email) for ownership.

### MEDIUM

#### 3.8 `decideNextAction` parsed with `includes()` — ambiguous matching
**Files:** `apps/api/src/lib/conversation-orchestrator.ts:398-401`

**Fix:** Use strict `===` after trimming.

#### 3.9 `mapCoreValues` matches by name string — hallucination-prone
**Files:** `apps/api/src/lib/analysis-pipeline.ts:380-389`

**Fix:** Pass value IDs to LLM prompt, have it return IDs directly.

#### 3.10 `mapCoreValues` score not validated as number — NaN written to DB
**Files:** `apps/api/src/lib/analysis-pipeline.ts:383-386`

**Fix:** Add `typeof v.score === "number" && !isNaN(v.score)` to filter.

#### 3.11 No structured logging of LLM token usage
**Files:** `packages/ai-core/src/gateway.ts`

---

## 4. 1:1 WebSocket Sessions

### CRITICAL

#### 4.1 WS route blocked by tenant preHandler — broken in production
**Files:** `apps/api/src/modules/one-on-one/ws.ts:163`, `apps/api/src/server.ts:127`

`tenantPlugin` runs as a global preHandler requiring `x-internal-secret`. Browser WS upgrades never carry this header. WS route is completely broken — all connections rejected with 401.

**Fix:** Register WS routes in a scoped child plugin that excludes `tenantPlugin` preHandler. Derive `orgId` from verified WS token payload.

#### 4.2 `INTERNAL_API_SECRET` used for both server-to-server auth AND WS token signing
**Files:** `apps/api/src/lib/ws-auth.ts:3`, `apps/api/src/lib/tenant-context.ts:36`

If WS token is logged/intercepted, attacker has the server-to-server secret.

**Fix:** Introduce dedicated `WS_TOKEN_SECRET` env var.

### HIGH

#### 4.3 Replaced socket close event clobbers new socket reference
**Files:** `apps/api/src/modules/one-on-one/ws.ts:239-251, 338`

Old socket's async `close` handler sets `room.managerSocket = null`, clobbering the new live socket. Room appears disconnected, triggers premature cleanup, loses edits.

**Fix:** Guard close handler: `if (room.managerSocket === socket) room.managerSocket = null`.

#### 4.4 Employee can overwrite notes via REST PATCH, bypassing WS manager-only restriction
**Files:** `apps/api/src/modules/one-on-one/routes.ts:196`

`PATCH /:id` allows `notes` and `summary` updates for any participant. WS blocks employee edits but REST doesn't.

**Fix:** Enforce field-level authorization in PATCH — restrict notes/summary to manager.

#### 4.5 `ensureRoom` doesn't validate stale room identity
**Files:** `apps/api/src/modules/one-on-one/ws.ts:39-61`

Existing in-memory room returned without checking if `managerId`/`employeeId` still match DB.

**Fix:** Assert identity match, close stale room if mismatch.

#### 4.6 No WS message rate limiting
**Files:** `apps/api/src/server.ts:68-73`, `apps/api/src/modules/one-on-one/ws.ts`

HTTP rate limiter doesn't cover WS messages after upgrade. Unlimited `content_update` floods possible.

**Fix:** Add per-socket message-rate counter (token bucket), close on threshold.

### MEDIUM

#### 4.7 Notes only flushed on 5s timer — up to 5s data loss on crash
#### 4.8 Last-write-wins with no versioning — REST vs WS conflict
#### 4.9 WS `content_update` accepts 500KB vs REST 100KB — inconsistent limits
#### 4.10 WS Redis client ignores username, DB index, and TLS settings
#### 4.11 `persistNotes` creates new DB connection on every call
#### 4.12 `agenda_toggle`/`action_toggle` relay-only — not persisted to DB

### LOW

#### 4.13 WS auth happens post-upgrade — brief resource consumption before rejection
#### 4.14 Room keys not namespaced by `orgId`

---

## 5. Campaigns & Feedback

### CRITICAL

#### 5.1 Campaign state transition TOCTOU race
**Files:** `apps/api/src/modules/campaigns/routes.ts:194-220`

`POST /campaigns/:id/advance` reads status, computes next, writes — two concurrent calls both read same state.

**Fix:** Atomic `UPDATE ... WHERE status = $current RETURNING *`, 409 if nothing updated.

#### 5.2 Duplicate feedback on analysis retry (same as 1.1)

#### 5.3 Duplicate digest emails on retry (same as 1.5)

### HIGH

#### 5.4 Export endpoint unbounded — no LIMIT
**Files:** `apps/api/src/modules/feedback/routes.ts:174-187`

`GET /users/:id/export` loads entire `feedbackEntries` table into memory.

**Fix:** Add `.limit(1000)`, implement pagination, wire up date filters from `exportQuerySchema`.

#### 5.5 Scheduler non-atomic schedule+enqueue (same as 1.3)

#### 5.6 AI-chat history unbounded — grows indefinitely in Redis
**Files:** `apps/api/src/modules/campaigns/routes.ts:251-296`

Full conversation history sent to LLM on every `POST /campaigns/:id/ai-chat`. No cap.

**Fix:** Cap at last 20 messages before LLM call, trim before storing.

#### 5.7 Self-kudos not prevented
**Files:** `apps/api/src/modules/kudos/routes.ts:63-80`

No check that `giverId !== receiverId`. Corrupts leaderboard and engagement scores.

**Fix:** Add `if (body.receiverId === callerId) return reply.code(400).send(...)`.

#### 5.8 Escalation duplicate possible if unique constraint not applied
**Files:** `packages/db/src/schema/tenant.ts:311`, `apps/api/src/lib/analysis-pipeline.ts:136`

Unique index commented out in schema. If migration 0011 doesn't apply it, duplicate escalations created.

**Fix:** Verify migration applied everywhere. Add `ON CONFLICT DO NOTHING` to escalation insert.

### MEDIUM

#### 5.9 Campaign delete ignores active status — orphans in-flight jobs
#### 5.10 Engagement score NaN when `interactionsTarget = 0`
#### 5.11 Leaderboard `week` param not validated — DB error leaked
#### 5.12 `selectReviewSubject` fallback unbounded query
#### 5.13 Prompt injection via admin campaign fields
#### 5.14 Flagged endpoint unbounded for manager path

### LOW

#### 5.15 Questionnaire swap allowed on active campaign
#### 5.16 Schedule entries never marked complete
#### 5.17 Redis key missing `orgId` for campaign chat
#### 5.18 Digest week window misaligned with leaderboard

---

## Summary

| Area | Critical | High | Medium | Low | Total |
|------|----------|------|--------|-----|-------|
| BullMQ / Workers | 3 | 4 | 4 | 3 | 14 |
| Chat Adapters | 3 | 5 | 4 | 3 | 15 |
| AI / LLM | 2 | 5 | 4 | 0 | 11 |
| 1:1 WebSocket | 2 | 4 | 6 | 2 | 14 |
| Campaigns & Feedback | 3 | 5 | 6 | 4 | 18 |
| **Total (deduplicated)** | **~10** | **~18** | **~20** | **~10** | **~58** |

Note: Several findings overlap across areas (e.g., analysis idempotency appears in both BullMQ and Campaigns). Deduplicated unique findings are approximately 58.

## Priority Order

1. **Ship-blocking**: 4.1 (WS route broken), 2.1 (GChat verification broken)
2. **Data integrity**: 1.1 (analysis idempotency), 1.2 (reply drops), 5.1 (campaign race)
3. **Security**: 3.1 (prompt injection), 3.6 (PII leakage), 4.2 (shared secret), 2.4 (Teams JWT bypass)
4. **Reliability**: 1.4 (stall detection), 3.5 (LLM timeouts), 1.10 (shutdown timeout)
5. **Cost control**: 3.4 (token budgets), 3.2 (context overflow)
