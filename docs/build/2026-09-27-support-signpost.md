# Support signpost, and the reference path live in conversations

Status: merged 2026-09-27, not reviewed
Commits: e2e92a4.. · Migration: 0048 · Design: `docs/bot/concerns-playbook.md` ("wellbeing and safety: the signpost")

## What and why
Nick simplified the support handover the same day it was built (`2026-09-27-support-handover.md`). He called it "the Claude route": above a threshold the bot shows support information, as Claude does with 111 or 999, except it says to reach out to a named person at the organisation who is better placed to support them. No one is contacted and nothing is recorded about the person, only how often the signpost was shown. He also confirmed item 1, so the reference path now runs in live conversations.

## What changed
- **Wording** (`bot-references.ts`): `supportSignpost` gives the organisation's contact ("X is better placed to support you, so it's worth reaching out to them"), its details, its outside-work line for safety only, and "I haven't passed anything on". Conduct: "You can raise this with X... I haven't passed anything on." Consent parsing and replies are removed.
- **DB 0048:**
  - Dropped: `support_requests`, `support_signals`, `org_settings.support_contact_id`/`support_backup_id`, `conversations.support_level`.
  - Added: `org_settings.support_contact` (free text: a person or a team) and `support_signposts` (month, level, shown), which has no ids.
  - Phase `support` only.
- **Orchestrator** (`handleConcern`): a flagged turn goes to `runReferencePath`.
  - privacy / off_script: send the reply and fixed line, and carry on without moving the theme.
  - wellbeing / safety: signpost, end `incomplete` in phase `support`, no analysis, count.
  - conduct: signpost, end `incomplete`, analysed as before, count.
  - The reference path finds an ordinary answer: the planned turn goes ahead.
  - The model fails on a serious concern: the fixed wording is still sent. On a light one, the planned turn goes ahead.
- **Removed:** the support queue page, contact emails, the overdue reminder, and `notificationQueue` in the orchestrator's dependencies.
- **Admin `/settings/support`:** who to reach out to, details, outside line, and counts by month and level with under 3 hidden.

## Where it differs from the design
- Off-script: the playbook says to offer to stop after two off-script replies in a row. That isn't built; each off-script reply gets its redirect and the check-in carries on.
- Conduct uses the same contact as support until it has its own setting.

## How it was tested
- `support-wording.test.ts` (4): signpost contents, the outside line for safety only, no invented helpline, conduct passes nothing on.
- `support-signpost.integration.test.ts` (9), with fake models (the planner flags, the reference path decides):
  - safety and wellbeing: signpost sent, phase `support`, no analysis, counted
  - the reference path raising wellbeing to safety
  - conduct: analysed as before
  - privacy: carries on
  - an ordinary answer after all: the planned turn goes ahead
  - model failure: the fixed wording still goes
  - `markIncomplete` doesn't analyse
  - the sweeper purges after retention
  - admin settings and hidden small counts
- API 601/601, typecheck 17/17, eval compiles. Browser spec `support-signpost.spec.ts` passes on staging; full browser suite on staging, no retries: 208 passed, 0 failed, 2 skipped.
- **Not run:** a live conversation against the real models on staging. The reference path's handling was measured in experiments 2 and 3 (47/47 final concern as expected), but not through `processTurn` with real models.

## Review checklist
- [ ] Read `handleConcern`: can a support conversation reach analysis by any path? (Also check `markIncomplete`, the sweeper's step 5, and the pipeline's early return.)
- [ ] Is it right that conduct reports are still analysed as feedback about the colleague (C2)?
- [ ] Read the signpost wording as someone having a bad time. Does it land?
- [ ] Try a privacy question and an off-script message in the web demo: the check-in should carry on.

## Not done / limits
- A live end-to-end conversation with the real models hasn't been run on staging.
- The two-off-script offer to stop isn't built.
- Answers given before a wellbeing or safety disclosure are dropped with the conversation.
- The counts could still point to someone in a very small organisation, even with small counts hidden.
- Wording review by someone qualified (EAP provider or MHFA trainer) is still open.
- Whether the flag itself is special category data processing is now a smaller question, because nothing about the person is stored. It's worth one line in the client DPIA template.

## Decisions pending
- C2: exclude conduct reports from the subject's feedback until HR has reviewed them? Recommendation: yes. A report about behaviour isn't feedback about work.
- A separate conduct contact? Recommendation: yes, once a client asks for it.
