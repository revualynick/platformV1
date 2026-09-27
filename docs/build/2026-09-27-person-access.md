# Person access: content for the direct manager, signals above

Status: merged 2026-09-27, not reviewed
Commits: f459bdf..HEAD · Migration: none · Design: `docs/design/privacy-and-agent-access.md` ("Who sees what about a person")

## What and why
Nick asked for the member page scope to follow the privacy design. The person and their direct manager see content; skip-level managers and admins see signals (engagement, 1:1 cadence, goal progress); anyone else nothing. Concern checks on reflections are parked until designed.

## What changed
- API: `getAccessLevel` / `assertContentAccess` (`apps/api/src/lib/rbac.ts`) on released feedback themes, profile, timeline, drift, development goals, assessment invites; team profiles for the team's own manager only.
- Web: member page gives skip-levels and admins a signals-only view.
- Found while testing: in-page `<Suspense>` causes the same "saved item missing until reload" bug as `loading.tsx` (private notes 4/15 missing before, 0/20 after). Removed from the ten pages that save in place; rule in `CLAUDE.md`.

## How it was tested
- API 579/579 (new access matrix), typecheck 17/17.
- Browser suite on staging, no retries: 206 passed, 0 failed.

## Review checklist
- [ ] As Alex (skip-level), open Sarah's page: signals notice, no notes, feedback or profile.
- [ ] As Dana (admin), the same.
- [ ] As Jordan, full page. As Priya, sent back.

## Not done / limits
- Break-glass access for admins in a formal process isn't built.
- Pages that lost Suspense now wait for their slowest section; not measured on a slow connection.
