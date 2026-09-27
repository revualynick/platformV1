# Break-glass access for admins

Status: merged 2026-09-27, not reviewed
Commits: 038951b.. · Migration: 0046 · Design: `docs/design/privacy-and-agent-access.md` ("Triggered access")

## What and why
Admins see signals about a person, not content. A formal process (a grievance, a formal performance process, a conduct report) sometimes needs the content. An admin can now open read-only access to one person, for a dated period and up to 30 days, by giving a reason. Every step is written to the audit log, and the person is told unless a hold is set.

Nick's decisions (2026-09-27): a content-view grant opens on a logged reason with no second approver; raw content, when it becomes viewable, needs a second approver. The grant shows the direct manager's content view, read-only, for the period, without the manager's private notes. The subject is told when the grant opens unless a hold is set.

## What changed
- **DB** (`0046_access_grants.sql`, `accessGrants` in `packages/db/src/schema/tenant.ts`): grantee, subject, scope (`content` only), reason and hold reason (both encrypted), period, expiry, hold lifted, revoked. Check constraints: period end on or after start, grantee is not the subject, expiry at most 30 days after creation.
- **API** (`apps/api/src/modules/access-grants/routes.ts`, `/api/v1/access-grants`):
  - `POST /` creates a grant (admin or super admin). Reason of at least 20 characters. The period can't end in the future and covers at most 366 days. 1 to 30 days, default 14. One active grant per admin and person. If the audit write fails, the grant is deleted.
  - `GET /`: admins see their own grants, super admins see all.
  - `GET /about-me`: the caller's own grants, once notifiable. No reason is included.
  - `POST /open/:userId`: the web page asks this before showing content, and it's logged as `breakglass.view`.
  - `POST /:id/revoke` and `POST /:id/lift-hold`: the grantee or a super admin.
  - Refused attempts by non-admins are logged as `breakglass.denied`.
- **Content check** (`apps/api/src/lib/rbac.ts`, `apps/api/src/lib/access-grants.ts`): `assertContentAccess` lets an active grant's holder read, and logs `breakglass.read` with the route before returning. It takes `{ write: true }` for routes that change content, and grants never pass those. Only `PATCH /profiles/goals/:id` uses it today. A grant stops working as soon as its holder is no longer an active admin.
- **Web**:
  - `/settings/break-glass`: form, active and ended grants, "End access" and "Lift hold". There's a nav link in the admin layout.
  - Member page: an admin with a grant sees a banner (reason, period, expiry, hold state) and read-only sections filtered to the period: engagement, values, released feedback themes, flagged items, 1:1 dates and summaries with the direct manager, the profile without invite or goal buttons, and 360 results.
  - The subject gets a dashboard notice whilst a grant is active, and an "Access to your record" section on `/dashboard/settings` (`apps/web/src/components/record-access.tsx`).

## Where it differs from the design
- The design says HR gets "a summary scoped to the period, not the raw text". Here the summary is the manager's existing content view, which is already derived (themes, aggregates, summaries). No AI-written summary.
- The design pictures HR as the requester. There's no HR role, so admins and super admins request.
- Raw content isn't viewable anywhere yet, so the second-approval flow isn't built. `scope` only allows `content`.

## How it was tested
- `apps/api/src/__tests__/access-grants.integration.test.ts` (7 tests):
  - refusals: short reason, future period, over 30 days, over 366 days, self
  - non-admins refused and audited
  - reads allowed and audited
  - a write refused
  - another person and another admin refused
  - one active grant per admin and person
  - the subject sees the grant without the reason
  - revoke by another admin refused, by a super admin allowed
  - holds hidden until lifted or expired
  - a demoted holder loses access
  - the database refuses a grant over 30 days
- API 587/587, typecheck 17/17.
- Browser, against staging: `e2e/specs/break-glass.spec.ts`. Dana opens access to Tom through the form, sees the banner and content with no notes or goal buttons, and the view is audited. Tom sees the dashboard notice and the settings section without the reason. Dana ends access and is back on signals.
- Full browser suite on staging, no retries: 207 passed, 0 failed, 2 skipped.
- Not run: a hold through the browser (covered by API tests), and a slow connection.

## Review checklist
- [ ] `assertContentAccess`: can any content route reach a grant as a write? Grep for routes that change content and don't pass `{ write: true }`.
- [ ] The member page reads the database directly for most sections, so only the view (`breakglass.view`) and the profile API calls are audited per request there, not each query. Is one view entry per page load enough?
- [ ] Try to open a grant as a manager, as an employee, and for yourself.
- [ ] As a plain admin, check you can't see or revoke another admin's grant. As a super admin, check you can.
- [ ] Should the subject see the reason? It's hidden today, on the grounds that it may name a complainant.

## Not done / limits
- API content routes aren't limited to the grant's period. Only the web view filters by date. An admin holding a grant could call `/users/:id/feedback` directly and get all released themes.
- The member page's direct database reads under a grant are logged as one view, not per query.
- The subject is told in-app only: no email or chat message.
- No second approver for raw content (nothing raw is viewable yet).
- The period filter applies to the newest 500 released themes and 200 360 reviews.
- `onHold` in the banner reflects the moment the page loaded.

## Decisions pending
- Should the subject see the reason? Recommendation: no by default. A formal process can tell them directly.
- Notify the subject by email or chat as well as in-app? Recommendation: yes, once the notification service handles it, because people rarely open settings.
