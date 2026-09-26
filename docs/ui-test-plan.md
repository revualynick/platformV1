# Revualy — UI/UX Test Plan (Playwright)

A complete, checkbox-driven schedule to verify every screen, control, form, modal,
state, and flow a user can reach. Grounded in a full inventory of the app's
interactive surface (employee / manager / admin / marketing+auth+shared).

## Progress (updated 2026-07-27)
**GREEN in CI (Chromium):**
- Phase 0 harness ✅ — `e2e/helpers/auth.ts` (roles incl. cross-tree manager, loginAsEmail, collectErrors, assertClean, assertTopMost), config, polling web to avoid EMFILE.
- Phase 1.1 auth/guards ✅ + 1.2 sidebar nav ✅ — `auth-guards.spec.ts` (14 tests): anon→login, authed-on-login→home, employee/manager role guards, super_admin access, sign-out, per-role sidebar.
- Phase 9 regression ✅ (UI-observable subset) — `regression.spec.ts` (6): B1 reflections, B2+B13+B16 flagged, B3 engagement, B12 360 section, B15 leaderboard history, out-of-tree authz.
- Modal/popover z-order + nav + flag dialog ✅ — `interactions.spec.ts` (5) → 5.3/5.10/8.1/8.2/1.2.
- Kudos/note/questionnaire submit + DB persistence ✅ — `mutations.spec.ts` (3) → 4.6/5.7/5.12.
- Full route-render matrix ✅ — `routes.spec.ts` (39) → 1.1 render layer. Screenshots/mobile/webkit specs exist.
- Phase 4/5/6 mutation matrix ✅ (10 tests) — `employee-mutations.spec.ts` (personal goal create+check-in, settings toggle, kudos validation), `manager-mutations.spec.ts` (note create+edit, dev-goal/invite, questionnaire create), `admin-mutations.spec.ts` (values full-CRUD incl delete, add-person, goal-cycle + date validation, escalation-modal validation).
**Full Wave 1 P0 = 41 passed, 0 fixme** (auth-guards + regression + interactions + mutations + 3 mutation-matrix specs). The 3 previously-deferred mutations (note delete, deactivate, verbatim toggle) now pass deterministically.

**Wave 2 GREEN:**
- Phase 7 realtime 1:1 ✅ — `realtime.spec.ts` (3): raw-WS content_sync propagation manager→employee, employee-edit rejection ("only the manager"), SessionViewer render.
- Phase 2 marketing/demo ✅ — `marketing.spec.ts` (26): landing/features/pricing/demo routes, nav, FAQ accordion, footer #-links, Slack mock, live demo chat via `claude -p` shim.
- Phase 3 onboarding wizard ✅ — `onboarding.spec.ts` (9): 3-step flow, back-nav, validation, full happy path → /dashboard + onboardingComplete=true in DB.

**RESOLVED — the "3 flakes" were a REAL app bug, not test flakiness (see archive/local-hardening.md B18):**
apiFetch attached `Content-Type: application/json` to bodyless POST/DELETE, which Fastify 5 rejected with 400 — silently breaking deactivate, note-delete, AND the realtime ws-token endpoint. Fixed in `apps/web/src/lib/api.ts` (only set Content-Type when a body is present). All 3 tests un-fixme'd and green. Verbatim toggle's residual flake was a genuine hydration race in the harness (B19) — fixed with a re-click-until-persisted helper. A latent WS message-listener race (B20) is documented (no real client can hit it).

**Phase 8 shared components ✅** — `components.spec.ts` (4): Modal (aria-modal/labelledby, focus-in, body-scroll-lock, Escape/✕/overlay-click close, top-most z-order), InfoHint (tooltip toggle + aria-expanded + Escape/outside-click), EngagementRing (sr-only status ↔ score band), DismissibleCard (localStorage dismiss persists + restores). FAQAccordion (8.5) covered in marketing; kudos/questionnaire modals (8.3) in mutations.

**Marketing spec hardened (B21)** — fixed brittle agent-authored assertions (unscoped `[aria-expanded]` catching the Next.js dev-overlay → scope to `button:has(.faq-icon)`; Try-Demo redirect expectation; footer `href="#"` hash-vs-nav; Slack-mock strict-mode `#`). Demo lead + live-chat tests now `test.skip` when `DEMO_MODE !== "true"` (this is a DEMO_MODE=false tenant instance; demo is an apex-deployment feature). marketing.spec = **33 passed / 2 skipped / 0 failed**, deterministic.

**Phase 10 non-functional (achievable subset) ✅** — `nonfunctional.spec.ts` (14): responsive horizontal-overflow (marketing / /pricing /about @ 390/834/1440 clean; app-shell reported+annotated, desktop asserted clean), lightweight manual a11y sweep (landmarks/labels/alt/button-names/h1), soft perf budget (nav timing). Cross-browser chromium + webkit (webkit-render.spec). **Found + fixed 2 real a11y issues (B22):** marketing had no `<main>` landmark; admin values-card icon buttons had no accessible name.

**Phase 10 BLOCKED by no-download policy:** full axe WCAG sweep (`@axe-core/playwright` not installable), Firefox cross-browser (no binary). Visual-regression baselines + app-shell mobile responsiveness remain open (shell non-responsiveness is a known product gap — reported, not failed).

**Demo LLM flow** needs a `DEMO_MODE=true` instance + `claude -p` shim to exercise end-to-end (skipped in this tenant-instance suite — see B21).

**HARNESS NOTE:** run the suite at the config default `workers: 1` against `next dev`. `--workers>1` causes dev-server contention (compile-on-demand + polling) → false failures. Always read the final `N passed/failed/skipped` summary line, never a truncated `tail`.
**OPEN BUILD BUG:** B17 — `next build` static prerender fails (useState null on /404, likely dual-React); tracked in archive/local-hardening.md. Suite runs against `next dev` (polling, to avoid EMFILE).

---

**How to use:** work top-to-bottom by wave. Each `- [ ]` is one Playwright test (or
a tight group). Tick when the test exists AND passes in CI. Priority tags:
`[P0]` core/mutation/safety · `[P1]` secondary flows & states · `[P2]` polish/visual.

Assertion standard for every page test: HTTP < 400, no error overlay, **zero
console errors / pageerrors** (allowlist favicons), and the named assertion.

---

## Phase 0 — Harness & infrastructure  (do first)

- [ ] [P0] `playwright.config.ts`: baseURL, projects (chromium + webkit + firefox), trace/screenshot on failure, JSON+HTML reporters
- [ ] [P0] Auth fixture via key-gated `/api/test-login` — helpers `loginAs(role)` for employee / manager (jordan.wells, has reports) / admin (dana) + a second manager (priya) for cross-tree tests
- [ ] [P0] DB reset/seed fixture: reseed to a known state before mutation suites; unique markers per run; cleanup after
- [ ] [P0] `collectErrors(page)` helper (console.error + pageerror capture) attached to every test
- [ ] [P0] `assertTopMost(selector)` (elementFromPoint) helper for modal/popover z-order
- [ ] [P1] Viewport matrix fixture: desktop 1440, tablet 834, mobile 390
- [ ] [P1] axe-core integration (`@axe-core/playwright`) for a11y assertions
- [ ] [P1] Network/console error budget + a soft perf budget helper (nav timing / LCP)
- [ ] [P1] Fixtures for realtime tests (WebSocket token via `getWsToken`, a seeded active 1:1 session)
- [ ] [P0] CI wiring: start docker (pg+redis) + api + web + (for chat) the `claude -p` shim; run suites; publish report

---

## Phase 1 — Cross-cutting suites  (assert on EVERY applicable page)

### 1.1 Auth, session & route guards `[P0]`
- [ ] Unauthenticated → protected route (`/home`, `/dashboard/*`, `/team/*`, `/settings/*`, `/onboarding`) redirects to `/login`
- [ ] Authenticated on `/login` → redirects to `/home`
- [ ] Role guard: employee blocked from `/team/*` and `/settings/*`; manager blocked from `/settings/*` (or per real policy) — verify redirect/403 UI
- [ ] super_admin can reach every area
- [ ] Real Google OAuth: clicking "Continue with Google" initiates the provider flow (stub/mock provider in CI); post-auth lands on `/home` or `/onboarding`
- [ ] Sign-out clears session → protected routes redirect to `/login`
- [ ] Middleware demo-mode bypass behaves (only if DEMO_MODE tested)

### 1.2 Global layout & sidebar nav `[P0]`
- [ ] Sidebar renders correct items + role badge per role (employee: none; manager: "Manager"; admin/super_admin: "Admin")
- [ ] Every sidebar link navigates to the right route; active state (forest bg) set via longest-prefix match
- [ ] User info block shows correct name/initials
- [ ] Breadcrumb / page header correct per page

### 1.3 Global states `[P1]`
- [ ] Loading skeletons render during Suspense on each data page (no layout shift into content)
- [ ] `DataUnavailable` renders on data-load failure (force by breaking a query) — honest error, not fake-empty
- [ ] Empty states render their real copy where data is absent (each documented empty state below)

### 1.4 Accessibility `[P1]`
- [ ] axe: 0 serious/critical violations on each top route (all roles)
- [ ] Keyboard-only: can reach and operate primary nav + primary action on each page
- [ ] Focus visible on interactive elements; focus order logical
- [ ] Modals trap focus, restore focus on close, Escape closes (see 8.1)
- [ ] Icon-only buttons have aria-labels (close ✕, send, toggles)

### 1.5 Responsive `[P1]`  (finding: app shell not responsive — verify + track)
- [ ] Marketing pages: no horizontal overflow at 390/834/1440; nav collapses appropriately
- [ ] App (employee/manager/admin) at 390: **known issue** sidebar doesn't collapse (~100–136px overflow) — assert the intended behavior once fixed; until then, this suite documents the gap
- [ ] Tables/charts/org-chart degrade gracefully (scroll containers, not clipped)

### 1.6 Cross-browser `[P1]`
- [ ] Full route-render matrix passes on Chromium
- [ ] Same on WebKit — **known issue**: NextAuth `/api/auth/session` `ClientFetchError` on authed pages; confirm on real Safari + real OAuth session (not test-login cookie)
- [ ] Same on Firefox

### 1.7 Performance `[P2]`
- [ ] Each key page under a nav-timing/LCP budget (record baselines: dashboard, team overview, org-chart, settings)
- [ ] No N+1 explosions on team/leaderboard (dedupe verified) — assert single data pass
- [ ] Charts render without long main-thread blocks

---

## Phase 2 — Marketing / Public (anonymous)

### 2.1 Global marketing `[P1]`
- [ ] Nav: logo→`/`; links How It Works(anchor)/Features/Pricing/FAQ(anchor); CTAs Try Demo→`/home`, Sign In→`/login`, Request Early Access→`/pricing`
- [ ] Footer: all active links navigate (Features, About, Privacy, Terms, Contact mailto); disabled links (Changelog/Blog/Careers/Security) do nothing
- [ ] ScrollReveal content becomes visible on scroll (force-reveal proves full layout; no permanently-hidden sections) — note no-JS fallback gap

### 2.2 Home `/` `[P1]`
- [ ] Renders; hero CTAs navigate (Request Early Access→pricing, See How It Works→#anchor smooth-scroll, explore demo→/home)
- [ ] Testimonials + How It Works + 3 feature deep-dives render; engagement-ring SVG animates
- [ ] Early-access mailto button opens correct mailto
- [ ] FAQ accordion: expand/collapse each of 6; one-open-at-a-time; aria-expanded toggles; icon rotates

### 2.3 Features `/features` `[P1]`
- [ ] All 9 feature cards render (verify count vs "nine tools"); hover states; deep-dive animations; both CTAs navigate

### 2.4 Pricing `/pricing` `[P1]`
- [ ] Founding card + 11 features render; Request Early Access mailto; 3 "Coming Soon" tiers de-emphasized; FAQ (4) accordion works

### 2.5 About `/about` `[P1]`
- [ ] Renders; 3 principle cards + hover; both CTAs navigate

### 2.6 Privacy `/privacy` & Terms `/terms` `[P2]`
- [ ] Render, no console errors, footer/nav present

### 2.7 Demo `/demo` `[P0]`  (core marketing conversion path)
- [ ] Slack mock chat auto-plays the scripted conversation, loops
- [ ] Demo email gate: empty email blocks submit; valid email → `Start Demo` → chat UI (`/api/v1/demo/lead`)
- [ ] **Live demo chat (needs shim/LLM):** Start Conversation → bot opens (`/demo/start`); send a reply → user msg + bot reply (`/demo/{id}/reply`); message counter + phase badge update; conversation closes → "analysis queued"; Start New appears
- [ ] Demo error handling (API/network) shows error state; Enter-to-send; empty input disabled
- [ ] Per-day demo limit enforced (rate limit surfaced honestly)

### 2.8 Login `/login` `[P0]`
- [ ] Heading/subheading render; Google button renders with logo; click initiates OAuth (stub in CI)

---

## Phase 3 — Auth & Onboarding `[P0]`

### 3.1 Onboarding wizard (`/onboarding`, 3 steps)
- [ ] Step 1: name required (Continue disabled when empty); email read-only prefilled; timezone select; Continue → `confirmProfile`
- [ ] Step 2: 3 notification toggles (weekly_digest, flag_alert, nudge) toggle + keyboard operable (role=switch, aria-checked); Continue → `saveNotificationPrefs`; Back restores step 1 state
- [ ] Step 3: "Connect in Settings"→`/dashboard/settings`; Get Started → `finishOnboarding` → redirect `/dashboard`; Back restores step 2
- [ ] Full flow persists (name/timezone/prefs/onboardingCompleted in DB); error banner on action failure + recovery
- [ ] Step indicator reflects progress; data survives back/forward

---

## Phase 4 — Employee dashboard

### 4.1 `/home` = `/dashboard` `[P0]`
- [ ] Renders; engagement ring + delta; 4 quick stats; **Next Interaction shows real data or honest "No upcoming interactions" (never mock)** [B-mockleak]
- [ ] Charts render (EngagementChart, ValuesRadar); "New here?" DismissibleCard dismiss persists (localStorage)
- [ ] 1:1 "View all"→`/dashboard/one-on-ones`; next/last session cards link to session
- [ ] Empty states: no manager, no sessions, no upcoming, no feedback; DataUnavailable on failure

### 4.2 `/dashboard/engagement` `[P1]`
- [ ] Ring + delta + trend chart + weekly breakdown table + 4 stat cards render with **real computed values** [B3]
- [ ] Skeleton + DataUnavailable states

### 4.3 `/dashboard/feedback` `[P1]`
- [ ] Received feedback list (anonymized "Peer"), sentiment badges, values pills, scores render from real data
- [ ] Value-mentions sidebar; **360 Reviews section renders completed reviews (strengths/growth/values) or "No 360 reviews yet"** [B12]
- [ ] Empty + DataUnavailable states

### 4.4 `/dashboard/goals` `[P0]`  (mutations)
- [ ] Renders individual + personal + shared sections; empty states; "No active cycle"/"No team goals to ladder to" copy
- [ ] **Create Goal modal** (individual): title required, description, parentGoal select, metric optional → `createMyGoalAction` → new card appears; validation
- [ ] **Create personal goal**: + targetDate + shareWithManager checkbox → persists private by default
- [ ] **Check-in** on a card: metricCurrentValue OR progressPercent + status + note → `checkInAction` → progress updates
- [ ] **Share/Make private** toggle (personal) → `toggleShareAction`; label updates
- [ ] **Suggestion review modal** (✨): Apply (`applySuggestionAction`) / Dismiss (`dismissSuggestionAction`) — needs a seeded suggestion
- [ ] "View org alignment"→`/dashboard/goals/alignment`

### 4.5 `/dashboard/goals/alignment` `[P1]`
- [ ] LadderTree renders org→team→individual; "← My goals" nav; empty + DataUnavailable

### 4.6 `/dashboard/kudos` `[P0]`  (mutation — already covered, extend)
- [ ] Received/Given lists + 3 stats (incl. Top Value [B8-adjacent]) render
- [ ] **Send Kudos modal**: recipient required, message required, coreValue optional → `sendKudos` → success check + auto-close 1.5s → appears in Given/DB
- [ ] Validation (missing recipient/message), Cancel, error state, z-order/focus

### 4.7 `/dashboard/one-on-ones` `[P1]`
- [ ] SessionList grouped (active/scheduled/completed); open-action-item dot; each links to session; empty states (no manager / no sessions)

### 4.8 `/dashboard/one-on-ones/[sessionId]` `[P0]`  (realtime — see Phase 7)
- [ ] Session detail renders; ownership guard (redirect if not owner); "← All Sessions" nav
- [ ] Active session: presence indicator, Request Edit, notes sync, agenda/action checkboxes (realtime)
- [ ] Completed session: read-only notes/agenda/actions

### 4.9 `/dashboard/profile` `[P0]`  (assessment entry)
- [ ] Two assessment cards; if none: "Take Assessment"→`/assess/{framework}`; if exists: dimensions + "Retake"/"View Results" links
- [ ] Development Goals table renders when present

### 4.10 `/dashboard/profile/assess/[framework]` `[P0]`  (quiz flow)
- [ ] Intro → "Begin Assessment" (`startAssessment`); loading
- [ ] Quiz: progress bar; select option (updates response); Back disabled on Q1; Next disabled until answered; quick-nav dots jump; color-coding per framework
- [ ] Submit (all answered) → "Calculating…" (`submitAssessment`) → redirect to results
- [ ] Both frameworks (colour, cdm); error banners
- [ ] Guard: can't submit with unanswered questions

### 4.11 `/dashboard/profile/results/[sessionId]` `[P1]`
- [ ] Colour results (blend, 4 bars, interpretation) OR CDM results (6 dimension cards, summary) render; Back to Profile / Retake nav; redirect if session/profile missing

### 4.12 `/dashboard/reflections` `[P1]`
- [ ] 4 stats + mood timeline (emoji per reflection, hover date) + reflection cards (highlights/challenges/goal) render **from real self_reflections** [B1]
- [ ] Empty + DataUnavailable

### 4.13 `/dashboard/settings` `[P0]`
- [ ] Notification PreferenceToggles (weekly_digest/flag_alert/nudge) toggle → `togglePreference`; disabled while pending; error state
- [ ] Google connect: "Connect Google"/"Reconnect"/"Connected ✓" states + authorize link with returnTo

---

## Phase 5 — Manager (team)

### 5.1 `/team` overview `[P1]`
- [ ] 4 stats (members, avg engagement color-coded, interactions, flagged w/ link), leaderboard, trend chart, flagged section render from real data
- [ ] "Review" on flagged item → `/team/flagged`; skeletons; empty flagged; DataUnavailable

### 5.2 `/team/feedback` (Team Insights) `[P1]`
- [ ] Month selector pills switch digests; 4 stats; theme-frequency chart; language patterns bars; member grid **from real feedback_digests** [B14]
- [ ] Empty: "No insight data available yet"

### 5.3 `/team/flagged` `[P0]`  (safety-critical)
- [ ] **AI escalations list renders (visible to manager) with severity/subject/reason/excerpt** [B2]
- [ ] **Investigate** modal (FlagReviewButtons): optional note → `reviewFlagAction("investigate")` → "Under investigation" chip; revalidates
- [ ] **Dismiss** modal: optional note → `reviewFlagAction("dismiss")`; z-order/focus/Escape
- [ ] **Members at Risk** sidebar shows real low-engagement members [B16]
- [ ] **Pulse Alerts** section shows real pulse triggers [B13]
- [ ] Empty states (no flags / no at-risk / no pulse)

### 5.4 `/team/goals` `[P0]`
- [ ] Team goals + reports' goals + shared personal sections; "How check-in suggestions work" DismissibleCard w/ live Google status; prereq alerts (no cycle / no org goals)
- [ ] **New team goal** modal → `createTeamScopedGoalAction` (parent=org goal, team select, metric)
- [ ] **New goal for a report** modal → individual goal (owner select)
- [ ] **Check-in** on card → `managerCheckInAction`; suggestion apply/dismiss

### 5.5 `/team/leaderboard` `[P1]`
- [ ] 4 stats; This Week ranked list (color-coded bars); **Previous Weeks history from real past-week data** [B15]

### 5.6 `/team/members` `[P1]`
- [ ] Member cards grid; each links to detail; hover; header count

### 5.7 `/team/members/[userId]` `[P0]`  (dense — mutations)
- [ ] Header (engagement ring, streak, response rate); trend + values charts; recent feedback; flagged (read-only)
- [ ] **Add note** (textarea → `addNote`) appears in list; **Edit note** inline (`editNote`); **Delete note** (`removeNote`) — ownership enforced [authz]
- [ ] **Invite to assessment** → `inviteToAssessmentAction` → confirmation
- [ ] **Development goals**: + Add Goal (framework/dimension/direction/notes → `setDevelopmentGoal`); "Mark achieved" (`updateGoalStatus`)
- [ ] Profile & Development (Colour/CDM cards, behavioral drift); **360 Reviews section** [B12]; 1:1 "View all" link
- [ ] Cross-tree guard: manager cannot open a non-report's detail (403/redirect) [authz]

### 5.8 `/team/members/[userId]/one-on-one` `[P1]`
- [ ] Schedule new session (datetime-local → `createSession`); active session editor embed; SessionList links

### 5.9 `/team/members/[userId]/one-on-one/[sessionId]` `[P0]`  (realtime — Phase 7)
- [ ] Start/End session (`startSession`/`endSession`); notes auto-save (`saveNotes`)
- [ ] Agenda: add item (`addAgendaItemAction`), toggle covered (`toggleAgendaItemAction`), Generate Agenda (`generateAgendaAction`)
- [ ] Action items: add (assignee select, `addActionItemAction`), toggle done, delete (`deleteActionItemAction`)

### 5.10 `/team/org-chart` `[P0]`  (complex interactions)
- [ ] Renders nodes + threads; 3 stats; **no crash on any role value** [B-orgchart]
- [ ] Node **click** → detail popover **top-most** over graph (z-order) [B-popover]; close on outside/Escape
- [ ] Node **hover** highlight; node **drag** repositions + children rebalance
- [ ] Thread hover highlight; thread midpoint click → thread edit panel; "Reset Layout"; "Threads On/Off" toggle; "Clear selection"
- [ ] Thread list below filters by selected person

### 5.11 `/team/profiles` `[P1]`
- [ ] Colour composition (aggregate bar + member rows) + CDM composition (dimension rows, legend) render; member pills link to detail; empty states

### 5.12 `/team/questions` `[P0]`
- [ ] My Team + Org-Wide questionnaire cards render (category/verbatim/status badges, themes)
- [ ] **Create Question(naire) modal**: name, category, verbatim checkbox, dynamic themes (+ Add theme / Remove, intent+dataGoal) → `createManagerQuestionnaireAction` → appears; validation; scroll with many themes; z-order/focus

---

## Phase 6 — Admin (settings)

### 6.1 `/settings` `[P1]`
- [ ] Setup checklist (computed items) + quick-access cards + needs-attention render
- [ ] **Edit Org** dialog: name required, timezone, allowed-domains regex → `updateOrg`; validation + error

### 6.2 `/settings/access` `[P0]`  (privilege changes — destructive)
- [ ] Privileged + employee tables render; role capabilities collapsible
- [ ] **Change Role** dialog: assignable roles per caller; elevated-privilege warning; hierarchy guard (can't promote ≥ self unless super_admin) → `changeUserRole`
- [ ] **Deactivate/Reactivate** confirm modal → `deactivateUserAction`/`reactivateUserAction`; self hidden; empty states

### 6.3 `/settings/people` `[P0]`
- [ ] Table (name/email/role/tz/status/actions) + empty state
- [ ] **Add Person** dialog: email+name required, role (hierarchy-gated), timezone → `addPerson`
- [ ] **Import People** dialog: template download, file upload + paste, live preview, per-row validation, ≤500, hierarchy guard → `importPeople` (created/skipped)
- [ ] Deactivate/Reactivate (shared confirm)

### 6.4 `/settings/campaigns` + `/[id]` `[P1]`
- [ ] Filter pills (All/Draft/…); **New Campaign** modal (name required, dates, audience) → `createCampaignAction`; cards link to detail; empty/filtered-empty
- [ ] Detail: tabs Details/Themes/AI Assistant; **Advance Campaign** (`advanceCampaignAction`, can't pass complete); AI chat (`sendCampaignChatAction`, suggestions); "Campaign not found"

### 6.5 `/settings/escalations` `[P0]`  (state machine — destructive)
- [ ] Escalation cards: audit trail + related feedback render
- [ ] **Begin Investigation** modal → `transitionEscalationAction(…, "investigating")`
- [ ] **Mark Resolved** modal: resolution note **required** → `…"resolved"`
- [ ] **Dismiss** modal: optional note → `…"dismissed"`; buttons conditional on status; empty state; 409 on already-closed

### 6.6 `/settings/goals` `[P0]`
- [ ] Cycles list + org goals hierarchy + setup-order box + empty states
- [ ] **New cycle** modal: name + start<end validation → `createCycleAction`
- [ ] **New org goal** modal (metric optional) → `createOrgGoalAction`
- [ ] **Check-in marker form**: marker text → `saveCheckInMarkerAction` (Saved ✓)
- [ ] Org goal **check-in** → `adminCheckInAction`

### 6.7 `/settings/integrations` `[P1]`
- [ ] Cards per platform (connected/disconnected styling); 3 stats
- [ ] **Connect** dialog per platform (Slack/GChat/Teams/Calendar fields, password inputs, JSON parse) → `connectPlatform`
- [ ] **Configure** (edit) → `connectPlatform`; **Disconnect** confirm (destructive) → `disconnectPlatform`; DataUnavailable

### 6.8 `/settings/org-chart` `[P1]`
- [ ] Renders (drag/click); 4 stats; legend; "No organization data" empty; DataUnavailable; popover z-order (shared with 5.10)

### 6.9 `/settings/people`/org visualizations covered above

### 6.10 `/settings/questions` `[P1]`
- [ ] Questionnaire cards (source/verbatim/status, themes) + AI-discovered theme cards; 4 stats; "How it works" box; empty
- [ ] **New Questionnaire** modal (name+category) → `addQuestionnaire`; **Edit** modal → `editQuestionnaire`
- [ ] **Verbatim toggle** → `toggleVerbatim` (label Verbatim/Adaptive)
- [ ] AI theme **Accept**/**Dismiss** (if suggested)

### 6.11 `/settings/values` `[P0]`
- [ ] Value cards (alignment score color) + sidebar + stats + tips
- [ ] **Add Value** modal (name required) → `addValue`; **Edit** modal → `editValue`; **Delete** confirm (soft-delete) → `removeValue`
- [ ] **Import Values** dialog (template, upload/paste, preview, ≤200) → `importValues` (created/skipped)

---

## Phase 7 — Realtime (1:1 WebSocket) `[P0]`

- [ ] Manager starts session → employee viewer receives `presence` (green dot)
- [ ] Manager edits notes → employee `content_sync` updates live
- [ ] Agenda toggle propagates (`agenda_updated`) both directions
- [ ] Action-item toggle/add/delete propagates (`action_updated`)
- [ ] Employee "Request Edit" delivers to manager
- [ ] `session_ended` reloads the employee viewer
- [ ] Ping keepalive (30s); reconnection after transient drop (currently no reconnect — assert graceful read-only fallback)
- [ ] WS auth: invalid/absent token → no live updates, read-only mode (no crash)

---

## Phase 8 — Shared components (unit-ish, cross-page) `[P1]`

### 8.1 Modal (`modal.tsx`)
- [ ] Not rendered when closed; renders when open; overlay-click closes; ✕ closes; Escape closes
- [ ] Focus moves in on open, trapped (Tab/Shift+Tab cycle), restored on close
- [ ] `role=dialog`/`aria-modal`/`aria-labelledby`; body scroll locked while open
- [ ] Top-most z-order (elementFromPoint)

### 8.2 InfoHint (`info-hint.tsx`)
- [ ] Toggle open/close; outside-click + Escape close; content (glossary heading/short/long or literal); aria-expanded; **z-40 below modals**, above content

### 8.3 SendKudos / CreateQuestionnaire modals — behaviors covered in 4.6 / 5.12; also: success auto-close, form reset, scroll-with-many-themes

### 8.4 EngagementRing — color by score (≥80 green / 60–79 amber / <60 red); animation; sr-only status text

### 8.5 FAQAccordion — one-open-at-a-time, aria-expanded, icon rotate, keyboard

### 8.6 DataUnavailable — default + custom `what`

### 8.7 DismissibleCard — dismiss persists via localStorage `revualy.dismissed.{id}`; re-appears when key cleared; graceful when storage unavailable

### 8.8 Sidebar — role badge, active longest-prefix, user block (covered 1.2; keep as component test too)

---

## Phase 9 — Regression suite (guard the 16 fixed bugs via UI) `[P0]`

- [ ] B1 — complete a self-reflection (chat) → appears on `/dashboard/reflections`, NOT as peer feedback
- [ ] B2 — concerning peer review → escalation visible on manager `/team/flagged`
- [ ] B3 — new feedback → `/dashboard/engagement` ring/trend reflects it (not seed/0)
- [ ] B4 — scheduler cron registered (bull:scheduler:repeat) → conversations initiate
- [ ] B5 — AI flag → manager flag-alert email enqueued (assert job/email stub)
- [ ] B6 — behind-target user → nudge enqueued (schedule_nudges)
- [ ] B7 — duplicate initiate (same scheduleEntryId) → no duplicate conversation
- [ ] B8 — weekly digest shows a real top value (not blank)
- [ ] B9 — re-run profile aggregation → no duplicate snapshots
- [ ] B10 — transient check-in failure → retried, not stuck "failed"
- [ ] B11 — self-reflection questions use 2nd-person (no "How is <self>…")
- [ ] B12 — completed 360 → visible on employee feedback + manager member detail
- [ ] B13 — pulse trigger → visible on manager flagged "Pulse Alerts"
- [ ] B14 — after digests scheduled → Team Insights populated
- [ ] B15 — leaderboard "Previous Weeks" shows real history
- [ ] B16 — low-engagement report → appears in "Members at Risk"
- [ ] AUTHZ — out-of-tree manager gets 403 on profiles/engagement/kudos/feedback; org-chart/notes ownership enforced (UI shows no leak)

---

## Phase 10 — Non-functional & release gates `[P2]`

- [ ] Visual regression baselines (Playwright snapshots) for each top page per role + key modals (kudos, questionnaire, flag review, org-chart popover)
- [ ] a11y full sweep (axe) all routes, 3 viewports
- [ ] Cross-browser full matrix green (chromium/webkit/firefox) — or documented exceptions
- [ ] Performance budgets recorded + enforced on key routes
- [ ] Console/network error budget = 0 across the full crawl
- [ ] Mobile responsiveness pass (blocked on the app-shell fix — track)

---

## Suggested execution waves

1. **Wave 1 (P0 smoke + safety):** Phase 0 harness, 1.1/1.2, 4.1/4.4/4.6, 5.3/5.7/5.12, 6.2/6.5/6.11, 2.7/2.8/3.1, Phase 9 regression.
2. **Wave 2 (P0 remaining + P1 flows):** rest of Phase 4/5/6 mutations, Phase 7 realtime, 1.3/1.4.
3. **Wave 3 (P1 states + marketing):** Phase 2, remaining state/empty/error tests, Phase 8 components.
4. **Wave 4 (P2 non-functional):** 1.5/1.6/1.7, Phase 10 (visual, a11y sweep, cross-browser, perf).

**Coverage bar to claim "every UI function tested":** every `- [ ]` in Phases 1–9 checked and green in CI on Chromium, with P0 also green on WebKit+Firefox, and Phase 10 gates recorded.
