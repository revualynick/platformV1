# C3 implementation plan: chat identity, routing, lifecycle and re-presentation

Status: **in progress** (updated 2026-09-26): steps 0 to 7 done, 8 onwards open (also tracked in `docs/backlog.md`). Approved 2026-09-23. Background: `docs/archive/review-2026-09-23-deep.md` (C3), decisions in `docs/plan.md` ("Decision: chat identity + routing").

## Decisions this plan implements

- One chat platform per tenant. Beta is **Google Chat** (app not yet installed on the beta Workspace).
- Google Chat identity is automatic from the Google account. Slack/Teams linking is admin- **and manager-** driven (managers scoped to their reporting tree).
- Store everything. No inbound message is silently dropped.
- Unanswered conversations become `incomplete` and are analysed as partial.
- Weak or unanswered themes are re-presented later with different wording (**in scope for C3**).

## Principles: secure, fast, robust (Nick, 2026-09-23)

Every phase is judged against these. Proposed targets:

- **Fast:** webhook acknowledged < 300 ms; bot reply p95 < 6 s (mostly LLM time). One LLM call per turn (decision + quality + next question in one structured call, replacing two sequential calls). No artificial delay: turns process immediately and are superseded if a newer message arrives before commit.
- **Secure:** Google Chat JWT verification (H5); routing by sender identity (only the reviewer can answer their conversation); confirmation DM for manual links; manager linking scoped + audited; unrouted messages admin-only, counts not content by default, purged after 30 days; message content encrypted at rest (**requirement**, see Phase E; no feature currently searches text in SQL, so nothing breaks); every LLM output schema-validated before use. **Pre-beta gate:** review findings H1, H2, H3, M1, M2 fixed before any real employee uses it.
- **Robust:** store first, dedupe on platform message id, outbox for sends, Postgres-only state, sweeper for stale/undelivered. **LLM outage fallback:** after retries, ask the next theme's `examplePhrasings` verbatim so the conversation continues. **Observability:** counters for unrouted messages, undelivered sends, incomplete conversations, LLM fallbacks, with alerts on spikes.

## What exists today (the gaps)

1. `user_platform_identities` is never written by app code, so the scheduler skips every real user and inbound senders cannot be mapped to users.
2. Replies are looked up by platform thread/channel id; state is keyed by conversation UUID. Every real reply is dropped.
3. Google Chat adapter only normalises `MESSAGE`; `ADDED_TO_SPACE` (source of the DM space name) is ignored. Token check compares Google's JWT to a static string (H5).
4. Conversation state lives only in Redis (24 h TTL), duplicated from what Postgres already holds. On expiry the DB row stays `in_progress` for ever and is never analysed. Mid-conversation Redis loss silences the bot.
5. `decideNextAction` judges a reply without seeing the question, and no per-theme outcome is recorded.
6. Theme selection is `themes.slice(0, 2|3)` by `sortOrder`: later themes are never asked.
7. Reply handling inserts the user message before the LLM call, so retries duplicate it. Inbound webhooks are not deduplicated by platform message id.
8. Scheduler platform comes from the `SCHEDULER_PLATFORM` env var (default `slack`).

## Milestones

- **M1: Google Chat beta path** (phases 1–5). A Google Chat user can be scheduled, receive a DM, answer, and have late or partial answers stored and analysed.
- **M2: Re-presentation engine** (phase 6).
- **M3: Slack/Teams linking** (phase 7). Not needed for the Google Chat beta, so it goes last.

Phase 8 (testing) runs alongside every phase.

## Execution order (agreed approach, 2026-09-23)

Rules: security and foundations before features; test bed before the logic it tests; start external dependencies early.

0. **Baseline:** commit the existing uncommitted work in logical commits; get local Postgres + Redis running; ask the beta Workspace admin to install the Google Chat app (needed at step 8).
1. **Pre-beta security fixes (S):** review H1, H2, H3, M1, M2, M6.
2. **Encryption foundation, Phase E part 1 (S-M):** format, Drizzle encrypted types, boot-time keys, fail closed, CI crypto benchmark. **DONE 2026-09-23:** v1 format + keyring in `@revualy/shared`, `encryptedText()` column type on all 22 tier-1 columns (new writes encrypted now; old rows read as plaintext until step 7), tokens/config unified on v1 with legacy reads, API + web exit at startup without a key, 19 new tests incl. real-Postgres round trip and CI speed budget. Still to do: tier-2 jsonb columns and backfill (step 7), BullMQ plaintext payloads (step 5, store-then-enqueue), Redis `1on1:content` (step 7).
3. **Schema (S):** migration 0032 (identity, link audit, unrouted messages, single active platform); 0033 (conversation state columns, `turn`, `platform_message_id`, `delivered_at`). **DONE 2026-09-23:** 0032 = identity columns + CHECKs, `identity_link_events`, `inbound_messages` ledger, one-connected-chat-platform partial unique index; 0033 = turn state columns + `turn`, `schedule_entry_id` (idempotent initiation), open-conversation and sweeper indexes, `delivered_at` outbox (existing bot messages backfilled). `platform_message_id` already existed with a per-conversation unique index. Verified: constraints exercised in SQL, all 34 migrations apply to an empty DB, new schema-sync guard selects every table. Deferred: DB-level one-open-conversation-per-reviewer (demo currently reuses one reviewer; revisit in step 5).
4. **Google Chat adapter + harness, phase 2 (M):** JWT (H5), lifecycle events, auto-link, bot filter, signed fixtures. **DONE 2026-09-23:** `verify.ts` (both audience modes, injectable keys), `normalizeEvent` (install/uninstall/message; add-on payloads rejected), bot filter, `findDirectMessage`; `chat-core` gained optional `normalizeEvent`/`findDirectMessage` and `ChatEvent`; `lib/chat-identity.ts` (auto-link by email then Google account id, reachability, audit events, race-safe); webhook replies to installs synchronously with a deterministic welcome; scheduler uses the DM address, requires reachable + trusted link, skips paused users, discovers admin-installed DMs; `getActivePlatform()` replaces the env var (env kept as dev fallback). Harness at `@revualy/chat-adapter-gchat/testing`. 17 adapter + 15 API integration tests. Found and fixed a concurrency bug in auto-linking (test now reproduces it reliably). Welcome text omits help/stop until step 5 implements them.
5. **Routing + turn engine, phase 3 (M-L):** **DONE 2026-09-24** (part 1 committed 2026-09-23).
   - Part 1: migration 0034 `conversation_messages.seq` (always order by seq, never created_at); analysis re-runnable for late additions.
   - Engine (`lib/conversation-orchestrator.ts`): all state in Postgres; idempotent `initiate` on `scheduleEntryId` with `skipIfOpen`; `appendUserMessage` under the row lock; one turn job per message seq; `processTurn` with atomic `turn` claim and in-transaction supersede check; outbox (`deliverOutbox`, `deliveredByCaller` for web callers); `replyInProcess`/`getConversationView` for demo, reflections and simulator.
   - Routing (`lib/inbound-router.ts`): unknown sender -> manual-link yes/no confirmation -> help/stop/start -> open conversation on that platform -> late addition within 7 days (append, re-analyse with a per-message job id, acknowledge) -> paused note -> honest "saved" reply. All fixed text. Effects idempotent, then reply, then mark processed.
   - Webhook stores to `inbound_messages` (encrypted, deduped on platform message id) and queues only `{type:"inbound", inboundId}`; non-DM messages ignored. Worker: `inbound`, `turn`, idempotent `initiate` (marks the schedule entry `sent`/`skipped`), legacy `reply` jobs dropped with a warning. Redis conversation state and lock removed (`getStateRedis` kept for Teams store + campaigns).
   - Demo on the engine (platform `internal`, channel `demo:{leadId}` or `web:{userId}` for ownership). Reflections /start on the engine. Dev simulator goes through `inbound_messages` + `handleInbound` with an `internal` identity. Welcome text mentions help/stop. Transcript reads ordered by seq everywhere.
   - Open conversations are scoped by platform, so an abandoned web demo never captures a chat message or blocks a scheduled check-in. This replaced the deferred DB-level one-open-per-reviewer constraint.
   - Tests: 20 in `conversation-engine.integration.test.ts` (routing matrix, burst, supersede, concurrent turns, outbox retry, duplicate delivery, idempotent initiate, Redis-free run); supersede and atomic-claim tests each shown to fail when their check is removed. 276 API tests, 16/16 typecheck.
   - Not covered: demo, reflections and simulator routes have no route-level tests (they call the tested engine functions); not run against a real LLM or real Workspace. `stop` leaves an open conversation open (step 6 sweeper should mark it incomplete). Scheduler pass itself does not skip open conversations; the initiate job does, at send time, which is when it matters.
   - **Review (2026-09-24), 9 findings, all fixed:** migration 0035 renumbers existing messages by `created_at, id` (0034 used physical order: 12 of 12 local conversations were out of order, now 0); reflections gain `person_edited_at` so a late addition updates AI-completed reflections but only fills blanks in the person's own; a failed step on re-analysis keeps its earlier result (summary, sentiment, value scores); profile signals replaced per entry, not added; a retried closing turn re-queues analysis; Slack/Teams adapters set `isDirectMessage` and the webhook routes only DMs (Slack message id is now `channel:ts`); scheduled initiation re-checks paused/inactive at send time (`scheduled: true`); web demo and reflections use a new `web` platform, separate from the simulator's `internal`; the outbox claims each message with a row lock while sending. 16 new tests; each concurrency/fallback fix shown to fail with its check removed. 292 API tests, 16/16 typecheck, all 36 migrations apply to an empty DB.
   - **Message ordering (decided 2026-09-24):** `seq` (assigned at insert, under the conversation row lock) is the only ordering. `created_at` now uses `clock_timestamp()` (actual write time) for display and audit. `sent_at` stores the chat platform's own send time as evidence, never for ordering: bot messages have no platform time until sent, platform clocks are not ours, and a redelivery keeps its original time. Bot messages use `delivered_at`. Revisit only if messages from several platforms ever need merging into one order.
6. **Lifecycle + speed, phases 4-5 (M):** **DONE 2026-09-26** (defaults agreed with Nick: 24 h inactivity, 1 follow-up per theme, partial shown with a label).
   - Part 1 (b9cdb46): sweeper every 5 min (`lib/conversation-sweeper.ts`): quiet 24 h -> `incomplete` (silent) + partial analysis; re-sends stuck bot messages; re-queues unprocessed inbound, unanswered turns and missing analysis (hourly job ids, 48 h window, per-item isolation). `markIncomplete` bumps `turn` so an in-flight reply loses; "stop" ends an open conversation. Migration 0036 `feedback_entries.is_partial`; partial excluded from engagement averages/counts and calibration; reflections get status `partial`; "Partial" badge on the three feedback views. Caught by tests before shipping: raw SQL Date parameters crash the driver.
   - Part 2: migration 0037 `conversation_theme_outcomes` (one row per selected theme; created when first asked with the question text, encrypted; judged `answered`/`weak`; unreached themes `unanswered` at close or incomplete; `judged_by` llm/fallback). `lib/turn-planner.ts`: one structured LLM call per turn (judges the reply against the question, proposes the action, writes the next question); code enforces the rules (1 follow-up per theme, next theme must exist, message cap closes). Model down or unusable after one retry: judge by length (12+ words = answered), move to the next theme using its first example phrasing. Opening question falls back the same way. Outcome writes share the turn's transaction.
   - **Finding for Nick:** the message caps (4-5 messages, bot and person together) are the binding limit, not the follow-up cap. A self-reflection or peer review gets at most two answers, so any follow-up means the second theme is never asked, and a third theme never is. The outcomes table now makes this visible; step 9 re-asks unanswered themes later. Revisit the caps with beta data.
   - Not verified: the combined prompt has not been run against the real model (no local API key); tests prove the mechanics only.
7. **Encrypt existing data, Phase E part 2 (S):** background backfill, plaintext check, legacy formats removed, rotation script rewritten. **DONE 2026-09-26** (tooling; per-tenant runs pending): `pnpm --filter @revualy/db encryption check|backfill|rotate`, tier-2 jsonb columns encrypted, migration 0042 keeps `updated_at` untouched by maintenance, legacy reads behind `ENCRYPTION_LEGACY_READS` (on until each tenant is backfilled), Redis `1on1:content` encrypted, `docs/key-rotation.md` rewritten.
8. **Beta gate (S + wait):** monitoring counters and alerts, real-Workspace verification checklist, full code review. **Beta can start here.**
9. M2 re-presentation engine (tuned with beta data).
10. M3 Slack/Teams linking.
11. First-review leftovers: nudge query, streak writer, relationship 500s, 360 transaction, month keys.

Working rhythm: one commit per step with tests and a clean typecheck; log entry and plan update after each step.

---

## Phase E: Encryption at rest (M, requirement, lands with phase 1)

Nick, 2026-09-23: messages must be encrypted at rest. Done at the application layer so it protects DB dumps, backups, leaked `DATABASE_URL`s and anyone with SQL access.

**Today:** two incompatible AES-GCM formats (`@revualy/shared`: one base64 blob; `apps/api/src/lib/encryption.ts`: `iv:tag:ct`), only OAuth tokens and integration config are encrypted, and `isEncryptionConfigured()` silently stores tokens as plaintext when `ENCRYPTION_KEY` is missing. BullMQ keeps the last 1,000 completed and 5,000 failed jobs in Redis, and reply jobs carry the message text in plain text.

**Design:**
- **One format, versioned:** `enc:v1:{keyId}:{base64(iv | tag | ciphertext)}`. The prefix distinguishes ciphertext from legacy plaintext (zero-downtime migration) and names the key (rotation without downtime). Both existing formats stay readable until rewritten, then are removed.
- **Transparent at the ORM:** a Drizzle `encryptedText()` / `encryptedJson()` custom column type in `@revualy/db`. Because the API and the web app share the schema, every read and write is covered and no call site can forget. Raw `sql` selects bypass it, so they are banned on these columns (lint/grep check in CI).
- **Bound to its place:** AES-GCM associated data = `table.column`, so ciphertext copied into another column fails to decrypt.
- **Keys:** `ENCRYPTION_KEYS="k2:hex,k1:hex"`; encrypt with the first, decrypt with any. Per-tenant deployments already mean per-tenant keys. Rotation = add key, background re-encrypt, remove old key. `scripts/rotate-encryption-key.ts` rewritten for this.
- **Fail closed:** no plaintext fallback. The API and web refuse to start in production without keys.
- **No plaintext in Redis:** the webhook stores the inbound message (encrypted) in Postgres and enqueues only its id. Also improves robustness (stored before queueing) at a cost of a few ms on the webhook ack.
- **No added delay (Nick, requirement).** Measured with the planned format (prefix + key id + AAD): one bot turn (decrypt 10-message history, encrypt 2) 0.03 ms; dashboard decrypt of 50 x 2 KB rows 0.25 ms; admin export of 1,000 rows 2.6 ms; backfill of 10,000 rows 44 ms (background). Rules that keep it that way:
  - raw 256-bit keys parsed once at boot and held in memory; never a per-request KDF (scrypt/PBKDF2 would cost 50-100 ms)
  - any future KMS unwraps keys once at boot, never per request
  - backfill and rotation run as throttled background jobs with dual-read; no maintenance window (replaces the stop-the-app rotation script)
  - webhook store-then-enqueue moves the DB write from worker to webhook, it does not add one
  - **Budget:** at most 1 ms of crypto per request. A CI benchmark test fails the build if the crypto layer regresses (thresholds ~10x today's numbers to avoid flaky failures).

**Columns (tier 1, required):** `conversation_messages.content`; `feedback_entries.raw_content`, `ai_summary`; new `inbound_unrouted_messages.content`; `escalations.reason`, `description`, `flagged_content`, `resolution`; `escalation_notes`; `self_reflections.highlights`, `challenges`, `goal_for_next_week`; `feedback_value_scores.evidence`; `manager_notes.content`; `one_on_one_sessions.notes`, `summary`; 1:1 agenda/action item text; `goal_update_suggestions.suggested_note`, `evidence_quote`; `goal_updates.note`; `kudos.message`.
**Tier 2 (derived, recommended):** `feedback_digests.data`, `three_sixty_reviews.aggregated_data`, `discovered_themes.sample_evidence`, `calibration_reports.data`, `assessment_sessions.responses`, `profile_development_goals.notes`.
**Stays plaintext:** ids, names, emails, scores, sentiment, dates (needed for login, joins and aggregates).

**Migration:** dual-read ships first; a batched backfill script encrypts existing rows; then a check that no unprefixed values remain.

**Honest limits:**
- Anyone with Railway project access can read both the database URL and the keys, so this does not protect against that. Stronger option later: KMS envelope encryption (keys wrapped by a cloud KMS, unwrapped at boot).
- Losing the key means losing the data for good. The key needs a backup outside Railway (password manager / vault), with a documented restore.
- Plaintext still goes to the LLM provider for analysis. Covered by the provider's data terms, not by this.
- 1:1 live notes sit in Redis (`1on1:content:*`, 24 h) during sessions. Encrypt that value too.

## Phase 1: Active platform + identity schema (S)

- `getActivePlatform(db)`: the single `integrations` row with `status = 'connected'`. Enforce one connected platform on connect. Scheduler uses it; `SCHEDULER_PLATFORM` kept only as a dev fallback.
- Migration 0032, `user_platform_identities`:
  - add `dm_address` (Slack user id / Google Chat `spaces/…` / Teams conversation id), `status` (`linked` | `reachable`), `link_source` (`auto` | `admin` | `manager` | `self`), `linked_by_user_id`, `confirmed_at`, `updated_at`
  - relax `platform_workspace_id` and `display_name` to defaults (Google auto-link may not have them)
- New `identity_link_events` (audit: link, unlink, confirm, reject, who, when).
- ~~New `inbound_unrouted_messages`~~ **Revised in step 3:** a general **`inbound_messages` ledger** instead. The webhook cannot know the conversation, so every inbound message is stored there first (content encrypted, unique on platform + message id), only the row id is queued, and the worker records an `outcome` (`conversation_reply`, `late_addition`, `identity_confirmation`, `keyword`, `paused`, `unknown_sender`, `no_open_conversation`). "Unrouted" = the last two outcomes. Pending rows are the sweeper's re-queue signal. Removes plaintext from Redis by design.
- Scheduler eligibility: identity `reachable` and (`link_source = auto` or `confirmed_at` set) and no open conversation and not paused (see Phase 3 `stop`).

## Phase 2: Google Chat adapter (M)

- **Lifecycle events:** add an optional adapter method `normalizeEvent()` returning `message | installed | uninstalled`. Keeps the 5-method `ChatAdapter` contract intact for platforms that do not need it.
  - `ADDED_TO_SPACE` in a DM → `installed { platformUserId: users/{id}, email, displayName, dmAddress: spaces/… }`
  - `REMOVED_FROM_SPACE` → `uninstalled` (identity drops back to `linked`)
- **Auto-link:** on `installed` or any `MESSAGE`, match the event's user email (case-insensitive) to `users.email`, upsert identity with `link_source = auto`, `status = reachable`, `confirmed_at = now`.
- **Proactive reach before install:** try `spaces.findDirectMessage(name: users/{email})` with app auth for linked-but-unreachable users. **Unverified**: behaviour after a domain-wide admin install must be tested on the real Workspace. Fallback: user stays `linked` until `ADDED_TO_SPACE` arrives.
- **Ignore bot senders** (`user.type === "BOT"`).
- **H5 fix:** verify the bearer as a Google-signed JWT (issuer `chat@system.gserviceaccount.com`, audience from new env `GOOGLE_CHAT_AUDIENCE`, which is the project number or endpoint URL depending on the Chat API "Authentication audience" setting). JWKS injectable for tests. Legacy static token behind an explicit opt-in flag only.

### Google Chat facts (researched 2026-09-23, sources developers.google.com)

- **Project-number audience:** bearer is a JWT, `iss` = `chat@system.gserviceaccount.com`, `aud` = project number, verified with X.509 PEM certs keyed by `kid` from `https://www.googleapis.com/service_accounts/v1/metadata/x509/chat@system.gserviceaccount.com` ([verify-requests-from-chat](https://developers.google.com/workspace/chat/verify-requests-from-chat)).
- **Endpoint-URL audience:** OIDC ID token, `aud` = endpoint URL, `email` = `chat@system.gserviceaccount.com`, `email_verified` = true. The researcher reported `iss` = `chat@system...`; Google's `verifyIdToken` sample implies `iss` = `accounts.google.com` with Google OIDC keys. **Implemented as OIDC; confirm on the real Workspace.**
- Legacy verification token: deprecated; only behind an explicit opt-in flag.
- **Payloads:** Chat API format has a top-level `type` (`ADDED_TO_SPACE`, `MESSAGE`, `REMOVED_FROM_SPACE`) with `user`, `space` (`spaceType` e.g. `DIRECT_MESSAGE`) and `message`. Workspace add-on format nests under `chat.*Payload` with `commonEventObject`; its token details were **not confirmed**, so add-on payloads are rejected with a clear log until verified.
- **`findDirectMessage` with app auth** needs a numeric user id (`users/{id}`), not an email alias; returns 404 if no DM exists. A domain-wide admin install pre-creates DM spaces ([findDirectMessage](https://developers.google.com/workspace/chat/api/reference/rest/v1/spaces/findDirectMessage), [admin overview](https://developers.google.com/workspace/chat/admin-overview)).
- **Sync replies:** an HTTP app may return a Message in the webhook response within 30 s ([receive-respond-interactions](https://developers.google.com/workspace/chat/receive-respond-interactions)).
- **Unconfirmed:** when `user.email` is populated in events; per-user ADDED_TO_SPACE on admin install; that Chat `users/{id}` equals the Google account id (`authAccounts.providerAccountId`). The account-id link is used as a fallback to email and for proactive DM discovery; verify on the real Workspace.

## Phase 3: Inbound routing (M)

- **Webhook** stops computing `conversationId`. It enqueues `{ platform, platformUserId, platformChannelId, platformMessageId, text, truncated }` with `jobId = buildJobId("in", platform, platformMessageId)` (dedupes platform retries).
- **Worker resolution order:**
  1. Identity by `(platform, platformUserId)`. None → store in `inbound_unrouted_messages` (`unknown_sender`), record in unknown-sender queue, reply "I can't match you to a Revualy account yet, please ask your manager". (Google Chat: this means the email is not in Revualy.)
  2. Refresh `dm_address` if the inbound channel differs.
  3. Identity awaiting confirmation (manual links) → treat reply as yes/no confirmation.
  4. Keywords (exact, case-insensitive): `help` → deterministic help text; `stop` → set `users.preferences.chatPaused = true` (scheduler skips), confirm; `start` → resume.
  5. Open conversation for this user → `handleReply`.
  6. No open conversation, but latest conversation `closed`/`incomplete` within 7 days → append as a **late addition**, re-run analysis, acknowledge ("Thanks, I've added that to your feedback on {subject}").
  7. Otherwise → store (`no_open_conversation`), reply honestly ("Thanks, I've saved that. I'll be in touch for your next check-in."). Ad-hoc user-started feedback is a later feature.
- **Every** branch stores the message and increments a counter by reason.
- **Conversation state lives in Postgres only** (revised 2026-09-23). The Redis `conv:{id}` blob is removed; Redis stays for BullMQ only.
  - New columns on `conversations`: `selected_theme_ids`, `current_theme_index`, `phase`, `follow_up_count`, `thread_id`, `last_activity_at`, `turn` (version counter). Everything else is already on the row, and history comes from `conversation_messages`. No duplicate copy to drift.
  - Open conversation for a user = DB query (`reviewer_id`, status open, latest). No Redis index.
- **Turn processing:**
  1. *Store first.* Inbound message saved immediately; `conversation_messages.platform_message_id` (nullable, unique) with `ON CONFLICT DO NOTHING`, so duplicate deliveries and retries cannot duplicate (fixes review M5).
  2. *Process immediately, supersede on bursts* (revised: no fixed delay). Saving enqueues a turn job at once, `jobId = buildJobId("turn", conversationId, turn)`. The job treats all user messages after the last assistant message as one answer. Before committing it re-checks for newer user messages; if any arrived, it discards its draft and re-runs with them, so bursts ("Sam's great" / "especially in standups") still get one bot reply. Cost: one wasted LLM call per burst.
  3. *Claim atomically.* After the LLM call, commit with `UPDATE ... SET turn = turn + 1 WHERE id = ? AND turn = ?`; zero rows means another worker won, so stop. Replaces the Redis conversation lock.
  4. *Catch stragglers.* A message arriving while a turn job is mid-LLM call gets its turn job deduplicated against the running one. So after committing, the job checks for user messages newer than the ones it processed and, if any, schedules the next turn.
  5. *Outbox for sends.* The bot message is stored with `delivered_at = null` in the same transaction, then sent. A failed send is retried without a new LLM call. The sweeper re-sends undelivered messages older than a few minutes.
- Trade-offs: a wasted LLM call when a user sends a burst; a few extra small queries per turn (unmeasured, expected negligible next to the LLM call).
- **Analysis re-run:** feedback entry becomes an upsert on `uq_feedback_entry_conversation`; value scores replaced.
- **Dev simulator** changed to push webhook-shaped jobs through this same path, so it stops hiding routing bugs.

## Phase 4: Lifecycle, `incomplete` (S)

- New conversation status `incomplete`.
- Hourly sweeper (repeatable job): open conversations with `last_activity_at` older than 24 h → `incomplete`, silently (no extra DM), enqueue analysis with `partial = true`.
- `feedback_entries.is_partial`; self-reflections get status `partial`.
- Engagement: partial entries are stored and visible but excluded from `averageQualityScore`, and do not count toward `interactionsCompleted`.
- A late reply to an `incomplete` conversation (Phase 3 step 6) re-opens nothing; it appends and re-analyses.

## Phase 5: Per-theme outcomes (S)

- New `conversation_theme_outcomes`: conversation, theme, reviewer, subject (null for self), interaction type, outcome (`answered` | `weak` | `unanswered`), follow-up count, question text as asked, created at.
- `decideNextAction` rewritten to see the question and the reply, and return `{ action, quality }` as structured output.
- Cap follow-ups per theme (default 1). A still-weak answer moves on and is recorded `weak`, rather than repeating the question until `maxMessages`.
- On close or `incomplete`, themes never reached are recorded `unanswered`.

## Phase 6: Re-presentation engine (M)

- **Theme selection** replaces `slice(0, n)`, in priority order:
  1. themes with a `weak`/`unanswered` outcome for this reviewer (and, for peer review, the same subject) in the last 8 weeks
  2. themes least recently asked of this reviewer
  3. `sortOrder`
- **Re-asking with new wording:** `generateQuestion` receives prior attempts (question text + outcome) and is told to take a different angle (more concrete, example-led, narrower scope) and never repeat earlier phrasing.
- **Verbatim questionnaires:** question wording is fixed, so only the lead-in changes ("Coming back to something from last time…").
- **Badgering guard:** at most 3 re-presentations per theme per reviewer (and subject), then park it for the cycle.
- Record which attempt produced an `answered` outcome, so wording strategies can be compared later.

## Phase 7: Slack/Teams linking (M, after beta)

- Optional adapter method `listDirectory()` (Slack `users.list` + `users:read.email`; Teams Graph users / team roster).
- API (admins: whole org; managers: reporting tree via `assertCanAccessUser`): list identities with status, directory with email-match suggestions, link, unlink, bulk-confirm suggestions, unknown-sender queue with one-click link. Every action writes `identity_link_events`.
- Manual links send an identity-confirmation DM ("Hi, is this {name}?"). No feedback conversation until confirmed; a "no" unlinks and alerts whoever linked it.
- Teams reachability: handle `installationUpdate`/`conversationUpdate` to store the conversation reference and `dm_address`. Admin guidance on app setup policies for org-wide install.
- Slack: bot messages ignored via `bot_id` (review H4).
- UI: chat-status column on Settings > People and Team > Members, linking dialog, admin setup checklist item "N of M people reachable".

## Phase 8: Testing

No Google Chat install yet, so M1 is built and proved locally first.

- **Event fixture harness:** realistic Google Chat payloads (`ADDED_TO_SPACE`, `MESSAGE`, `REMOVED_FROM_SPACE`, bot message) signed with a local test key, posted to `/webhooks/gchat/events`. Outbound captured by an injected fake Chat client.
- **Routing matrix tests:** one per resolution branch in Phase 3, plus duplicate delivery, Redis state loss mid-conversation, and concurrent replies.
- **Unit tests:** sweeper, partial analysis exclusion, outcome recording, theme priority, badgering guard, rewording prompt contents.
- **Real-Workspace checklist** (once installed): JWT audience, email present on events, `ADDED_TO_SPACE` on admin install, `findDirectMessage` with app auth, end-to-end conversation to dashboard.

## Risks and unknowns

- `findDirectMessage` with app auth after admin install is untested. If it fails, users are only reachable after they open the app once.
- Google Chat events only carry email for users in the same domain. External users will show as unknown senders.
- DB-only state adds a few queries per turn. Expected negligible next to LLM latency, not yet measured.
- Supersede-on-burst wastes LLM spend for users who habitually split messages; monitor the rate.
- The re-presentation rules (8-week window, 3 attempts, 1 follow-up) are guesses to tune with real data.
