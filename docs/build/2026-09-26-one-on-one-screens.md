# 1:1 notes screens and mode limits

Status: merged 2026-09-26, not reviewed
Commits: cfb7dc6 · Migration: 0045 · Design: Nick's decisions 2026-09-26 (three modes; admin sets the limit, managers choose within it; functional screens in the house style)

## What and why
1:1 ingestion defaults to semi-automatic, which waits for the manager's approval, but there was no screen to approve on, upload notes or see between-meeting goals, so the feature couldn't be used. Now managers, employees and admins each have a screen, and the mode is per manager within an admin limit instead of one org-wide setting.

## What changed
- **Mode model** (`apps/api/src/lib/ingestion-mode.ts`): `effectiveMode(limits, managerChoice)` = the manager's choice (or the org default), capped at the admin's limit. Automatic is only available when a meeting source exists; none does yet, so it falls back to semi-automatic.
- **Migration 0045**: `org_settings.one_on_one_max_mode` (the limit; the existing `one_on_one_ingestion_mode` becomes the default) and `users.one_on_one_ingestion_mode` (a manager's choice, null = default).
- **Pipeline** (`check-in-pipeline.ts` `runCheckInPipeline`): resolves each person's effective mode; semi-automatic discovery only for token holders on semi-automatic, automatic only for managers on automatic and only with a source.
- **API** (`modules/one-on-one/imports.ts`): `GET/PUT /ingestion-mode` (own mode; 403 above the limit), `GET /imports/recent` (status only, the two people in the 1:1). `PATCH /admin/org` accepts `oneOnOneMaxMode` and lowers the default when the limit drops below it.
- **Web**:
  - Manager `/team/one-on-ones` (new nav item "1:1 Notes"): mode picker, approval list, upload (drag and drop, choose the report and date), between-meeting goals, recent imports.
  - Report's 1:1 page (`/team/members/[userId]/one-on-one`): between-meeting goals for that pair.
  - Employee `/dashboard/one-on-ones`: between-meeting goals with their manager, upload, recent imports.
  - Admin `/settings/one-on-ones` (new nav item): the limit and the default, with automatic shown as not yet available.
  - Shared components in `apps/web/src/components/one-on-one-imports/`, actions in `apps/web/src/lib/one-on-one-import-actions.ts`.
  - `apiFetch` errors now carry the API's own 4xx message (`ApiError.apiMessage`, `friendlyError()`), so uploads can say "Unsupported file type" rather than a status code. Other pages behave as before.
  - Server action body limit raised to 6 MB for uploads (`next.config.ts`).

## Where it differs from the design
Uploads are allowed in every mode, including when the limit is manual only (as the 1:1 v2 build had it).

## How it was tested
- `src/lib/__tests__/ingestion-mode.test.ts` (6): limits, choice, default, capping, automatic fallback, bad values.
- `src/__tests__/one-on-one-modes.integration.test.ts` (6): mode routes, 403 above the limit, reset to default, lowering the limit lowers the default, only admins change it, the pipeline reads only for managers whose mode allows it (mutation-checked: it fails when the pipeline ignores the manager's choice), recent imports visible only to the two people.
- Full API suite 570/570, typecheck 17/17.
- **In the running app (local, Playwright, seeded org)**: all three pages render with no console errors; a manager switched to manual and back; an admin lowered the limit to manual only (the default followed), saved, reloaded, restored; a pending 1:1 was approved from the list and appeared as "Approved, waiting for Gemini notes".
- **On staging (Linux box, production build, real model), 2026-09-26:** a fake notes .txt uploaded through the manager page produced 2 tasks, 1 between-meeting goal and 1 goal suggestion; the goal showed after reload.
- **Not run:** a real Gemini .docx or .vtt upload; Google connection from the "Connect Google" link; a "1 Issue" Next.js dev badge appeared once during a hot reload and couldn't be reproduced.

## Review checklist
- [ ] As a manager on semi-automatic without Google connected, the page says how to connect.
- [ ] Try `PUT /ingestion-mode` with `automatic` while the limit is semi-automatic: 403.
- [ ] Upload a real Gemini notes export (.docx) and a .vtt transcript; check the counts and that nothing sensitive appears.
- [ ] As an employee, confirm you only see goals and imports from your own 1:1s.
- [ ] Lower the admin limit to manual: managers on semi-automatic show manual as in use, and the pipeline stops discovering for them.

## Not done / limits
- The admin page doesn't show how many managers use each mode or have Google connected.
- Approving an import waits for the next hourly pipeline run before notes are read.
- No automatic meeting source exists yet.

## Decisions pending
None.

## Later changes
- 2026-09-26: upload verified end to end on staging (see How it was tested).
