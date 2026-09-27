# Support handover: consented requests, no watchlist

Status: merged 2026-09-27, not reviewed
Commits: fd833ef.. · Migration: 0047 · Design: `docs/bot/concerns-playbook.md` ("wellbeing and safety: the support handover")

## What and why
Nick asked whether the product should handle wellbeing and safety at all. We agreed it shouldn't judge risk, and shouldn't keep a list of people who "may need support". Instead it recognises and hands over. The bot says it's only a feedback assistant, shares the organisation's own support details, and offers to ask the organisation's support contact to get in touch. A name reaches a person only if they say yes, and nothing they wrote is ever passed on. Admins see monthly counts only.

## What changed
- **Wording** (`apps/api/src/lib/bot-references.ts`):
  - `supportOffer` replaces the wellbeing and safety tails: today for safety, within two working days for wellbeing.
  - The outside-work line comes from the organisation, and is shown for safety only. The Samaritans default is gone.
  - `supportReplies` covers yes, no, retry, give up, and no contact available.
  - `parseConsent` reads the answer with fixed rules; mixed signals count as unclear.
  - `OrgResources` now carries support fields instead of `safetyContact` and `eap`.
- **DB** (`0047_support_handover.sql`):
  - Conversation phases `support_offer`, `support_retry` and `support`, and `support_level`.
  - `org_settings`: support contact, backup, details, outside line.
  - `support_requests`: who, urgency, status, due, reminded; never content.
  - `support_signals`: monthly counts with no ids.
- **Job side** (`apps/api/src/lib/support.ts`): loads the settings and resources, `recordSupportOffer`, `createSupportRequest`, due times, and the notification job.
- **Orchestrator** (`conversation-orchestrator.ts`):
  - A conversation waiting on the offer is answered by code, with no model call.
  - A yes creates the request and queues the email.
  - Support conversations end `incomplete` without analysis, and `markIncomplete` doesn't queue analysis for them.
- **Analysis and sweeper:**
  - `runAnalysisPipeline` returns early for support phases.
  - Sweeper step 5 skips them.
  - Step 7 purges them after 7 days, self-reflections included.
  - New step 9 sends one overdue reminder.
- **Email** (`supportRequestTemplate`, worker case `support_request`): goes to the contact and backup, with no name and nothing the person wrote.
- **API** (`/api/v1/support`):
  - Admin `GET`/`PUT /settings`; counts under 3 come back as null.
  - `GET /me` says whether the caller is a contact.
  - Contacts only: `GET /requests`, and `POST /requests/:id/acknowledge` and `/close`, all audited. Refusals are audited too.
- **Web:** `/settings/support` (form, warning when no contact is set, counts table), and `/dashboard/support` (the queue), linked in the nav only for the contacts.

## Where it differs from the design
- **Not wired into live chat yet.** The reference path isn't called from the orchestrator (that's item 1, waiting on Nick's yes to the wording). When it is, the reference-path branch must call `recordSupportOffer(tx, conversationId, level, Boolean(org.supportContact))` in the same transaction as the offer message. Everything after that point is live now.
- HR for conduct reports isn't a setting yet. `hrContact` falls back to the support contact or "your HR team".
- The support contact can be anyone active, not only admins. That's deliberate: a mental health first aider may be an employee.

## How it was tested
- `apps/api/src/lib/__tests__/support-wording.test.ts` (25): the consent table (including "please don't", "yes but not today" and "yesterday was rough"), the offer wording per level, no contact, no invented helpline, and the replies.
- `apps/api/src/__tests__/support-handover.integration.test.ts` (8), with a model that throws if called:
  - yes: request, email job, no analysis, and the pipeline refuses the conversation
  - no: nothing passed on
  - unclear, then unclear again: treated as no
  - `markIncomplete` doesn't analyse
  - due times across a weekend
  - the sweeper purges after retention and reminds only once
  - queue access: non-contacts refused and audited, views audited, acknowledge then 409, close
  - admin settings validation and small counts hidden
- API 622/622, typecheck 17/17, eval compiles.
- Browser, against staging: `e2e/specs/support-handover.spec.ts`. Dana sets Jordan as contact, a request for Sarah shows in Jordan's queue, and Jordan takes it on and closes it; the view is audited. Sarah can't open the queue and has no nav link.
- Full browser suite on staging, no retries: 208 passed, 0 failed, 2 skipped.
- Not run: the offer in a live chat, because it isn't wired yet (the orchestrator path is covered by the integration test). Real email delivery wasn't checked.

## Review checklist
- [ ] Read `parseConsent`'s word lists. Is any common reply read the wrong way? A false yes passes a name on.
- [ ] Is the offer wording right for your safeguarding stance? It's fixed text in `supportOffer`.
- [ ] Confirm nothing outside the queue can list support requests or names: grep for `supportRequests`.
- [ ] Check that support conversations can't reach feedback: the analysis early return, and sweeper steps 5 and 7.
- [ ] Try `/dashboard/support` as an admin who isn't a contact: redirected, and audited in the API.

## Not done / limits
- The reference path doesn't call `recordSupportOffer` yet (lands with item 1).
- The answers given before the disclosure in that conversation are also not used as feedback. It's simpler and safer, but that feedback is lost.
- Due times are fixed: 8 hours for safety, and two working days skipping weekends in UTC. There are no bank holidays or organisation hours.
- One contact and one backup. No rota, and no chat DM, only email.
- The monthly counts could still point to someone in a very small organisation, even with small counts hidden.
- Legal: inferring that someone may need support is arguably special category (health) data under UK GDPR, even though only consented names go to a person. This needs a lawyer and a DPIA template for clients.
- The fixed wording needs a one-off review by someone qualified (an EAP provider or a mental health first aid trainer).

## Decisions pending
- Who reviews the wording. Recommendation: the beta client's EAP provider.
- Whether the conduct route gets the same consent-queue shape. Recommendation: yes, with HR as its own contact.
