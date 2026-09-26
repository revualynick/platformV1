# Review Remediation Plan (2026-07-25)

Fixes for the systematic codebase review. Findings grouped into work packages
that map to non-overlapping file sets so they can be implemented in parallel.

## Cross-cutting (DONE — landed first)
- `apps/api/src/lib/rbac.ts` — new `assertCanAccessUser(request, targetUserId)` /
  `assertCanAccessUsers(request, ids[])` helpers + `getUserRole`. Enforce
  reporting-tree membership (admins/super_admins bypass). This is the linchpin
  for the HIGH authorization cluster; downstream route fixes call it.

## WP1 — API route authorization & correctness (`apps/api/src/modules/**`)
HIGH
- profiles/routes.ts:88,341 + /timeline,/drift,/team — call `assertCanAccessUser`
  on the target user; goal update must verify the goal's subject is in tree.
- manager/routes.ts notes PATCH/DELETE — verify note.managerId === caller (ownership).
- manager/routes.ts:234 org-chart — already tree-scoped via getOrgChartForManager; add orgId defense note.
- engagement/routes.ts:71 bulk — `assertCanAccessUsers` on requested userIds.
- feedback/routes.ts:29 — use full reporting tree, not just direct managerId.
MED
- engagement/routes.ts:16 leaderboard — gate behind role or org opt-out flag.
- manager/routes.ts:517 sentimentTrend — compute vs previous month or drop the field.
- three-sixty/routes.ts:226 — wrap status+aggregate in a transaction.
- conversation/routes.ts:61 — fix chained `.where()` anti-pattern.
- integrations/routes.ts:153 outlook — return generic 501 without roadmap leak.
- users/routes.ts:40,69 — remove dead `userId` destructure.
- feedback/routes.ts:181 — route offset through Zod/parseBody.
- chat/routes.ts:44 — document/guard the injected-queue contract.
LOW
- manager/routes.ts:449, themes/routes.ts:98, org/routes.ts:158 — add DB-level date/LIMIT bounds.
- kudos/routes.ts:25, pulse/routes.ts:83 — tree-scope / stop hardcoding sourceType.

## WP2 — API libs & workers (`apps/api/src/lib/**`, `workers/**`, `server.ts`)
HIGH
- interaction-scheduler.ts:148 — populate channelId from user's platform mapping (or skip + log).
- agenda-generator.ts:85 — filter escalations by unresolved status.
- google-calendar.ts:79 — replace non-null assertion with typed error.
- workers/index.ts:598 — implement leaderboard_update OR remove it from the pref schema.
MED
- conversation-orchestrator.ts:144,150 — persist questionnaireId; move sendMessage outside/after txn with retry note.
- three-sixty-aggregator.ts:172 — route theme extraction through LLM gateway.
- interaction-scheduler.ts:297 — honor userTimezone.
- calendar-sync.ts:84 — batch relationship checks + upsert conflict handling.
- workers/index.ts:457 — compute digest topValue.
- reflection-extractor.ts:47 — wrap transcript in delimiter tags + injection warning.
- theme-discovery-engine.ts:152 — Zod-validate LLM output.
- calibration-engine.ts:131 — use inArray.
LOW
- email.ts:30 (logger not console+PII), analysis-pipeline.ts:90 (drop alias),
  check-in-pipeline.ts:299 (DB cycle filter), server.ts:261 (worker count log).

## WP3 — Web app (`apps/web/src/**`)
HIGH
- (employee)/dashboard/page.tsx — guard `upcomingInteraction` behind isDemo.
MED
- (manager)/team/page.tsx:346 dead "Review" button — wire to flag review or remove.
- (manager)/team/page.tsx:103 trend hardcoded — compute or drop.
- settings/escalations/page.tsx:114 Avg Resolution — compute or label as N/A honestly.
- settings/integrations/page.tsx:45 — remove double-cast, type properly.
- silent catches (dashboard/page.tsx:217, members/[userId]/page.tsx:109,624) — add logPageError.
- team/page.tsx:192 — dedupe the two duplicate query pairs.
LOW
- api.ts:65 log gating, escalations empty joins, feedback fromName note.

## WP4 — Packages (`packages/**`)
HIGH
- chat-adapter-teams — persist conversationRefs + userCache to Redis (restart durability); API fallback in resolveUser.
- db/queries/goals.ts:299 — restrict shared-personal-goal visibility to direct manager, not whole tree.
- migrations/0028_goals.sql — relax CHECK so individual/org goals can draft without parent/cycle (document decision).
MED
- gchat-adapter resolveUser — call People API or document as known gap clearly.
- goals.ts:169,64 — reporting-tree caching / bounds note.
- schema/tenant.ts:1219 goalCycles — add end_date > start_date CHECK (new migration).
- 0029 scopes column / calibrationReports.orgId — document.
- shared/utils/goals.ts:33 — fix unreachable decreasing-metric branch.
LOW
- teams LRU eviction loop, gateway embed cast, dead header comment, rawContent encrypt comment, gchat eventTime fallback, tenant.ts singleton note.

## Rejected
- ai-core/gateway.ts model IDs — FALSE POSITIVE, IDs are current & valid.

## Verify
- `pnpm turbo typecheck` green across all 16 tasks.
- `pnpm --filter @revualy/api test` (vitest) green.
- Re-review by fresh reviewer agents on the diff.
</content>
