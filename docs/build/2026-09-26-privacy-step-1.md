# Privacy step 1: leaks closed

Status: merged 2026-09-26, not reviewed
Commits: 2cc7628 · Migration: none · Design: `docs/design/privacy-and-agent-access.md` ("Leaks to close first")

## What and why
Three places let private content reach people it shouldn't, and one email feature was broken. Goal suggestions made from a 1:1 were visible to skip-levels and admins; flag-alert emails carried the flagged text verbatim; unsubscribe links pointed at a page that doesn't exist. The fourth leak (export naming reviewers) was fixed in step 2.

## What changed
- **1:1 suggestions stay in the 1:1.** `isMeetingParticipant()` in `apps/api/src/modules/goals/permissions.ts`. The suggestion list, apply and dismiss routes (`goals/routes.ts`) require the caller to be the meeting's organiser or subject as well as able to manage the goal. The web query `getPendingSuggestionsForGoals` (`packages/db/src/queries/goals.ts`) takes a `viewerId` and filters by participant; both web goal pages pass it.
- **Flag-alert emails** (`apps/api/src/lib/email-templates.ts`, `workers/index.ts`) no longer read or include the flagged content; the email says the details are in the dashboard.
- **One-click unsubscribe** (review M3): signed per-user, per-type tokens (`packages/shared/src/utils/unsubscribe.ts`, exported from `@revualy/shared/server`), keyed from `INTERNAL_API_SECRET` with a purpose label. `unsubscribeUrlFor()` in `apps/api/src/lib/email.ts` builds the link for every email type. The public web route `apps/web/src/app/api/unsubscribe/route.ts` turns that type off on POST (what mail clients send) and shows a confirm button on GET (link scanners prefetch GETs). The footer link now goes to `/dashboard/settings`.

## Where it differs from the design
Nothing material.

## How it was tested
- `apps/api/src/lib/__tests__/unsubscribe-token.test.ts`: round trip, wrong secret, swapped user or type, malformed tokens, participant rule.
- Full API suite and typecheck passed at merge (470 tests then).
- **Not run:** the web unsubscribe route in a running app; a real email through Resend.

## Review checklist
- [ ] Sign in as a skip-level manager and an admin: `/api/v1/goals/suggestions` must not list suggestions from 1:1s they weren't in; apply and dismiss must 403.
- [ ] The web manager goals page shows suggestions only for 1:1s the viewer attended.
- [ ] A flag-alert email (set `LOG_LEVEL=debug` without a Resend key to see the stub) contains no flagged text.
- [ ] `GET /api/unsubscribe?token=<valid>` shows a button and changes nothing; POST turns the type off; a tampered token gets the "not valid" page.
- [ ] `/api/unsubscribe` is not matched by `apps/web/src/middleware.ts` (it must stay public).

## Not done / limits
- The escalation `reason` in flag-alert emails is model-written and could paraphrase content. Left as is.

## Decisions pending
None.

## Later changes
