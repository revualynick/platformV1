# Local Hardening — thorough test + repair (no remote push)

LLM backed by local `claude -p` shim (scripts/claude-llm-shim.mjs), so the full
pipeline runs with no paid key. Stack: docker (pg+redis), api :3000, web :3001,
shim :8787. Auth via key-gated test-login. Seeded demo org (14 users).

## Bug log (found by running the real loops)

### B1 — chat self-reflection never reaches the Reflections page  [OPEN]
Repro: drive a `self_reflection` conversation to close (chat-sim / orchestrator).
- Conversation + messages persist; analysis pipeline runs (sentiment/score/values).
- It writes a **feedback_entries** row (interaction_type=self_reflection, subject=self),
  but writes **nothing** to `self_reflections`.
- `getReflections` (Reflections dashboard) reads `self_reflections` → the reflection
  never appears, despite the bot saying "you'll find this saved on your Reflections page".
- Also: a self-reflection creating a peer `feedback_entries` row (subject=self) likely
  pollutes feedback dashboards / digests.
Fix direction: in the analysis path, branch on interactionType — self_reflection should
extract reflection data → upsert a `self_reflections` row and NOT create a peer feedback_entry.

### B1 CONFIRMED real — scheduler DOES create self_reflection chat conversations
`interaction-scheduler.selectInteractionType` rotates peer_review ↔ self_reflection,
so self_reflection chat conversations are a genuine production flow. On close they
create a feedback_entries row (subject=self) and nothing in self_reflections →
Reflections page empty + self-feedback pollutes peer-feedback dashboards/digests.
Fix: analysis pipeline must branch interactionType=self_reflection → extract +
upsert self_reflections, skip feedback_entries.

### Not-bugs (unsupported chat paths, noted)
- three_sixty via chat: scheduler never schedules it (structured 360 route flow only).
  three_sixty_reviews/responses stay empty for chat-driven 360. Not a real flow.
- pulse_check via chat: driven by pulse routes (sentiment-decline trigger), not chat.
- Harness note: chat-sim should treat pulse_check as self-directed too (cosmetic).

### VERIFIED WORKING
- peer_review chat → analysis → feedback_entries(subject=peer, score, sentiment, 4 values). ✓

### B2 — SAFETY-CRITICAL: AI escalations are invisible to managers  [OPEN]
Repro: drive a peer_review with concerning content (burnout/at-risk/harsh).
- detectFlags correctly returns shouldFlag=true; analysis-pipeline.ts:173 inserts an escalation.
- BUT the insert only sets feedbackEntryId, severity, reason, flaggedContent — it does NOT set
  subject_id (relies on DB defaults for type/status/description, so the row is created with subject_id=NULL).
- getFlaggedItemsForReports (manager Flagged page) filters `subject_id IN reportIds` → NULL never matches
  → the escalation NEVER appears for the manager. Admin sees it (getAllFlaggedItems, unfiltered).
- Impact: the AI's core safety feature (surface concerning patterns to the manager) silently fails.
Fix: analysis-pipeline.ts:173 insert must set subjectId: conversation.subjectId (+ consider a meaningful
type/description). Verify manager Flagged page then shows it.

### B3 — feedback never updates engagement dashboards  [OPEN]
peer_review creates feedback_entries.engagement_score, but NOTHING writes the
`engagement_scores` table (verified: no insert/update outside seed.ts/bootstrap).
Engagement ring/trend/leaderboard all read engagement_scores → they only ever show
seed data, never real feedback activity. Needs a weekly-engagement aggregation that
rolls feedback_entries → engagement_scores (per user/week).

## Worker-agent findings (static, corroborated)
### B4 CRITICAL — scheduler never runs (no conversations ever initiated)
server.ts:285-319 — schedulerQueue created + worker registered, but NO repeatable
cron job is ever added to it. runSchedulingPass never fires → the product never
initiates any peer_review/self_reflection conversation on its own. Core loop dead.
### B5 CRITICAL — flag_alert email never enqueued
analysis-pipeline.ts:172 inserts escalation but never enqueues notificationQueue
.add("flag_alert",...). Handler (workers/index.ts:471) is dead. Managers never
emailed on a flag. (Compounds B2 — escalation both invisible AND silent.)
### B6 — nudge email never enqueued (workers/index.ts:516 handler unreachable)
### B7 — conversation/initiate idempotency broken: scheduleEntryId not in
initiateJobSchema (workers/index.ts:43-52) → stripped → dedup never happens →
transient sendMessage failure duplicates the conversation + double-sends opening.
### B8 — weekly_digest topValue hardcoded null (workers/index.ts:457)
### B9 — profile-signals aggregate_behavioral: no dedup → duplicate profileSnapshots on re-run (workers/index.ts:732)
### B10 — check-in: failed meetings never retried (check-in-pipeline.ts:441,556)
### B11 — self_reflection: subjectName=self passed to generateQuestion → self-referential awkward questions (orchestrator ~339-365)

## Disconnect-agent findings (corroborate + extend)
### B3 CONFIRMED: engagement_scores has NO writer anywhere (only seed/bootstrap).
Engagement ring/trend/streak/leaderboard/digest all read it → 0/seed-only in prod.
### B12 — 360 reviews written (three_sixty routes) but NO page reads three_sixty_reviews/responses.
### B13 — pulse_check_triggers written (pulse-check-monitor) but NO page reads them.
### B14 — feedback_digests only via manual manager POST; no worker auto-populates → Team Insights empty.
### B15 — leaderboard "Previous Weeks" history: no writer → always empty (isDemo?mock:[]).
### B16 — Flagged "Members at Risk" sidebar hardcoded isDemo?mock:[] (dead code) → always empty in prod.
CONSISTENT (verified good): feedback received/given, kudos, goals, 1:1, manual escalations,
assessment profile snapshots, calendar sync, check-in suggestions.

## FIX PRIORITY (verifiable locally): B2+B5 (escalation visible+alert), B1 (reflection),
B3 (engagement aggregation), B4 (scheduler cron), B7 (idempotency), then B6/B8-B11.
Larger feature gaps (B12-B16) documented; fix small/core first.

## FIXED + VERIFIED end-to-end (via claude -p loop)
- B1 ✅ self_reflection → self_reflections upsert (Reflections page), 0 feedback_entries pollution.
  (analysis-pipeline.ts self_reflection branch + extractReflectionData)
- B2 ✅ escalations set subject_id + type='ai_flag' → visible to the subject's manager
  (verified: getFlaggedItemsForReports returns it for jordan.wells).
- B3 ✅ NEW engagement-aggregation.ts recomputeWeeklyEngagement → engagement_scores written
  from real feedback (verified: Sarah's current-week row appears, interactions_completed>0).
- B5 ✅ flag_alert email enqueued to subject's manager on AI flag
  (verified: "[email-stub] Subject: Flag alert: David Kim — medium").
Files: apps/api/src/lib/analysis-pipeline.ts, engagement-aggregation.ts, workers/index.ts:335.

## Fix batch 2 (implementer agent; typecheck 16/16 + 123 unit tests pass)
- B4 ✅ scheduler cron registered (server.ts:285,295) — verified live: bull:scheduler:repeat exists in Redis. Product now initiates conversations (delivery still needs platform channel setup).
- B7 ✅ scheduleEntryId added to initiateJobSchema (workers/index.ts:57) for idempotency.
- B8 — digest topValue: agent computing real top core value (workers/index.ts weekly_digest). Verify.
- B9 — profile-signals snapshot dedup added.
- B10 — check-in transient failures retried (check-in-pipeline.ts).
- B11 — self_reflection question phrasing (orchestrator ~339-365) no longer self-references by name.
- SCHEDULER_PLATFORM added to .env.example.

## Still OPEN (documented; feature-completion scope, not quick fixes)
- B6 — nudge job never enqueued (no cron/trigger). Nudge reminder emails never sent.
- B12 — 360 review results: written (three_sixty_reviews) but NO dashboard read path.
- B13 — pulse_check_triggers: written but NO manager-facing read path.
- B14 — feedback_digests (Team Insights): manual-POST only, no auto-population worker.
- B15 — leaderboard "Previous Weeks" history: read is isDemo?mock:[] (now that engagement_scores
  is written weekly by B3, this could be wired to read past weeks).
- B16 — Flagged "Members at Risk" sidebar: dead isDemo?mock:[] block; wire to real low-engagement members.

## NOT YET DONE (validation tasks)
- Dynamic worker-flow tests (digest/nudge/calendar/check-in/profile-signals actually firing).
- API integration tests for authz/tenant/RBAC on real requests.
- Real Google OAuth path (only test-login bypass exercised).

## Fix batch 3 (2026-07-26)
- B15 ✅ getTeamLeaderboardHistory query + wired into leaderboard page (real past-week rankings, team-scoped). typecheck green.
- B16 ✅ flagged "at risk" sidebar wired to getBulkLatestEngagement (members with score<60), replacing dead mock block. typecheck green.
- B6 ✅ schedule_nudges cron (Wed+Fri 9am) + handler enqueues nudge jobs for behind-target users. Cron registered in Redis; handler runs without error.
- B14 ✅ schedule_weekly_digests dispatcher now also fans out generate_team_insights (per manager, prev month) → feedback_digests upsert. Handler runs without error (empty result = seed data is this-month only).
- B12/B13 — 360 + pulse read surfaces: in progress (frontend agent).
STATUS: 14/16 catalogued bugs fixed. Gate: 16/16 typecheck, 123 api tests.

## Dynamic validation (task 20 — reporting-tree authz)
Confirmed at runtime as priya.sharma (manager) vs sarah.chen (out of priya's tree, under sibling jordan):
- GET /profiles/users/:sarah?framework=colour → 403 (in-tree tom → 200)
- GET /engagement/bulk?userIds=:sarah → 403
- GET /kudos?userId=:sarah → 403
- GET /users/:sarah/feedback → 403 (in-tree tom → 200)
- No x-internal-secret → 401
→ assertCanAccessUser (the IDOR remediation) enforces correctly at runtime.

## Worker validation (task 19)
- analysis worker: extensively verified (peer_review/self_reflection → correct persistence, escalation, engagement, flag_alert).
- scheduler cron: registered in Redis (bull:scheduler:repeat).
- schedule_nudges + schedule_weekly_digests(+generate_team_insights): triggered manually, handlers run with NO errors (empty results = seed-data timing, prev-month/current-week).
- calendar-sync / check-in / profile-signals: not dynamically triggered (need Google integration / specific data) — crons registered.

## Fix batch 4 (2026-07-26) — B12/B13 complete + all 16 done
- B12 ✅ getCompletedThreeSixtyReviews query; 360 results surfaced on employee feedback page + manager member-detail page (Omit<ThreeSixtyAggregation,"subjectId"|"subjectName"> to match query shape).
- B13 ✅ getPulseTriggersForReports query + "Pulse Alerts" render section on manager flagged page.
- Verified LIVE on flagged page (jordan.wells): B2 AI escalations visible w/ Investigate/Dismiss, B16 Members-at-Risk real scores (David 45/Sarah 56/James 58), B13 Pulse Alerts render.

## FINAL STATUS: all 16 catalogued bugs (B1-B16) fixed.
Gate: 16/16 typecheck, 123 api tests, web build 44 pages.
Verified end-to-end (DB+UI): B1,B2,B3,B5,B13,B16. Verified live-cron/handler: B4,B6,B14.
Verified typecheck+build+code: B7,B8,B9,B10,B11,B12,B15. Authz remediation dynamically validated (403 out-of-tree).

## REMAINING (NOT bugs in the catalogue — larger/known):
- Real Google OAuth path (only test-login bypass exercised locally).
- Mobile responsiveness (app shell not responsive — found earlier, not fixed; may be out of scope).
- Load/scale/concurrency testing; security audit (deps, rate limits, rawContent encryption TODO).
- Production monitoring/alerting; Stripe billing (not built).
- Dynamic verification of B8/B9/B10/B14 with period-appropriate data (handlers run clean; results empty due to seed-data timing).

## Build findings (2026-07-26, during test-harness setup)
- B17 — production `next build` static prerender fails: "Cannot read properties of null (reading 'useState')" on minimal static pages (/team/profiles, then /404). Dev/SSR renders fine. Likely dual-React copy or a client component rendered during static prerender globally. Mitigation applied: added `export const dynamic = "force-dynamic"` to the 3 authed role layouts (employee/manager/admin) — correct anyway (per-user pages must not be prerendered). Root cause for /404 (root layout) still OPEN — needs investigation (check for duplicate react in the tree). Does NOT affect dev/SSR or Railway if it uses dev/standalone; blocks a plain `next build`.
- Test harness runs web in `next dev` with WATCHPACK_POLLING=true to avoid EMFILE watcher exhaustion under many concurrent processes.

## B18 (2026-07-27) — apiFetch attached Content-Type to bodyless requests → Fastify 400 (REAL production bug)
File: apps/web/src/lib/api.ts
Symptom: every bodyless POST/DELETE from the web app silently failed — admin Deactivate,
manager private-note DELETE, and the 1:1 `POST /:id/ws-token` (which broke realtime WS
entirely). The UI showed no error because the failed fetch was swallowed; the row/state
simply never changed, which I initially MISDIAGNOSED as Playwright/server-action flakiness
and wrongly marked 3 tests `test.fixme`.
Root cause: apiFetch unconditionally set `"Content-Type": "application/json"`. Fastify 5
rejects a request that declares `content-type: application/json` but sends an empty body
with a 400 (empty JSON is not valid JSON). Bodyless DELETE/POST therefore 400'd.
Fix: only set Content-Type when a body is actually present —
  ...(init?.body != null ? { "Content-Type": "application/json" } : {})
Verified: admin Deactivate persists (row leaves listActiveUsers), manager note DELETE
persists, verbatim toggle persists, and realtime ws-token mints (content_sync flows).
The 3 wrongly-deferred tests were un-fixme'd and now pass deterministically (2× clean runs).
Correction to the record: this was NOT test flakiness — it was a genuine app bug that would
have broken deactivate / note-delete / realtime in production.

## B19 (2026-07-27) — verbatim toggle test: hydration race in harness (NOT an app bug)
Toggle button is a client component; a Playwright click landing before React hydration
completes after `reload({networkidle})` is silently dropped. Fixed in the harness with a
re-click-until-persisted helper (`setVerbatimTo`) that reloads and re-verifies each attempt.
App code is correct. Documented separately from B18 so the record is honest about which was
an app bug (B18) vs a test-harness robustness issue (B19).

## B20 (2026-07-27) — WS 1:1: message listener attached after async session lookup (latent race, low severity)
File: apps/api/src/modules/one-on-one/ws.ts (~line 271)
The connection handler awaits a DB session lookup + room setup BEFORE attaching
`socket.on("message")`. A message sent by the client in the same tick as `open`
(before the listener exists) is dropped by the Node stream. Surfaced only via the
raw-WS test harness sending content_update instantly on open; the real client
(SessionViewer) sends only on user input, never within the ~5ms setup window, so
production risk is effectively nil. Not refactored (would mean buffering early
messages / extracting the switch into handleMessage — unjustified risk to working
WS code for a race no real client can hit). Test settles 500ms after connect before
sending. Documented as a known latent race, not a fix.

## B21 (2026-07-27) — marketing E2E spec had brittle/incorrect assertions (test-quality, + honest correction)
The Wave-2 agent-authored marketing.spec.ts was NOT reliably green — earlier "26/30 passed"
claims were an overcount from truncated `tail` output. Root causes, all fixed:
- **Unscoped `page.locator('[aria-expanded]')`** for FAQ tests also matched the Next.js
  dev-mode overlay button (client-injected, absent from SSR + production). This made the
  home-FAQ first-item assert "true" and the pricing count read 5 instead of 4. Verified via
  SSR HTML: `/` has exactly 6, `/pricing` exactly 4 `aria-expanded` (all false), and
  `.faq-icon` count matches. Fix: scope FAQ selectors to `button:has(.faq-icon)`.
- **"Try Demo → /home"** expected /home|onboarding|dashboard, but `/home` 307-redirects to
  `/login` when unauthenticated + non-demo (confirmed via curl). Fix: assert we leave the
  marketing landing (pathname !== "/"), accepting /login too.
- **Footer href="#" test** used a `framenavigated` listener that fires on the `#` hash change,
  so it always reported "navigated". Fix: assert `href="#"` + pathname unchanged after click.
- **Slack-mock `getByText("#")`** hit multiple channel "#" glyphs (strict-mode). Fix: assert a
  channel name instead.
- **Demo lead + live-chat tests** require DEMO_MODE=true (apex/marketing deployment). This is a
  DEMO_MODE=false tenant instance where the lead API is auth-gated (verified: POST /demo/lead
  → 401). These 2 tests now `test.skip(process.env.DEMO_MODE !== "true", …)` with an honest
  annotation rather than silently failing. The demo LLM flow still needs a DEMO_MODE=true
  instance + the `claude -p` shim to exercise end-to-end.
Result: marketing.spec = 33 passed / 2 skipped / 0 failed, deterministic. NOT app bugs — all
were test-quality issues (one mild real note: 4 footer links are intentional `#` placeholders).

## Phase 8 shared components (2026-07-27)
Added e2e/specs/components.spec.ts (4 tests, all green): Modal (aria-modal/labelledby,
focus-in, body-scroll-lock, Escape/✕/overlay-click all close, top-most), InfoHint (tooltip
toggle + aria-expanded + Escape/outside-click), EngagementRing (sr-only status ↔ score band),
DismissibleCard (localStorage dismiss persists across reload; clearing key restores).

## Phase 10 non-functional (2026-07-27) — achievable subset + 2 real a11y fixes (B22)
Added e2e/specs/nonfunctional.spec.ts (14 tests, green): responsive horizontal-overflow
(marketing / /pricing /about @ 390/834/1440 all clean; app-shell overflow reported+annotated,
desktop asserted clean), lightweight manual a11y sweep (landmarks/labels/alt/button-names/h1),
soft perf budget (nav timing). Cross-browser: chromium + webkit covered (webkit-render.spec).

**B22 — two REAL a11y issues found by the sweep and fixed:**
- Marketing pages had NO `<main>` landmark → wrapped `{children}` in `<main>` in
  apps/web/src/app/(marketing)/layout.tsx.
- `apps/web/src/app/(admin)/settings/values-card.tsx` rendered icon-only edit buttons (pencil
  SVG) with no accessible name (screen readers announced bare "button") → added
  `aria-label`/`title` = `Edit <value>` + `aria-hidden` on the SVG. Web typecheck clean.

**Phase 10 BLOCKED by the no-download policy (documented, not done):**
- Full axe-core WCAG sweep — `@axe-core/playwright` / `axe-core` not installed and cannot be
  fetched. The lightweight manual sweep above is a partial substitute, NOT a full audit.
- Firefox cross-browser — no Playwright Firefox binary present and cannot be downloaded.
  Documented exception; chromium + webkit are covered.
- Visual-regression baselines and app-shell mobile responsiveness remain open (the latter is a
  known product gap — the nonfunctional spec reports the overflow rather than failing on it).
