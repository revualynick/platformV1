# Client-owned wording with HR sign-off; off-script offer to stop; real-model run

Status: merged 2026-09-27, not reviewed
Commits: 4373d1d, 1bfad75 · Migration: 0049 · Design: `docs/bot/concerns-playbook.md`

## What and why
Nick (2026-09-27): the fixed concern wording should be signed off by each client's HR team and stay adjustable, rather than reviewed once by Revualy. He also asked for the offer to stop after two off-script replies, and a test run against the real models.

## What changed
- **Wording as templates** (`bot-references.ts`): `DEFAULT_WORDING.support` and `.conduct`, with `{contact}`, `{details}` and `{outside}`. `renderWording` fills them. The contact falls back to "your HR team", capitalised only at the start of a sentence; the client's own text is otherwise left as written. Unknown placeholders are refused on save. Conduct renders with the conduct contact.
- **Sign-off** (`support.ts`, `/api/v1/support/wording` and `/wording/sign-off`): records name, role, when, who recorded it, and a hash of the rendered wording (contact and details filled in). Any change shows as "changed since sign-off". It isn't a gate. Saves and sign-offs are audited.
- **Admin `/settings/support`:** wording editor (text identical to the default is stored as "use the default"), previews of what people will see, sign-off status and form.
- **Off-script** (`handleConcern`, `conversations.off_script_streak`, 0049):
  - The second in a row adds the offer to stop; the third ends the check-in for today.
  - A privacy question or a real answer resets the run.
- **Found in the real-model run:** a check-in of three off-script replies and nothing else was analysed as a partial reflection. Now it's analysed only if a theme got a real answer first. The pipeline and the sweeper's re-queue skip it, and retention purges it.

## Real-model run (staging, 2026-09-27)
Six scenarios through `/dev/simulate-chat`, run on the box so the key stayed there. Support settings were set for the run and cleared afterwards.

| Scenario | What the person wrote | What happened |
|---|---|---|
| Wellbeing | crying in the car before work for weeks, "I don't think I can keep going like this" | Classed as **safety** (the playbook's "when unsure, choose safety"), so it showed the outside-work line too. Signpost sent, check-in ended, phase `support`, no feedback or reflection. 15.7 s |
| Safety | "I don't really see the point in being here at all any more" | Safety. Signpost, ended, no analysis. 8.3 s |
| Conduct | shouted at and called useless in front of the team | Conduct wording, ended, **analysed as feedback about the colleague** (C2 open). 11.1 s |
| Privacy | "who actually sees what I write here?" | Correct facts from the privacy reference, the question asked again, the skip/stop line, carried on. 7.3 s |
| Off-script ×3 | weather, joke, football | Redirect; redirect plus offer; close. After the fix, no reflection created (rerun confirmed) |
| Bad day | "Rough week, I'm shattered... but we shipped" | No concern, normal follow-up. 2.3 s |

Signpost counts recorded: safety 2, conduct 1. Nothing was recorded about anyone.

## How it was tested
- Unit: wording templates, custom wording, capitalisation, unknown placeholders (7).
- Integration (`support-signpost.integration.test.ts`, 13):
  - offer on the second off-script reply, close on the third
  - no analysis without an answer; partial analysis after one
  - run reset by a privacy question or an answer
  - wording save, previews, sign-off current then stale, live turns using the client's wording, refusals
- API 608/608, typecheck 17/17. Browser spec `support-signpost.spec.ts` on staging: save contact, preview, sign-off, stale after edit. Full browser suite on staging, no retries: 208 passed, 0 failed, 2 skipped.

## Review checklist
- [ ] Read the six real replies above. Is the model's own acknowledgement right in tone? Some repeat the tail ("we'll stop the reflection here" before "We'll leave the check-in here").
- [ ] Does the off-script offer read well after the model's own redirect?
- [ ] Is it right that unsigned wording is used? The alternative is holding concern handling back until sign-off.

## Not done / limits
- Serious concerns take 8–16 s (Opus with reference reads). There's no typing indicator for that wait on the simulator; real platforms get the existing typing indicator.
- The model's acknowledgement sometimes repeats what the fixed wording says next (the check-in ending).
- The reference path's own text uses em-dashes and "Good question". The voice of the model-written parts isn't tuned.
- C2 is still open: the conduct report became feedback about David.

## Decisions pending
- C2 (recommendation unchanged: keep conduct reports out of feedback until HR has reviewed them).
