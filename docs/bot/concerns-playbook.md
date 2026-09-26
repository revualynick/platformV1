# Concerns playbook (DRAFT for Nick's review, 2026-09-26)

What the bot does when a check-in turns into something other than feedback. The model **recognises** the situation; everything that happens next is fixed here and in code. The model never improvises a notification, a promise or a resource.

Status: proposed defaults. Items marked **DECISION** need Nick's call. The safety section also needs review by someone with HR or clinical grounding before any real employee sees it.

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

### wellbeing: about the person themselves (burnout, stress, thinking of quitting, struggling)

- Acknowledge in one or two sentences, specifically, without therapising and without forced positivity.
- **Stop the feedback questions for this conversation.** Do not ask for wins after someone says they are exhausted.
- Offer, in fixed wording: support resources (from the organisation's settings: manager, HR contact, Employee Assistance Programme) and the choice to pause.
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

- Respond immediately with fixed wording, not a feedback question: take it seriously, give crisis resources (UK: Samaritans 116 123, free, 24 hours; emergency 999; organisation-specific resources from settings), and say a person from their organisation will be told so they can help.
- Record: escalation of type `safety`, highest severity, alerting the named safety contact at once (email now, other channels later).
- This is the one level where consent is not required. Standard practice; wording and route to be checked by an HR or clinical professional.
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
