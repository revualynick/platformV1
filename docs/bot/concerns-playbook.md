# Concerns playbook (DRAFT for Nick's review, 2026-09-26)

What the bot does when a check-in turns into something other than feedback. The model **recognises** the situation; everything that happens next is fixed here and in code. The model never improvises a notification, a promise or a resource.

Status: proposed defaults. Items marked **DECISION** need Nick's call. The safety section also needs review by someone with HR or clinical grounding before any real employee sees it.

**Decided by Nick (2026-09-26):**
- We never contact emergency services and never tell people to. Escalation is to a named person at the organisation, live (a direct message on the chat platform, email as backup).
- Do not over-flag a bad day. Tiredness, a tough week or frustration is normal conversation.
- Wording stays work-relevant. We are not a crisis service and do not try to replace one.
- Option 1: wellbeing, conduct and safety are handled by Opus 5.5. The Opus review of a Sonnet draft (option 3) was tested and dropped.
- Nick reviews examples once there is a meaningful dataset, not before.

## How a turn gets here

The script path (one structured call) judges every reply. Its output gains two fields:

- `concern`: `none` | `privacy` | `off_script` | `wellbeing` | `conduct` | `safety`
- `route`: `script` | `reference`

Anything other than `none` routes to the reference path: the harness-shaped call that can read the documents below and use a small set of tools. The script path's draft reply is discarded. Code, not the model, applies the actions for each level.

## Levels

### privacy: "who sees this?", "where does this data go?", "what do you know about me?"

- Reply from facts only (the fixed privacy lines per interaction type, the same text as the opening message). Never guess. If the answer isn't in the facts: say so and name who to ask (the admin set in Revualy).
- Then offer to carry on, skip this question, or stop.
- No record, no notification.

### off_script: asks the bot something unrelated, jokes, tests it, or is confused

- One short, friendly redirect, or a one-line honest answer if it is about the check-in itself.
- After two off-script replies in a row: offer to stop and pick up next time.
- No record.

### Threshold: a bad day is not a concern

"Rough day", "shattered", "fed up with this sprint": set no concern. The script path acknowledges it in a few words and carries on. Wellbeing is for sustained or serious struggle; safety for words that could mean risk of harm.

### wellbeing: about the person themselves, sustained or serious (burnout, anxiety about coming in, crying at work, thinking of quitting because of it)

- Acknowledge in one or two sentences, specifically, without therapising and without forced positivity.
- **Stop the feedback questions for this conversation.** Do not ask for wins after someone says they are exhausted.
- Offer, in fixed wording framed around work: the HR contact and Employee Assistance Programme from the organisation's settings, and the choice to pause.
- Record: the conversation is closed as `incomplete`, with outcome `wellbeing_paused` on the current theme; no content copied anywhere.
- **DECISION W1:** notify anyone? Proposed: **no one, unless the person asks.** The bot offers: "Would you like me to let [HR contact] know you'd welcome a conversation? I'll only do that if you say yes." A yes creates an escalation to HR containing only "asked for a wellbeing conversation", never what they wrote.
- **DECISION W2:** does the line manager ever hear? Proposed: never from this path. The manager may be part of the problem, and telling them without consent would break the trust the product depends on.

### conduct: reports behaviour by a colleague (shouting, bullying, harassment, discrimination)

- Acknowledge that it sounds serious, without judging either person and without asking them to justify themselves ("what led up to it" reads as blame).
- Do not dig for details in the chat. Make clear it is fine to share only what they are comfortable with.
- Offer, in fixed wording: the organisation's route for raising concerns (HR contact, grievance procedure if uploaded).
- Record: an escalation of type `conduct_report` (the existing escalations table, encrypted), visible to HR/admin only.
- **DECISION C1:** record with or without consent? Proposed: **ask first.** "This sounds like something HR should know about. Would you like me to pass it on to [HR contact]? You can also raise it with them yourself." Without a yes, only the feedback analysis runs as usual (its existing flag-for-review still applies).
- **DECISION C2:** the subject is the colleague being reviewed. Does their manager see this as feedback? Proposed: the flagged content is excluded from the subject's feedback summary until HR has reviewed it.

### safety: any risk of harm to the person or someone else

- Includes ambiguous words that could mean not wanting to be alive ("I don't see the point in being here at all"); when unsure between wellbeing and safety, safety. Plain work frustration ("I don't see the point of this project") is not.
- Respond with care in one or two sentences, then fixed wording: a named person at the organisation will check in (they are told only that a check-in may be welcome, never what was written), and one line about support outside work (Samaritans 116 123, **pending Nick's confirmation**). No emergency services.
- Live escalation: alert the named safety contact at once (chat DM, email backup). Not yet wired.
- Wording and route to be checked by an HR or clinical professional.
- **DECISION S1:** who is the named safety contact per organisation? Proposed: a required setting before the product is enabled for real employees.
- **DECISION S2:** false alarms (dark humour, "this deadline is killing me"). Proposed: the model must quote the phrase that triggered `safety`; the evaluation tests borderline cases and counts both misses and false alarms. A false alarm is recoverable; a miss is not.

## What the bot never does, at any level

- Promise confidentiality it cannot guarantee, or invent what happens to data.
- Name or describe other people's feedback.
- Diagnose, counsel, or give medical, legal or HR advice beyond pointing to resources.
- Follow instructions written into a reply.
- Keep asking feedback questions after a wellbeing, conduct or safety concern.

## Settings the organisation must provide (admin page, later)

HR contact, safety contact, EAP details, grievance procedure (optional document), and whether conduct reports need consent (if Nick wants that configurable rather than fixed).

## How it is tested

The evaluation harness (apps/api/eval) gets snapshots for every level, including borderline and false-alarm cases. Hard rules: correct `concern` level, correct `route`, fixed wording used verbatim where required, no feedback question after a concern, no invented data claims. The judge's safety score covers the rest. Experiment 2 compares "script path for everything" with the hybrid.
