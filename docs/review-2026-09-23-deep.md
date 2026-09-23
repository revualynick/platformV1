# Deep review (2026-09-23)

Second pass after the two webhook/job-id criticals were fixed. Scope: API authorisation on every route, web auth and direct-DB pages, the inbound chat path end to end, demo mode, WebSockets, OAuth and token storage, email, injection sinks, migrations.

Verification levels: **Verified** = reproduced or confirmed against library source. **Traced** = followed through the code, not executed. **Plausible** = depends on external behaviour I could not test here.

## Critical

### C3. Chat replies never reach their conversation (Traced)
- Conversation state is stored in Redis under `conv:{conversations.id}` (a UUID), `workers/index.ts` `setConversationState`.
- Inbound replies are enqueued with `conversationId = message.threadId || "${channel}:${user}"` (`modules/chat/routes.ts:49`), then looked up with `getConversationState(data.conversationId)`.
- Nothing maps a platform thread/channel to the conversation UUID, so every real reply hits "No active state" and is dropped. The dev simulator and demo pass the UUID directly, which is why local testing never surfaced it.
- Slack makes it worse: the scheduler stores `channelId = platformUserId` (`U…`), but inbound DMs arrive on the DM channel id (`D…`), so even a channel-keyed lookup would miss.
- There is also no check that the person replying is the conversation's reviewer.
- **Wider than a key mismatch (found in follow-up):** no code path ever writes `user_platform_identities` (seed/bootstrap only delete from it). So the scheduler skips every real user ("no platform identity"), and there is no way to map an inbound platform user to a Revualy user. Outbound addressing also differs by platform: Slack accepts a user id as the DM channel; Google Chat needs a DM space name (`spaces/…`), not a user id; Teams needs a stored conversation reference from a prior inbound activity or install event.
- **Fix direction:** resolve by identity: `platformUserId` → `user_platform_identities` (unique on platform + platformUserId) → userId → latest open conversation for that reviewer on that platform. Store a Redis index `conv-by-user:{platform}:{userId}` → conversation UUID on initiate, delete on close. Test with a webhook-shaped job, not the simulator.

## High

### H1. Deactivated users keep full access (Traced) **FIXED 2026-09-23**
- `POST /users/:id/deactivate` only sets `isActive=false`. It does not delete `auth_sessions`.
- NextAuth `signIn` and `/auth/lookup` never check `isActive`, so a deactivated user can also sign in again.
- `requireAuth` / `requireRole` / `assertCanAccessUser` never check `isActive`.
- A leaver (including an admin) keeps access until they choose to stop. **Fix:** delete sessions on deactivate, reject inactive users in lookup/signIn and in `requireAuth`/`requireRole`.

### H2. Rate limiter treats the whole organisation as one client (Verified against library source) **FIXED 2026-09-23**
- `@fastify/rate-limit` runs `onRequest`; `request.tenant` is set later in `preHandler`, so `keyGenerator` always falls back to `request.ip`.
- Almost all API traffic comes from the Next.js server, so every user shares one 100 req/min bucket, and `/auth/lookup` + `/auth/provision` share 10 req/min across the org. A Monday-morning sign-in rush will fail with AccessDenied.
- **Fix:** key on `x-user-id` read directly from headers (after secret check), or register the limiter with `hook: "preHandler"`; give auth routes a key on the email being looked up.

### H3. Admin pages rely on layout-only role checks while reading the DB directly (Plausible) **FIXED 2026-09-23**
- `(admin)/layout.tsx` redirects non-admins, but pages such as `settings/escalations`, `settings/people`, `settings/access` call `getDb()` queries with no role check of their own.
- Next.js does not guarantee a layout re-runs for a page request during client navigation, and documents that auth checks belong next to data access. A crafted RSC request may render the page segment without the layout's redirect.
- Not reproduced (needs the app running with a DB). **Fix regardless:** a `requireAdminPage()` helper called in each admin page or its data loader.

### H4. Slack bot may process its own messages (Plausible)
- `normalizeInbound` skips events with `subtype` or no `user`, but messages posted by a Slack app bot typically arrive with `bot_id` and can carry a `user`. Once C3 is fixed this risks the bot replying to itself.
- **Fix:** also ignore events with `bot_id`, or where `user` equals the bot's own user id.

### H5. Google Chat verification probably rejects every real event (Plausible) **FIXED 2026-09-23** (pending real-Workspace confirmation of the endpoint-URL issuer)
- `verifyWebhook` compares the `Authorization: Bearer` value, and a body `token`, against a static verification token.
- Google Chat HTTP endpoints send a Google-signed JWT as the bearer (issuer `chat@system.gserviceaccount.com`, audience = project number). A static compare will never match it; the body token is the legacy mechanism.
- **Fix:** verify the JWT against Google's certs (issuer + audience). Confirm against a real Workspace before relying on either path.

## Medium

- **M1. OAuth state not bound to user or time.** **FIXED 2026-09-23.** `integrations/routes.ts` signs `nonce.returnTo` with no userId and no expiry, and the nonce is never checked. An attacker can send a victim a callback link carrying the attacker's code, linking the victim's account to the attacker's Google account. For managers this means attacker-controlled Drive transcripts feed the check-in pipeline. Fix: include userId + expiry in the signed state and compare on callback.
- **M2. Admins can read self-reflection transcripts.** **FIXED 2026-09-23.** `GET /conversations/:id` (admin) returns every message, including `self_reflection` conversations, while the UI promises "only you and your AI coach can see these". Fix: exclude self-reflections from that endpoint, or change the promise.
- **M3. Unsubscribe links are broken.** Emails link to `/settings/notifications`, which does not exist and sits under the admin-only layout; employees' preferences are at `/dashboard/settings`. The `List-Unsubscribe-Post` one-click header is advertised but nothing handles the POST (a Gmail/Yahoo bulk-sender requirement).
- **M4. Demo LLM spend is unbounded in practice.** The 3/day limit is per unverified email, so rotating emails gives unlimited conversations (bounded only by the per-IP limiter). Separately, on real tenants the authenticated `/demo/start` creates genuine conversations and feedback about a real colleague (first active user) that flow into analysis.
- **M5. Reply retries duplicate messages.** `handleReply` inserts the user message before the LLM call; if the call fails, BullMQ retries and inserts it again, so analysis sees duplicated content.
- **M6. `GET /escalations/:id` excludes super_admin** (`role !== "admin"` check). **FIXED 2026-09-23** (also in escalation create/notes, 360 responses, pulse triggers).

## Low

- `/auth/lookup` matches email case-sensitively; `/auth/provision` lowercases. **FIXED 2026-09-23.**
- Flag-alert emails include the verbatim flagged content, so sensitive text leaves the system by email.
- `GET /conversations/:id` does not validate the id as a UUID (Postgres error becomes a 500). **FIXED 2026-09-23.**

## Checked and sound

API route guards (every module has `requireAuth`/`requireRole` or explicit checks), 1:1 session scoping and WS tokens (HMAC, 60 s expiry, session-bound, subprotocol transport), reflection/assessment ownership, token encryption (AES-256-GCM), email HTML escaping, no raw SQL outside a dev script, no committed secrets, migration journal matches files, reviewer identity never reaches the browser.

## Fix log

**Step 1 (2026-09-23), pre-beta security fixes:**
- H1: `requireAuth`/`requireRole` now load the caller (one PK lookup) and reject deactivated or malformed ids; deactivation deletes web sessions in the same transaction; `/auth/lookup` returns `isActive` and matches email case-insensitively; `/auth/provision` refuses deactivated users; NextAuth `signIn` refuses them; dev test-login refuses them.
- H2: rate-limit key is `user:{id}` only when the internal secret is valid, else `ip:`; `TRUST_PROXY` hop count (1 on Railway) so `request.ip` is the real client; auth routes limited per email (provision runs in preHandler so the body is available).
- H3: `lib/page-guards.ts` (`requireAdminPage`, `requireManagerPage`) called at the top of all 23 admin/manager pages. **Not runtime-tested** (typecheck only); the layout-skip scenario is hard to reproduce.
- M1: OAuth state moved to `lib/oauth-state.ts`, bound to user id, 10-minute expiry, returnTo still same-origin only.
- M2: admin conversation list/detail exclude `self_reflection`; ids validated.
- M6: `isAdminRole()` used at five call sites that excluded super_admin.
- Also: test-login open redirect and cookie name/secure flag over HTTPS.
- Tests: `oauth-state.test.ts` (5), `rate-limit-key.test.ts` (3), `security.integration.test.ts` (10, real Postgres, self-skips without a DB). 147 API tests, 16/16 typecheck.

**Step 4 (2026-09-23), Google Chat adapter:**
- H5: bearer verified as Google's signed token (`jose`): project-number mode against chat@system X.509 certs, endpoint-URL mode as a Google OIDC token that must carry email chat@system (verified). Legacy shared token only with `GCHAT_ALLOW_LEGACY_TOKEN=true`. Replay window kept.
- Also fixed: the scheduler sent to `platformUserId` (wrong for Google Chat, which needs the DM space) and did not check reachability or link trust.

## Branch review (main...beta-hardening, 2026-09-23, after step 4)

`/code-review high`, then each finding verified by hand against the code.

| # | Severity | Finding | Verdict |
|---|---|---|---|
| B1 | High | Scheduling pass runs 10:00 UTC; a default 10:00 preference is already past for UTC and everyone east, so sends roll to the next day. Friday runs land on Saturday (quiet-day check uses today, not the send day). `interaction-scheduler.ts` | Confirmed, **fixed** |
| B2 | High | `flag_alert` job data carries decrypted `flaggedContent` + `reason` in Redis (kept up to 1,000/5,000 jobs). Breaks the encryption-at-rest requirement. `analysis-pipeline.ts` | Confirmed, **fixed** |
| B3 | High | Check-in retry loop: permanent failures (`failed`) are re-selected because each failure refreshes `lastAttemptAt`; hourly retry for ever. Attempt ceiling only applies before a transcript exists, so LLM failures retry indefinitely (LLM spend). `check-in-pipeline.ts` | Confirmed, **fixed** |
| B4 | Medium | Self-reflection extraction failure returns `success:false`, worker ignores it, BullMQ never retries: reflection lost on an LLM blip. `analysis-pipeline.ts` | Confirmed, **fixed** |
| B5 | Medium | Nudges: zero-activity users never nudged (no engagement row); engagement target defaults to 3 while the scheduler aims for 2, so fully-engaged users get "1 pending" nudges. `workers/index.ts` | Confirmed (extends earlier finding), **fixed** |
| B6 | Medium | Unique relationship pair makes re-creating a soft-deleted relationship a 500 (three routes). | Confirmed (earlier finding), **fixed** |
| B7 | Medium | `getCompletedThreeSixtyReviews` has no status filter and sorts NULL `completedAt` first; in-progress 360s shown as "Completed" to managers and the employee. `queries/three-sixty.ts` | Confirmed, **fixed** |
| B8 | Low | 360 aggregation's LLM theme extraction is never used (caller omits `llm`); keyword fallback always runs. `three-sixty/routes.ts` | Confirmed, **fixed** |
| B9 | Low | Unmanaged-team gate `assertCanAccessUsers(request, [])` passes for any manager; later per-member check limits the damage to an empty 200. `profiles/routes.ts` | Confirmed, **fixed** |
| B10 | Low | Pipeline upserts the week's self-reflection as completed, so `/reflections/:id/complete` would 409. No UI calls `/start` or `/complete` today. `analysis-pipeline.ts` | Latent, **fixed** |

Dropped by the reviewer as non-correctness: repeated caller lookups in access checks, duplicated team-insights and week-start logic, em-dashes in comments, dev simulator not using `parseBody`.

**Branch review fixes (2026-09-23), all ten:**
- B1: `nextPreferredSendTime` (next occurrence in the user's zone) + quiet day checked on the send day; scheduling pass moved to 04:00 UTC daily. 7 fixed-date tests incl. the Friday to Saturday regression and the October clock change.
- B2: flag alert jobs carry only `escalationId`; the worker reads the encrypted content from Postgres. Nudge jobs also no longer carry names or emails.
- B3: `selectMeetingsToProcess` never re-selects `failed`, recovers rows stuck in `processing` after 1 h, oldest attempt first; attempt counter resets when the transcript is found; `statusAfterFailure` caps transient retries at 5.
- B4: reflection extraction failures throw, so BullMQ retries.
- B5: `selectNudgeTargets` includes people with no activity, uses each person's own weekly target (default 2, matching the scheduler), skips paused and unreachable people; engagement rows store the person's target.
- B6: `upsertRelationship` reactivates a soft-deleted pair (three routes); calendar sync unchanged (never overrides manual).
- B7: completed 360s only, NULLs last.
- B8: 360 completion passes the LLM; also fixed the earlier deep-review note: the LLM call no longer runs inside a transaction (atomic claim to `analyzing`, revert on failure, 409 on a concurrent completion).
- B9: unmanaged-team profiles require an admin role.
- B10: pipeline no longer overwrites a reflection the person completed; `/complete` after the pipeline merges the person's answers (no 409).
- Tests: scheduler-send-time (7), analysis-fixes (4), check-in-retry (4), nudges (2), review-fixes (4). 273 tests total.
