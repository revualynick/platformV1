# Goal cycle refresh, mobile layout and mechanical backlog

Status: merged 2026-09-27, not reviewed
Commits: 16643d9..24217a4 · Migration: none

## What and why
Nick asked for the mobile layout, the goal cycle refresh bug and any other mechanical backlog items to be fixed. After this the browser suite passes in full against staging (production build), with no retries.

## What changed
- **Saved items not appearing (root cause found).** In the production build, a route-level `loading.tsx` above a page makes a server action's streamed response sometimes keep the old content. Measured on staging by creating a goal cycle 20 times: 35 to 55% not shown with the settings loading boundary, 20 of 20 shown without it. Intercepting the response showed the server's copy was always correct. Removed the 22 `loading.tsx` files above pages that save in place (including the dashboard- and team-wide ones); kept 6 on read-only pages. Rule added to `CLAUDE.md`. The cycle modal awaits the save directly.
- **Mobile layout.** Below `lg`, the sidebar is a drawer opened from a top bar (closes on navigation, backdrop or Escape) and `<main>` takes the full width (`components/sidebar.tsx`, three role layouts). Goal card badges wrap; the admin settings grid can shrink.
- **`pnpm dev`** passes the environment through (`turbo.json`).
- **Slack** ignores messages posted by apps (`bot_id`, `app_id`, `bot_profile`): review H4.
- **Engagement streak** is written: consecutive weeks meeting the target, continued from last week's row (`lib/engagement-aggregation.ts`).
- **Month keys** for team insights built in UTC.
- **One shared timezone list** (`apps/web/src/lib/timezones.ts`).
- **Approving a 1:1** queues that meeting for processing straight away (`processMeetingNow`), instead of waiting for the hourly run.
- `e2e/.mutation-markers.json` untracked.

## Where it differs from the design
Removing loading boundaries trades skeleton screens for correctness: navigating to those pages shows the previous page until the new one is ready.

## How it was tested
- API 575/575, typecheck 17/17. New: streak (continues, resets, idempotent); approve queues and decline doesn't.
- Browser suite against staging, no retries: 202 passed, 0 failed, 2 skipped.
- Goal cycle: 20/20 after the fix, measured with a trace script.
- Mobile: overflow measured at 390px on the previously failing pages (0 after); drawer checked by screenshot and navigation.
- **Not checked:** how navigation feels without the removed loading skeletons on a slow connection.

## Review checklist
- [ ] On a phone-width window: open the menu, navigate, check it closes; no sideways scrolling on the main pages.
- [ ] Create a goal cycle, a core value, a person and a note: each appears without reloading.
- [ ] Navigate between dashboard pages on a throttled connection: is the missing skeleton acceptable?
- [ ] Approve a real 1:1 import with Gemini notes attached: tasks appear within a minute, not at the next hour.

## Not done / limits
Items needing Nick's decision were left (member page scope, concern checks on reflections, KMS, timezone-aware scheduling); see the backlog.

## Later changes
