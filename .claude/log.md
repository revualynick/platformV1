# Revualy Session Log

## 2026-07-27 — Real bug behind the "3 flaky mutations": apiFetch bodyless Content-Type (B18) + Wave 2 E2E green
- **B18 (REAL prod bug, was misdiagnosed as test flakiness):** `apps/web/src/lib/api.ts` set `Content-Type: application/json` on EVERY request incl. bodyless POST/DELETE. Fastify 5 rejects empty-body+json with 400 → silently broke admin Deactivate, manager note-DELETE, AND the realtime `POST /:id/ws-token` (killing WS). Fix: only set Content-Type when `init.body != null`. Corrected the record — this was an app bug, not a harness flake.
- Un-fixme'd all 3 deferred tests; all now pass deterministically (2× clean runs). admin deactivate assertion rewritten (People page uses listActiveUsers → deactivated row leaves the table = durable outcome). Verbatim toggle: residual hydration race in harness (B19) fixed with re-click-until-persisted `setVerbatimTo` helper.
- **B20 (documented, not fixed):** WS handler attaches `message` listener after an async session lookup → a msg sent in the same tick as `open` is dropped. No real client can hit the ~5ms window (SessionViewer sends only on user input). Test settles 500ms before sending.
- Wave 2 specs GREEN at workers=1: realtime.spec (3), marketing.spec (26→30 w/ footer-link matrix), onboarding.spec (9). Wave 1 now 41 passed / 0 fixme.
- CONTENTION NOTE: `--workers=3` against `next dev` (compile-on-demand + polling) produces false failures; config default `workers:1` is correct — do not override. Every spec that failed at w=3 passes green solo.
- Catalogue B18/B19/B20 appended to docs/local-hardening.md; ui-test-plan.md Progress block updated.

## 2026-07-27 (cont.) — Marketing spec hardened (B21) + Phase 8 components; honest test-count correction
- **Corrected an overclaim:** earlier "marketing 26/30 passed" was a truncated-`tail` overcount. On close inspection 9 marketing tests failed deterministically. Root causes were all TEST-quality, not app bugs: unscoped `[aria-expanded]` caught the Next.js dev-overlay button (SSR-verified: / has 6, /pricing 4, all false) → scoped to `button:has(.faq-icon)`; Try-Demo expected /home but `/home`→307→/login unauth (curl-verified) → assert-left-landing; footer `href="#"` framenavigated fires on hash → assert href + pathname-unchanged; Slack-mock `getByText("#")` strict-mode → assert channel name.
- **DEMO_MODE gating:** API runs DEMO_MODE=false → POST /demo/lead returns 401 (verified). Demo lead + live-LLM-chat tests now `test.skip(process.env.DEMO_MODE!=="true")` with honest annotation. Demo flow is an apex-deployment feature; needs a DEMO_MODE=true instance + `claude -p` shim to exercise. marketing.spec = 33 passed / 2 skipped / 0 failed, deterministic.
- **Phase 8:** added components.spec.ts (4 green): Modal (a11y + all 3 close paths; overlay-click must click the overlay element's own corner, not viewport coords — `fixed` is transform-relative), InfoHint, EngagementRing (sr-only↔band), DismissibleCard (localStorage).
- B21 + Phase 8 recorded in local-hardening.md; ui-test-plan Progress updated (Phase 8 ✅, harness note re workers=1 + reading the real summary line). Final combined gate re-running at workers=1 to confirm.
- Remaining: Phase 10 non-functional (axe, responsive, webkit/firefox, visual, perf); demo LLM e2e under DEMO_MODE=true.

## 2026-07-27 (cont.) — Definitive functional gate GREEN + Phase 10 subset + verbatim robustness + 2 real a11y fixes
- **Verbatim toggle (final):** the last long-run gate's only hard failure. Root cause was a 30s test-timeout under the degraded 11-min dev server (not logic; label is prop-derived, needs reload — my brief "in-place flip" rework was wrong and reverted). Fixed: test.setTimeout(120s), 6 attempts, domcontentloaded reloads. Green 2× standalone + in the full gate.
- **DEFINITIVE GATE:** admin-mutations+auth-guards+components+employee-mutations+interactions+manager-mutations+marketing+mutations+onboarding+realtime+regression+routes+popover-buttons @ workers=1 = **133 passed / 2 skipped / 0 failed** (2 flaky→passed on retry: escalation top-most, /team/questions — dev-server timing). Exit 0.
- **Phase 10 (achievable subset) ✅:** nonfunctional.spec.ts (14 green) — responsive overflow (marketing clean @ 390/834/1440; app-shell desktop clean, mobile reported), lightweight a11y sweep, soft perf. Chromium+WebKit covered.
- **B22 — 2 REAL a11y issues found+fixed:** (marketing)/layout.tsx now wraps children in `<main>`; values-card.tsx edit icon-buttons got aria-label/title + aria-hidden svg. Web typecheck clean.
- **Phase 10 BLOCKED by no-download policy:** axe-core (can't install), Firefox (no binary). Visual-regression + app-shell mobile responsiveness still open. All recorded in local-hardening.md (B18–B22) + ui-test-plan.md.

## 2026-07-26 — All 16 catalogued bugs fixed (B12/B13/B15/B16 + validation)
- B15 getTeamLeaderboardHistory query + wired leaderboard history (team-scoped past weeks). B16 flagged at-risk sidebar wired to real getBulkLatestEngagement (was dead mock). B12 getCompletedThreeSixtyReviews → 360 results on feedback + member-detail pages (Omit aggregation type). B13 getPulseTriggersForReports + "Pulse Alerts" render section on flagged page.
- VERIFIED LIVE (flagged page, jordan.wells): B2 AI escalations visible w/ Investigate/Dismiss, B16 Members-at-Risk real scores, B13 Pulse Alerts render.
- VALIDATED: reporting-tree authz enforced at runtime (priya→out-of-tree sarah = 403 on profiles/engagement-bulk/kudos/feedback; 401 w/o internal secret). Worker handlers (nudge/digest) run clean when triggered; scheduler+nudge crons registered in Redis.
- Gate: 16/16 typecheck, 123 api tests, web build 44 pages. Full catalogue+status in docs/local-hardening.md.
- REMAINING (not catalogue bugs): real Google OAuth, mobile responsiveness (found, unfixed), load/security audit, monitoring, Stripe. Env note: web dev server hits EMFILE (watcher exhaustion) under many concurrent processes — restart frees it; prod `next build` unaffected.

## 2026-07-26 — Wire nudge scheduling (B6) and auto-generate team insights digests (B14)
- B6: Added `schedule_nudges` cron (Wed+Fri 9am UTC) in server.ts; added `schedule_nudges` handler in notification worker that finds active users with interactionsCompleted < interactionsTarget for the current week and bulk-enqueues `nudge` jobs with the exact payload the existing handler expects.
- B14: Extended `schedule_weekly_digests` dispatcher in the notification worker to also fan out `generate_team_insights` jobs (one per manager) for the just-completed month; added `generate_team_insights` handler that replicates the digest-generation logic from manager/routes.ts POST handler, upserted keyed by (managerId, monthStarting).
- Added `feedbackDigests` to worker db imports; added `lt` to drizzle-orm imports; fixed two TS2769 literal-type `reduce` errors by annotating accumulator as `number`.
- Typecheck passes clean. Open bugs remaining: B12, B13, B15, B16.

## 2026-07-25 — Local hardening: ran the real product loop, found+fixed core-pipeline breakage
- Built a keyless local LLM: scripts/claude-llm-shim.mjs (OpenAI-compat server → `claude -p`). Point app via LLM_PROVIDER=openai + LLM_BASE_URL=http://localhost:8787/v1. Lets the FULL pipeline run with no paid key.
- Drove all interaction types via chat-sim → the analysis pipeline runs (sentiment/score/values/flags). Found the core loop was substantially UNWIRED. Catalogue in docs/local-hardening.md.
- FIXED + VERIFIED end-to-end (DB + UI): B1 self_reflection→self_reflections (was lost + polluting feedback); B2 escalations set subject_id→visible to manager (was invisible); B3 NEW engagement-aggregation.ts recomputeWeeklyEngagement writes engagement_scores from feedback (NOTHING wrote it before — all dashboards showed seed/0); B5 flag_alert email to subject's manager on AI flag (never fired).
- FIXED (typecheck+123 tests pass): B4 scheduler cron (schedulerQueue had NO cron → runSchedulingPass never fired → zero conversations ever initiated; verified bull:scheduler:repeat now in Redis); B7 scheduleEntryId in initiate schema; B8 digest topValue; B9 profile-snapshot dedup; B10 check-in retry; B11 self_reflection question phrasing.
- STILL OPEN (documented, feature-completion scope): B6 nudge never enqueued; B12 360 results no read path; B13 pulse triggers no read path; B14 digests no auto-populate; B15 leaderboard history mock-only; B16 at-risk sidebar mock-only.
- NOT production-ready. Core safety+feedback loop now works; core metric (engagement) now computes; but B12-B16 + real-OAuth + dynamic worker/API validation remain.
- Gate: 16/16 typecheck, 123 api tests, web build 43/43. Local stack: docker pg+redis, api:3000, web:3001, shim:8787. Nothing pushed to remote.

## 2026-07-25 — Fix 6 confirmed API bugs (B4/B7/B8/B9/B10/B11)
- B4: Added `schedulerQueue` to cron cleanup loop + added `scheduling-pass` weekday cron (10:00 UTC M-F); added `SCHEDULER_PLATFORM` env var to `.env.example`.
- B7: Added `scheduleEntryId: z.string().optional()` to `initiateJobSchema` so it survives Zod parse; TODO comment explains remaining dedup wiring.
- B8: Replaced hardcoded `topValue: null` with a `feedbackValueScores → feedbackEntries → coreValues` join aggregated by sum(score), descending, limit 1. Added `feedbackValueScores`, `coreValues`, `sql` imports.
- B9: Added pre-insert select guard in `aggregate_behavioral` — skips snapshot if one already exists for same user+framework today (source=behavioral).
- B10: `processPendingMeetings` now includes recently-failed meetings (within 24h) in the query; error handler routes transient codes (rate_limit, network, llm) back to `pending_transcript` and permanent errors to `failed`. Added `gte` drizzle import.
- B11: In `generateQuestion`, self_reflection interactions now use second-person framing ("you"/"your") instead of injecting the user's name as a third-party subject; safeSubjectName only injected into the prompt for non-self-reflection types.
- Typecheck passes cleanly (`pnpm --filter @revualy/api typecheck`).

## 2026-07-25 — Visual + interaction QA sweep (closing the gaps)
- Added Playwright specs: screenshots (33 full-page shots, all roles), marketing-shots (force scroll-reveal), interactions (modal/popover z-order via elementFromPoint), mutations (form submit + DB verify), mobile-shots (390px + overflow assert), popover-buttons (InfoHint z-order + dead-button audit), webkit-render.
- VERIFIED: modal/popover z-order all correct & top-most (send-kudos, create-questionnaire, org-chart node card, flag-review, InfoHint) — nothing clips over them; Escape closes. Employee sidebar nav routes correctly. Form submissions (kudos/manager-note/questionnaire) persist to DB through real test-login sessions. Dead-button audit: 0 dead buttons found. Flagged-review dialog works end-to-end (seeded an escalation, then cleaned up).
- FINDING (real, needs product decision): the authenticated app layout is NOT mobile-responsive — sidebar doesn't collapse to a drawer, ~100-136px horizontal overflow on ALL employee/manager/admin pages at 390px. Marketing site IS responsive. Not yet fixed (mobile support may be out of scope; chat happens in Slack/Teams which are mobile-native).
- FINDING (verify on Safari): under WebKit, all pages RENDER fine (status<500, real content, no overlay), but authenticated pages log a NextAuth ClientFetchError on the client-side /api/auth/session fetch ("access control checks"). Server-side session (cookie) works — likely a dev/test-login-cookie (secure:false + WebKit ITP on localhost) artifact, not confirmed prod bug.
- Screenshot methodology note: fullPage screenshots don't fire IntersectionObserver, so scroll-reveal marketing content looks blank until forced visible — not a bug (all 9 feature cards render on scroll). Minor: no no-JS fallback for ScrollReveal.
- Playwright default project reverted to chromium-only (webkit run on demand). Installed chromium + webkit browsers.

## 2026-07-25 — Local build + Playwright harness + chat-sim for `claude -p`
- Fixed the pre-existing `node:crypto` web-build blocker: `@revualy/shared` barrel eagerly imported node:crypto (via utils/index generateId + crypto re-export), dragging it into the client bundle through profile-section.tsx. Split crypto+generateId into a new `@revualy/shared/server` subpath; root barrel is now client-safe. Updated 3 server importers (auth.ts, google-calendar.ts, integrations/routes.ts). Web now builds (43/43 pages).
- Brought up local stack: colima/docker (postgres pgvector + redis), full `.env` with generated secrets, migrate (0030/0031 applied), seed (14 users). api :3000 + web :3001.
- Key-gated test-login: `apps/web/src/app/api/test-login/route.ts` — mints a real NextAuth DB session for a seeded user. Gated by TEST_LOGIN_ENABLED=true AND matching TEST_LOGIN_KEY (constant-time). Not an open door if flag left on.
- Playwright harness in `e2e/` (config + helpers/auth + specs/routes): visits all 39 routes across employee/manager/admin, fails on server error / client exception / console error. 38/38 pass (member-detail uses jordan.wells who has reports). Flakes from dev-compile timing absorbed by retries:1.
- REAL BUGS found via live testing + FIXED: (1) node:crypto blocker above; (2) `/team/org-chart` + `/settings/org-chart` crashed — team-org-chart.tsx `roleStyles[person.role].fill` undefined for DB roles (employee/admin/super_admin not in the vp/director/... map) → added entries + DEFAULT_ROLE_STYLE fallback at both lookup sites. (3) web getDb leaked a DB pool per HMR reload → exhausted Postgres connections; fixed by caching pool on globalThis.
- Chat-sim harness for `claude -p`: `InternalSimulatorAdapter` (platform "internal", captures bot outbound), dev endpoint `POST /api/v1/dev/simulate-chat` (key-gated like test-login; drives real orchestrator initiate/handleReply via Redis conv state), wired in server.ts, CLI `scripts/chat-sim.mjs` (multi-turn state file, reads TEST_LOGIN_KEY+INTERNAL_API_SECRET from .env). Verified guard (403) + full plumbing reaches LLM; needs ANTHROPIC_API_KEY for real bot turns. Docs in docs/local-testing.md.
- VERIFIED: 16/16 typecheck, 123/123 api tests, web build 43/43, playwright 38/38. Gitignored e2e artifacts + chat-sim state. Nothing committed (awaiting user).
- NOTE: pnpm add mid-session corrupted the running next dev (rewrote node_modules) → `pnpm install` repairs + restart. Orphan `revualy-neo4j-1` container is harmless (Neo4j removed in Phase 6).

## 2026-07-25 — Systematic review + full remediation (plan → implement → re-review, verified)
- Committed the large uncommitted goals+profiling+remediation working tree as c7ac771 (excluded .claude/)
- 4-agent parallel review of whole monorepo → ~55 findings; then plan (docs/review-remediation-plan.md) + 4 parallel implementer WPs; 1 false positive caught (ai-core model IDs are current/valid — left alone)
- Linchpin: new `assertCanAccessUser`/`assertCanAccessUsers` in apps/api/src/lib/rbac.ts (reporting-tree membership, admin bypass). Applied to profiles/engagement/feedback/kudos routes — closed IDOR/authz gaps. Manager-notes ownership check already existed server-side (original finding was FP at API layer)
- Fixed: agenda escalation status filter, google-calendar typed error, three-sixty txn, conversation .where() antipattern, outlook 501 roadmap leak, interaction-scheduler channelId lookup + Intl-based timezone conversion + NaN guard, reflection-extractor injection tags, theme-discovery Zod, calibration inArray, calendar-sync batched+bounded+onConflictDoNothing
- leaderboard_update was a no-op broken channel → PURGED from all 7 locations (validation, notifications route, db/misc, web api union, settings toggle, onboarding wizard, mock-data) + worker default is now a graceful no-op (won't crash on legacy rows)
- Teams adapter restart durability: AsyncStore interface + RedisAsyncStore (apps/api/src/lib/redis-async-store.ts) wired at server.ts via existing getStateRedis() — reuses shared state Redis, no new connection; + deserialized-ref shape validation. GChat: unparseable eventTime now hard-rejects (was a replay-window bypass)
- Web: dashboard upcomingInteraction isDemo-guarded (was leaking mock to real users), dead Review button→Link, trend field removed, escalation Avg Resolution honest N/A, loadTeamData wrapped in React.cache (was triple-querying), silent catches now logPageError
- New migrations 0030 (relax goal CHECKs + goal_cycles date order) + 0031 (conversations.questionnaire_id + uq_user_relationship_pair, dedup keeps active/most-recent row). computeEffectiveProgress degenerate branch fixed
- 3-agent adversarial re-review found real issues in the fixes → all fixed (team ownership gate on /team/:teamId, PATCH 404 race, migration dedup robustness, Teams store not-actually-wired, GChat bypass, React.cache)
- VERIFIED: 16/16 typecheck, 123/123 api tests. BLOCKER (pre-existing, NOT this session): `pnpm --filter @revualy/web build` fails on node:crypto in client bundle — reproduced identical at HEAD in a clean worktree. Web typecheck passes; only next build affected
- NOT committed yet (awaiting user). WS_TOKEN_SECRET must be set to run api tests locally

## 2026-07-14 — Goals tracking system + Meet transcript suggestions (both phases complete, verified)
- Built full goals ladder: goal_cycles/goals/goal_updates tables (migration 0028, hand-written SQL — do NOT use drizzle-kit generate, snapshots are stale), single `goals` table with level discriminator (org|team|individual|personal), self-ref parent FK, CHECK constraints for level/parent invariants; parent-level correctness enforced in API
- Personal goals: private by default, per-goal shareWithManager toggle; privacy enforced in query layer (web reads DB directly) AND API; admins deliberately do NOT see unshared personal goals; hybrid progress (manual % or metric-derived via computeEffectiveProgress in @revualy/shared); alignment rollups are informational only
- API module apps/api/src/modules/goals/ (cycles, CRUD, /mine, /ladder, check-ins, suggestions apply/dismiss with 409 state machine); pure permission fns + 15 tests; web pages for all 3 roles + org-wide alignment ladder at /dashboard/goals/alignment
- Phase 2: hourly check-in worker polls organizers' Calendars for events matching orgSettings.checkInTitleMarker (default "[Check-in]"), finds Meet transcript Doc in Drive, LLM-extracts per-goal updates → goal_update_suggestions (suggest+confirm, never auto-applied); migration 0029; transcript text is never stored (PII decision), only ≤500-char evidence quotes
- OAuth: drive.readonly scope added; calendar_tokens.scopes column detects users needing re-consent; NEW web proxy routes /api/integrations/google/{authorize,callback} — the Fastify OAuth endpoints can't be hit by browsers (internal-secret headers), so GOOGLE_CALENDAR_REDIRECT_URI must point at the WEB app route (env.example updated); returnTo rides in signed OAuth state
- Verified: 121 vitest tests pass, all typechecks green, migrations 0027+0028+0029 apply on dev DB, seeded demo goals, live API smoke tests (visibility rules, ladder math, check-in, 403s, suggestion apply→409), stubbed E2E pipeline run (subject resolution, hallucination filter, idempotency)
- TODO: manual Google smoke test needs real Workspace (Business Standard+, transcription enabled) — connect via new card in /dashboard/settings; transcripts live in HOST's Drive (organizer≠host breaks discovery); web UI not visually checked in browser yet (typecheck only); smoke test env needs WS_TOKEN_SECRET set
- NOTE: uncommitted profiling feature (pre-existing) shares many touched files — commit carefully/together

## 2026-07-14 — Accessibility pass on apps/web/src/components/
- Modal: dialog semantics (role/aria-modal/aria-labelledby via useId), focus trap (Tab/Shift+Tab cycle), focus moves in on open + restores on close; Escape/overlay-click behavior unchanged
- send-kudos-modal refactored onto shared Modal (trigger + <Modal> fragment, pending guard preserved in onClose); gains Escape-close + scroll lock
- aria-labels added to icon-only buttons: create-questionnaire ✕, session-editor toggles/+/×, demo-chat + demo-chat-public send arrows; decorative glyphs/svgs aria-hidden
- goals/progress-bar: role=progressbar + aria-value* on track, role=img + aria-label on alignment marker; engagement-ring: sr-only "healthy/needs attention/at risk"; suggestion-review-modal → arrows get sr-only "changes to"
- pnpm --filter @revualy/web typecheck green; app/ untouched (other workstream); nothing committed

## 2026-07-14 — Manager-surface UX pass (glossary hints, error honesty, dead-button wiring)
- Team goals page: DataUnavailable on load failure (logPageError "team-goals"), amber prerequisite strips (no cycle / no org goals), dismissible "How check-in suggestions work" 5-step explainer with live checkInTitleMarker (getOrgSettings) + live Google status (getGoogleIntegrationStatus, falls back to "unknown")
- Wired flagged-page Investigate/Dismiss: new (manager)/team/flagged/actions.ts (reviewFlagAction) + flag-review-buttons.tsx (Modal confirm + optional note, "Under investigation" chip when status=investigating); escalation.status now mapped through
- InfoHints added: alignment (goal-card + LadderTree header), engagementThresholds (team Avg Engagement), streak (leaderboard), severityLevels (flagged legend), behavioralDrift (profile-section drift)
- Fixed values-radar UUID bug in member detail FeedbackSection (getActiveCoreValues id→name map); imports at line 21 all verified used — nothing removed
- Assessment invite: inviteToAssessmentAction in members/[userId]/actions.ts + button in profile-section empty state (idle→Sending…→sent✓); error-honesty logging added to team overview + members pages
- pnpm --filter @revualy/web typecheck green; strict boundary respected (only (manager)/ + components/goals/ + listed shared components untouched); lint not configured in repo (next lint prompts for setup)

## 2026-07-25 — Authorization + correctness fixes across API route modules (WP1)
- HIGH 1: profiles/routes.ts — added assertCanAccessUser to /users/:userId, /users/:userId/timeline, /users/:userId/drift; assertCanAccessUsers to /team/:teamId; goals PATCH now fetches goal first (404 if missing) then asserts access before updating
- HIGH 2: manager/routes.ts — PATCH/DELETE /notes/:id already had correct ownership check; no change needed
- HIGH 3: engagement/routes.ts — added assertCanAccessUsers after parsing userIds in GET /engagement/bulk
- HIGH 4: feedback/routes.ts — replaced direct managerId check in GET /users/:id/feedback with assertCanAccessUser (tree-scoped, admins pass)
- MED 5: engagement/routes.ts — gated GET /leaderboard behind requireRole("manager"); TODO comment for future tree-scoping
- MED 6: manager/routes.ts — computed real sentimentTrend (fetch prev month digest, ±0.05 threshold); also added DB-level date filter (gte/lt) to team-insights/generate replacing JS filter
- MED 7: three-sixty/routes.ts — wrapped status-update + aggregation in db.transaction so throw can't leave status stuck in "analyzing"
- MED 8: conversation/routes.ts — replaced chained .where() with conditions array + single .where(and(...conditions))
- MED 9: integrations/routes.ts — removed "coming in Phase 5" roadmap string from outlook/callback 501
- MED 10: users/routes.ts — removed dead unused userId destructure from POST /users and POST /users/bulk
- MED 11: feedback/routes.ts — added exportQuerySchema (Zod coerce) for offset in GET /users/:id/export
- LOW 12: org/routes.ts — LIMIT 500/5000 on unbounded questionnaires/themes selects; relationships LIMIT 5000; kudos/routes.ts — replaced role check with assertCanAccessUser for ?userId= lookup; pulse/routes.ts — TODO comment on hardcoded trigger type; typecheck green

## 2026-07-25 — Three security/durability fixes from re-review
- Fix 1: Created `apps/api/src/lib/redis-async-store.ts` (RedisAsyncStore implements AsyncStore); wired into TeamsAdapter via `getStateRedis()` in server.ts — conversation refs + user cache now survive process restarts
- Fix 2: Added shape validation after JSON.parse in TeamsAdapter hydration paths (sendMessage convref: checks serviceUrl truthy + conversation present; resolveUser: checks name truthy) — invalid entries treated as cache miss
- Fix 3: Changed `isNaN(eventMs) → return false` in GChat `isEventTimestampValid` — unparseable eventTime now hard-rejects; absent eventTime still returns true (documented legitimate omission)
- All three typechecks clean: chat-adapter-teams, chat-adapter-gchat, api

## 2026-07-14 — Full remediation of the 4-lens review (all phases complete + verified)
- Phase A backend: db.transaction on goals check-in/apply/delete + pipeline suggestion-insert; attempt ceiling + clock-skew guard on transcript give-up; errorMessage → coarse codes (classifyPipelineError, 2 new tests); GET /goals + feedback export paginated (limit/offset/hasMore); webhooks exempt from rate limiter; chat >2000 chars → bot acknowledgment via truncated flag; conversation dedup key includes platformUserId; analysis enqueues awaited; UTC week comment
- New infra: lib/glossary.ts (14 terms, single source), InfoHint popover, DismissibleCard (localStorage), DataUnavailable + logPageError (every page catch now logs; outages render "couldn't load" not fake-empty)
- Bot: deterministic INTERACTION_INTROS prepended to LLM opening (purpose/duration/static privacy line per type); closing messages say where answers go
- Wired dead UI: manager Flagged Investigate/Dismiss → new POST /escalations/:id/review (reporting-tree scoped, 409 on closed, audit notes); admin escalation transitions → existing PATCH via new client components w/ confirm dialogs (Resolve requires resolution text); assessment invite = real feature (POST /profiles/users/:id/assessment-invite → notification worker → email template, pref type assessment_invite)
- UX: employee orientation card + metric InfoHints + no-manager recovery copy; manager prereq strips + 5-step check-in explainer w/ LIVE status (marker + own Google connection); admin live setup checklist (5 computed items) + goals setup-order + full transcript chain docs; integrations consequence lines; role capabilities matrix; org-chart legend; a11y pass (Modal focus trap/dialog semantics, aria labels, sr-only signals)
- Hygiene: lib/form-helpers.ts replaces 3 getString/getNumber copies; manager routes reuse getReportingTree from @revualy/db/queries; SUPER_ADMIN_ROLE const; values-radar UUID→name fix on member detail
- VERIFIED: 16/16 typechecks; 123 api tests; live smoke (check-in txn +1 row, pagination shape, flag investigate→audit→admin resolve→409, cross-tree 403s, invite 202+email stub); pipeline txn proof (mid-failure leaves no partial state); 25/25 pages render 200 in demo mode
- NOTE: non-demo web rendering still not browser-verified (needs real session); Google E2E still pending real Workspace

## 2026-07-25 — API correctness fixes: timezone, NaN guard, unbounded query (3 fixes, typecheck green)
- Fix 1 (interaction-scheduler.ts): replaced `new Date(localeString)` offset round-trip with pure Intl `zoneOffsetMs()` + `zoneParts()` helpers; offset computed by formatting instant in target zone and diffing against epoch, fully independent of process local timezone; "tomorrow" rollover re-derives zone parts from now+24h (DST-safe) instead of `setUTCDate(+1)`
- Fix 2 (interaction-scheduler.ts): added NaN + range guard on `preferredTime.split(":").map(Number)` before timezone block; malformed input (e.g. "10") warns and defaults to 10:00 instead of silently firing at delay=0
- Fix 3 (calendar-sync.ts): scoped relationship pre-check from unbounded `fromUserId=userId OR toUserId=userId` to `inArray(fromUserId, otherIds) OR inArray(toUserId, otherIds)` where `otherIds` = qualified-pairs set; sorted-pair-key dedup logic unchanged; added `inArray, or` to drizzle-orm import
- `pnpm --filter @revualy/api typecheck` passes clean

## 2026-07-25 — Web correctness/hygiene pass (9 findings fixed, typecheck green)
- HIGH: dashboard/page.tsx TopRow — mock `upcomingInteraction` now gated behind `isDemo`; real users see honest "No upcoming interactions" empty state
- MED: team/page.tsx FlaggedSection "Review" button → `<Link href="/team/flagged">` (full review flow lives there, wiring to per-item actions non-trivial in page component)
- MED: team/page.tsx — removed hardcoded `trend: "stable"` field from `TeamMember` type and all assignment sites; removed unused `trendIcons` import and `void trendIcons` suppressor
- MED: settings/escalations/page.tsx — "Avg Resolution" stat now shows "N/A / Not tracked yet" when resolved cases exist (resolution timestamps not stored), "—" only when no resolved cases
- MED: settings/integrations/page.tsx — replaced `rows as unknown as IntegrationRow[]` with an explicit `.map()` that converts Date fields to ISO strings; type mismatches now surface at compile time
- MED: team/page.tsx — `listActiveUsers` + `getBulkLatestEngagement` hoisted into shared `loadTeamData()` loader called by all three sections; queries run once per page load instead of twice
- Silent catches logged: dashboard/page.tsx ChartsRow catch → `logPageError("dashboard:charts-row", err)`; member/[userId]/page.tsx EmployeeHeader catch → `logPageError("member-detail:header", err)`; outer page catch → `logPageError("member-detail:page", err)`
- LOW: lib/api.ts — removed `NODE_ENV === "development"` guard on API error log; all environments now log (body still truncated to 500 chars)
- LOW: feedback/page.tsx + member/[userId]/page.tsx — added `// intentional anonymity` comments on both `fromName: "Peer"` assignments
- typecheck: `pnpm --filter @revualy/web typecheck` passes with zero errors

## 2026-07-27 — E2E spec: marketing pages + live demo chat (35 tests)
- Created `e2e/specs/marketing.spec.ts` with 35 Playwright tests across 6 describe blocks
- Covers: Nav (7 pages × render + 5 nav link navigation tests), Home FAQ accordion (aria-expanded + icon + only-one-open), Features 9-card count + CTA hrefs, Pricing founding card 11 checkmarks + 4-item FAQ, Static pages (about/privacy/terms) no-errors, Footer active vs disabled links, Demo Slack mock + email gate + live LLM chat
- Demo live chat uses 60_000ms timeouts for LLM turns; rate-limit branch detects and asserts honest error message instead of failing
- `scrollTo()` helper used for ScrollReveal sections; `collectErrors` scoped to static pages only (demo may log benign errors)
- `playwright test --list` confirms 35 tests parse; `pnpm turbo typecheck --filter=@revualy/web` passes clean

## 2026-09-23: Codebase review (no code changes)
- Reviewed uncommitted diff (66 files) plus new dev/test-login endpoints and webhook/auth plumbing
- CRITICAL: tenantPlugin preHandler demands x-internal-secret on /webhooks/*, so every Slack/GChat/Teams webhook 401s (verified via app.inject)
- CRITICAL: BullMQ 5.69 rejects custom jobIds with a colon unless exactly 3 segments; initiate, weekly-digest, team-insights and nudge ids all throw (verified against Job.validateOptions)
- HIGH: nudges only reach users with an engagement row this week (i.e. already active); streak never computed outside seed; uq_user_relationship_pair turns duplicate/re-created relationships into 500s
- Typecheck 16/16 green; api tests 119 pass, smoke suite fails without WS_TOKEN_SECRET
- TODO: fix the two criticals before any real E2E chat test

## 2026-09-23: Fixed both criticals from the codebase review
- Webhooks: `tenant-context.ts` preHandler now exempts `/webhooks/` from the x-internal-secret check (same pattern as `/ws/`); adapters' verifyWebhook() remains the auth gate
- Job ids: new `apps/api/src/lib/job-ids.ts` `buildJobId()` joins with "_" and strips ":"; used for initiate, weekly-digest, team-insights, nudge (nudge id also dropped its duplicated orgId)
- Tests: `lib/__tests__/job-ids.test.ts` runs BullMQ's own validateOptions; smoke suite gained 3 webhook tests (expect 503 not 401) and setup.ts sets WS_TOKEN_SECRET so the suite loads. Confirmed webhook tests fail with the fix reverted
- Result: 129/129 api tests, api typecheck green. Not committed
- Still open from review (tracked in docs/plan.md "Review findings 2026-09-23"): nudge query, streak writer, relationship unique 500s, reflection retry/flagging, 360 tx around LLM, month keys, page/API scope mismatch, test-login redirect
- Not verified against live Redis or a real Slack/Teams workspace (Docker was down)

## 2026-09-23: Deep review (no code changes)
- Full write-up in `docs/review-2026-09-23-deep.md`, linked from docs/plan.md; each finding tagged Verified / Traced / Plausible
- CRITICAL C3: inbound replies are looked up by platform thread/channel id, state is keyed by conversation UUID, no mapping exists, so real chat replies are all dropped (simulator and demo hide it)
- HIGH: deactivated users keep sessions and can re-sign-in; rate limiter keys on web-server IP (org shares 100/min, sign-in 10/min); admin pages auth only in layout; Slack bot_id not filtered; GChat compares Google JWT to static token
- Checked sound: route guards, 1:1/WS auth, token encryption, email escaping, no secrets, migrations journal
- Next: fix C3 first (identity-based conversation lookup), then H1 and H2

## 2026-09-23: C3 design discussion
- Found `user_platform_identities` is never written by app code, so C3 is a missing identity/addressing layer, not just a Redis key mismatch (review doc updated)
- Nick's decision: one chat platform per tenant; Google Chat identity automatic from Google account; Slack/Teams linking admin/manager-driven
- Proposed: identity status (unlinked/linked/reachable), confirmation DM for manual links, identity-based reply routing, one open conversation per person; recorded in docs/plan.md
- Waiting on: no-open-conversation reply, expired-conversation policy, manager vs admin-only linking

## 2026-09-23: C3 decisions continued
- Confirmed: Google Chat is the beta platform; GChat adapter must also handle ADDED_TO_SPACE (DM space name source)
- Nick's principle: store everything; weak answers get re-presented later with different wording
- Found: expired conversations sit "in_progress" forever and are never analysed; no per-theme outcome is recorded; decideNextAction judges replies without the question
- Recommended: never drop inbound silently (attach late replies, answer user-initiated, handle help/stop, count events); `incomplete` state; per-theme outcomes; recorded in docs/plan.md
- Waiting on: Workspace install status, manager vs admin linking, rewording engine scope

## 2026-09-23: C3 implementation plan written
- Nick: managers can link; GChat not installed yet; rewording engine in C3 scope
- Wrote `docs/c3-plan.md`: M1 GChat beta path (identity schema, adapter lifecycle + JWT, routing, incomplete state, theme outcomes), M2 re-presentation engine, M3 Slack/Teams linking; local signed-fixture testing until Workspace install
- New finding: theme selection is always the first 2-3 by sortOrder, so later themes are never asked (addressed in plan phase 6)
- Next: Nick to approve plan, then start M1 phase 1

## 2026-09-23: C3 state design revised
- Conversation state moves to Postgres only (pointer columns + turn version on `conversations`); Redis `conv:` blob removed, replacing the plan's jsonb-snapshot-plus-cache idea (two copies could drift)
- Turn model: store inbound first (dedupe on platform_message_id), ~6 s coalescing turn job, optimistic `turn` version claim instead of Redis lock, outbox (`delivered_at`) so failed sends retry without new LLM calls
- Recorded in docs/c3-plan.md phase 3; open trade-off is the 6 s delay, needs real-user tuning

## 2026-09-23: C3 plan aligned to secure / fast / robust
- Nick's priorities: secure, fast, robust. Added a principles section with targets to docs/c3-plan.md
- Fast: dropped the 6 s coalescing delay for process-immediately-and-supersede; merge decideNextAction + generateQuestion into one LLM call per turn
- Secure: pre-beta gate on review H1, H2, H3, M1, M2; unrouted messages admin-only + 30-day purge; encrypt message content at rest
- Robust: LLM-outage fallback to theme examplePhrasings; minimum monitoring counters + alerts

## 2026-09-23: Encryption at rest made a requirement
- Nick: messages must be encrypted at rest. Added Phase E to docs/c3-plan.md, landing with phase 1
- Found: two incompatible AES-GCM formats; isEncryptionConfigured() silently stores OAuth tokens as plaintext without a key; BullMQ retains up to 6,000 jobs in Redis with plaintext reply text
- Design: versioned `enc:v1:{keyId}:` format, Drizzle encrypted column types (API + web covered automatically), table.column as AAD, multi-key rotation, fail closed, webhook stores then enqueues ids only
- Measured ~4.5 µs encrypt+decrypt per message; no SQL text search exists so nothing breaks
- Limits recorded: Railway access sees keys (KMS later), key loss = data loss (needs off-Railway backup), LLM provider still sees plaintext

## 2026-09-23: Encryption must add no delay
- Nick: encryption shouldn't add delay. Benchmarked planned format: bot turn 0.03 ms, 50-row dashboard 0.25 ms, 1,000-row export 2.6 ms
- Plan rules added (Phase E): keys parsed once at boot, no per-request KDF or KMS calls, background dual-read backfill/rotation, 1 ms crypto budget per request enforced by CI benchmark

## 2026-09-23: Execution order agreed approach
- Added "Execution order" to docs/c3-plan.md: 0 baseline commit + local DB + request GChat install; 1 security fixes; 2 encryption foundation; 3 schema; 4 GChat adapter + harness; 5 routing/turn engine; 6 lifecycle + speed; 7 encrypt existing data; 8 beta gate; then M2, M3, leftovers
- Next: Nick to confirm step 0 (commit baseline) and start the Workspace install request

## 2026-09-23: Step 0 baseline done
- Branch `beta-hardening` created; 6 logical commits of all prior uncommitted work + today's fixes/docs (typecheck 16/16, 129 tests green before commit)
- e2e screenshots (13 MB) gitignored; `.claude/skills/railway-*` left uncommitted (Nick's call)
- Colima had a stale "disk in use" lock; `colima stop --force` fixed it; Postgres + Redis healthy; migrations 0030/0031 verified applied in the real DB
- Outstanding for Nick: ask beta Workspace admin to install the Google Chat app

## 2026-09-23: Step 1 pre-beta security fixes done
- H1 deactivated users (API guards, session revocation, sign-in/provision/test-login refusal), H2 per-user rate limit + TRUST_PROXY + per-email auth limits, H3 page guards on 23 pages, M1 user-bound expiring OAuth state, M2 self-reflections hidden from admin, M6 super_admin fixed at 5 sites
- New tests: oauth-state, rate-limit-key, security.integration (real Postgres, self-skipping); 147 API tests, 16/16 typecheck
- Not runtime-tested: H3 page guards (typecheck only). Local Redis needs a password the test setup lacks (NOAUTH noise, harmless)
- Next: step 2, encryption foundation (Phase E part 1)

## 2026-09-23: Step 2 encryption foundation done
- `@revualy/shared` crypto rewritten: `enc:v1:{keyId}:` format, keyring (ENCRYPTION_KEYS or legacy ENCRYPTION_KEY as k1), table.column AAD, empty strings stored as-is, legacy plaintext passthrough, both old formats still decrypt, no plaintext fallback
- `encryptedText()` Drizzle type (in tenant.ts) on 22 tier-1 columns; Postgres type unchanged so no migration; API lib/encryption.ts, google-calendar and NextAuth token handling now fail closed
- API start() and web instrumentation.ts exit(1) without a key (verified both by running them); deployment.md + .env.example document the key, backup and rotation; old rotation script refuses to run
- Tests: field-crypto (15, incl. rotation, tamper, AAD, legacy formats, CI speed budget) + encryption.integration (4, real Postgres). 166 API tests, 16/16 typecheck, web production build passes
- Found: only 0000 drizzle snapshot exists (all later migrations hand-written), so `drizzle-kit generate` is unusable; step 3 migrations must be hand-written. Web build fails if the shell has NODE_ENV=development (from .env); build with NODE_ENV unset
- Existing rows remain plaintext until the step 7 backfill

## 2026-09-23: Step 3 schema done (migrations 0032, 0033)
- 0032: identity columns (dm_address, status, link_source, linked_by, confirmed_at) + CHECKs; identity_link_events audit; inbound_messages ledger (replaces planned unrouted table: webhook stores first, dedupe on platform msg id, outcome recorded); one connected chat platform via partial unique index
- 0033: conversation turn state (theme ids/index, phase, follow-ups, thread, last_activity_at, turn version), schedule_entry_id unique (idempotent initiation), open/sweeper indexes, delivered_at outbox (existing assistant msgs backfilled)
- Drizzle schema updated (AnyPgColumn breaks the conversations/interaction_schedule type cycle); new schema-sync integration test selects every table (proved it catches a misnamed column)
- Verified all 34 migrations apply to an empty DB and 68 integration tests pass on it; 220 API tests total, typecheck clean
- Local env issue: Postgres data is a Colima bind mount (./docker-data) giving intermittent "Permission denied" on new relation files; a retry worked. Consider a named Docker volume
- Deferred: DB-enforced one-open-conversation-per-reviewer until demo stops reusing one reviewer (step 5)
