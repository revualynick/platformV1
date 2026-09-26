# Privacy step 2: pseudonymous peer feedback

Status: merged 2026-09-26, not reviewed
Commits: 5a8cf51, 309d2cf, 4bfb819 (merged 82b2d23) · Migration: 0043 · Design: `docs/design/privacy-and-agent-access.md` ("Tier A")

## What and why
The bot promised peer reviewers an anonymised summary while storage held their user id next to what they said. Stored peer, 360 and imported feedback now carries only a keyed pseudonym; subjects and managers see paraphrased themes released fortnightly once at least three people have contributed; re-identifying a reviewer is a super-admin action written to a tamper-evident log.

## What changed
- **Pseudonym** `apps/api/src/lib/pseudonym.ts`: `reviewerRef(orgId, userId)` = HMAC-SHA256 keyed by `REVIEWER_PSEUDONYM_SECRET` (32+ characters; the API refuses to start without it outside tests). `tenantReviewerRef`, `reviewerLabel` ("Reviewer 1a2b3c4d").
- **Migration 0043**: `feedback_entries`, `three_sixty_responses`, `imported_feedback` hold `reviewer_ref`/`author_ref`; the id columns are dropped. Existing rows converted in SQL (pgcrypto) with the secret passed as a session setting, never as SQL text. 360 uniqueness is (review_id, reviewer_ref). `behavioral_signals.source_id` points at the conversation. Conversation links become ON DELETE SET NULL. `audit_log` created.
- **Audit log** `apps/api/src/lib/audit-log.ts`: triggers refuse UPDATE, DELETE and TRUNCATE; appends take an advisory lock so the hash chain can't fork; `verifyAuditChain()` detects gaps, broken links and altered rows.
- **Re-identification** `POST /api/v1/admin/privacy/reidentify` (`apps/api/src/modules/privacy/routes.ts`): super admin only, reason of 20+ characters, every attempt audited first (including refusals), never reads content. `GET /api/v1/admin/privacy/audit/verify`.
- **Release rule** `packages/shared/src/utils/peer-release.ts`: `MIN_DISTINCT_REVIEWERS = 3`, `RELEASE_PERIOD_DAYS = 14`, pools carry over until they qualify. Applied to subject and manager feedback views, user export and digests. Summaries paraphrased; `stripMeetingReferences` removes meeting labels and titles.
- **Retention** sweeper step 7 (`conversation-sweeper.ts`): peer conversations analysed more than `DELIVERY_RETENTION_DAYS = 7` ago are deleted with their transcript, inbound copies and schedule rows; used check-in jobs past the anchor lookback are deleted.
- **Export** `/export/feedback` is blind by default; reviewers always appear as pseudonym labels.
- **Bot wording** `privacyFacts` in `bot-references.ts` now states the real guarantees.
- Provisioning generates `REVIEWER_PSEUDONYM_SECRET` for new tenants.

## Where it differs from the design
- 360s release when the admin completes them, not on the fortnightly boundary (completion is already one batch).
- Retention deletes the whole conversation rather than stripping named fields.
- The secret lives in the API environment (write-back needs it), not only in super-admin tooling. See decisions.

## How it was tested
- `apps/api/src/__tests__/tier-a-privacy.integration.test.ts` (11): no plain reviewer id after migration, below-threshold themes withheld, audit chain detects altered and deleted rows, re-identification refuses non-super-admins and records the attempt, export blind by default.
- `apps/api/src/lib/__tests__/tier-a.test.ts` (9).
- SQL and Node pseudonyms checked equal. Local `revualy_dev` converted: 8 of 8 feedback rows.
- **Not run:** Railway.

## Review checklist
- [ ] No tier A table or query returns a reviewer's user id: `grep -rn reviewerId apps/api/src packages/db/src/queries` should only hit conversations, check-in jobs and tickets (tier D).
- [ ] Try to reach individual peer feedback as the subject or their manager before three reviewers or before the release date.
- [ ] Try UPDATE and DELETE on `audit_log` directly in psql.
- [ ] Re-identification as an admin (not super admin) returns 403 and still writes an audit row.
- [ ] Timing: can `created_at` or engagement rows still link a review to a conversation? (Known limit below.)

## Not done / limits
- The chain can't prove the newest rows weren't cut off, or that an owner didn't disable triggers and rewrite the chain; anchoring the head outside the database fixes that. No scheduled verify job.
- Unanalysed peer conversations with answers are kept indefinitely.
- `feedback_entries.created_at`, behavioural signal times and engagement rows allow timing correlation by someone with database access.
- Escalation screens and pulse triggers unchanged.
- `imported_feedback.source_key` hash includes the author's id.
- The scheduler remembers about a week of who a reviewer was asked about, so rotation may repeat sooner.
- `pnpm tenant:fleet migrate` lacks the secret (see backlog); deployed tenants migrate at API boot with it.

## Decisions pending
- Set `REVIEWER_PSEUDONYM_SECRET` on Railway (demo and test tenant) before deploying this branch. Local `.env` has a dev value.
- Move the secret behind a KMS or signing service so the API environment alone can't re-identify reviewers. Recommendation: before the first real customer.

## Later changes
