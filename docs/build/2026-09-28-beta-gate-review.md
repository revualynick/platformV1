# Beta gate: full code review and fixes

Status: merged 2026-09-28, not reviewed by a person
Commits: bf14fd6, 381719a · Migration: 0051 · Design: `docs/c3-plan.md` step 8

## What and why
The beta gate asks for a full code review of the branch: 106 commits and 441 files against `main`. It ran as four passes of the code-review skill at high effort:
1. The recent work: ops monitoring, signpost, wording, break-glass, person access.
2. The packages: chat adapters, db, shared, ai-core.
3. The API: routes, lib and workers.
4. The web app.

Each pass returned 10 findings. All 40 were checked against the code. 38 are fixed. The other 2 need Nick's decision because they're product choices, not bugs.

**Coverage, honestly:** the reviewers read excerpts in the areas they judged riskiest, not every line of 441 files. Each pass says so in its report. The areas that matter most for beta were covered: webhook verification, encryption, pseudonyms, RBAC on every route, the conversation engine, retention, and web guards and actions. "Full" here means every package and app was reviewed, not every line was read.

## What was fixed
**Privacy** (all under Nick's rule that admins see signals and content needs a logged grant):
- **Admin conversation routes** now show state only: no transcript, no reviewer or subject. Force-close goes through the engine.
- **Per-person feedback export:** it had let any admin through. It now follows the content rule, including the grant's period, and is audited.
- **Break-glass period** is enforced in the API (feedback, profile, timeline, drift), not just on the web page.
- **A message after a support signpost** used to be appended to the check-in with "added to your feedback". It now gets the signpost again and isn't stored against the check-in.
- **Retention:**
  - incoming messages that never joined a conversation are purged
  - support conversations can now be purged: a foreign key blocked it, fixed in 0051
- **Imported feedback's dedupe key** was an unkeyed hash of the author's email, so anyone with the database could re-identify the author. It's now keyed with the pseudonym secret; 0051 rekeys existing rows.
- **The 360 fallback** copied reviewers' sentences word for word. It now shows no themes when the model fails.
- **The meeting-reference stripper** removed ordinary phrases ("in code review", "during planning"). It's now precise, with regression tests.

**Correctness:**
- **Emails:** a failed email was treated as sent. `sendEmail` now throws on Resend's error result.
- **Ops alerts:**
  - the audit chain was re-verified in full every 15 minutes on the conversation queue. It's now incremental, with a full check daily, on the notification queue
  - an ops route error could leave a tenant looking healthy in `fleet health`
- **Off-script check-ins:** one with real answers but no themes lost them.
- **Wording sign-off** could be recorded against wording nobody saw. It now carries the fingerprint of what was shown.
- **Organisation text** with `$` in it was corrupted by the replace patterns.
- **The streak** showed 0 for most of each week.
- **The ticket gate** didn't fall back to defaults when it refused every agent proposal.
- **1:1 marker meetings** found on a report's calendar came out with the roles inverted.
- **Nightly duplicate `checkin_jobs`** (NULLs don't clash on a unique key). 0051 uses NULLS NOT DISTINCT.
- **Empty stored secrets** couldn't be read back.
- **Timed-out model calls** kept running and billing in the background. They're now aborted.
- **The feedback query** decrypted a person's whole history to return 50 rows.

**Security:**
- **Open redirects** in test-login and Google authorize: backslash and control characters got through. There's now one shared `safeRelativePath`.
- **Redirect hosts** were taken from a client-settable `X-Forwarded-Host`. They now come from `Host`.
- **Test-login cookie** was missing its Secure flag behind TLS.
- **Google Chat:**
  - forged tokens with unknown key ids each triggered a certificate fetch. It's now at most once a minute, with concurrent loads shared
  - the legacy token could be replayed without `eventTime`
- **Teams:**
  - stored conversation refs skipped the serviceUrl allowlist, where the bot's token is sent
  - the default store grew without limit
- **Server action inputs** went into API paths unvalidated.
- **API error bodies**, which can echo what people wrote, were logged in production.

**Cleanup:** the assessment-invite preference now shows in settings so an unsubscribe can be undone; a client-side 5 MB upload check; one user lookup per member page instead of three; unused skeleton components removed; em-dashes out of comments added on this branch.

## Decisions pending (Nick)
1. **`GET /feedback/flagged`** gives managers and admins the flagged entry's raw text, pseudonym and exact time, before any release batch. Flagged items are part of the escalation process, which the privacy design left unchanged, but this undercuts the 3-reviewer, fortnightly release for exactly the most sensitive entries. **Recommendation:** managers get the reason and severity only; the raw excerpt goes to HR on the escalation screen, as part of the formal process, audited.
2. **`GET /export/feedback`** (org-wide admin export) returns every entry's raw text, with exact times and a pseudonym label that stays the same across exports, so entries can be linked. It contradicts "admins see signals" and gets around re-identification. **Recommendation:** drop raw text. The export becomes released summaries only, or super admin plus break-glass.

## How it was tested
- New tests:
  - `review-fixes-2.integration.test.ts` (5): admin state-only views, engine force-close, export rule, inbound purge, 1:1 marker
  - support follow-up after a signpost
  - grant period in the API
  - streak carry and reset
  - failed-alert retry
  - fleet error rows
  - stripper regressions (8)
  - ticket fallback
  - key refetch
  - empty secrets
- API 636/636, tenant scripts 35/35, Google Chat 18/18, typecheck 17/17.
- Staging, after 0051 ran at boot: full browser suite, no retries, 208 passed, 0 failed.
- **Not verified:** that Railway passes the public host in `Host` (checklist item added); the Teams fixes against a real Teams tenant (not the beta platform).

## Limits
- Review depth, as above.
- 14 em-dashes remain in user-facing text added on this branch (bot messages, UI copy). Product wording is parked, so they were left.
