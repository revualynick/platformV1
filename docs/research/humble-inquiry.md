# Humble Inquiry: what it suggests for the bot's wording (research, 2026-09-27)

Status: **proposal for Nick's review** (2026-09-27). Nothing in the playbook, prompts or code has changed. First source in the "wording from established literature" work (backlog: wire the reference path).

See also `coaching-habit.md` (second source), which compares the two books and has the merged list of proposed changes.

**Source:** Edgar H. Schein and Peter A. Schein, *Humble Inquiry: The Gentle Art of Asking Instead of Telling*, **Second Edition**, Berrett-Koehler, © 2021 (first edition © 2013, Edgar Schein alone). E-book ISBN 978-1-5230-9264-2; the preface is dated September 2020. The file name says "2, 2013", which mixes the edition number with the first edition's year. Read in full: preface, introduction, chapters 1–8, discussion guide and the twelve mini case studies. The e-book has no page numbers, so references below are by chapter or section.

Quotes are kept to a phrase or a sentence. Everything else is paraphrase.

## What the book is, in one paragraph

A short leadership book about asking instead of telling. Its claim is that telling (advice, correction, assertion) puts the other person down and cuts off information, whilst asking questions you genuinely do not know the answer to builds the trust that makes people tell you the truth. It is written for managers, colleagues and helpers in ordinary work and family conversations. It is not about disclosure of distress, risk or misconduct, and it says so in its own way: the preface insists Humble Inquiry is "not an algorithm or set of rules". That matters for us, because fixed wording is exactly a set of rules. What the book can give us is the stance behind the wording and a vocabulary for classifying question types. It cannot give us tested scripts.

## Core ideas that bear on the bot

### 1. Humble Inquiry versus the other forms (Introduction, chapter 3)

The book defines Humble Inquiry as drawing someone out by asking "questions to which you do not already know the answer", out of curiosity and interest, whilst trying not to control either the content or the form of what they say (chapter 2). Chapter 3 sets it against three other forms used by helpers:

- **Diagnostic inquiry** steers attention towards what the asker thinks matters. Three kinds: sense-making ("why do you suppose that happened?"), feelings ("how did you feel about that?") and action ("what did you do?"), plus systemic questions about other people involved. Not harmful in itself, but it takes the floor and can feel like a takeover.
- **Confrontive inquiry** puts the asker's own idea inside the question ("Didn't that make you angry?", "Why didn't you say something?"). It is advice or judgement in disguise and tends to make people defend themselves. Table 3.1 pairs each diagnostic question with its confrontive twin, which is a useful test for our prompts.
- **Process-oriented inquiry** turns to the conversation itself: "Are we OK?", "Is this working?", "Are we getting too personal?". The authors call this the most powerful way out of an awkward conversation, because it lets both sides reset.

Two points from this chapter matter most for us. First, questions about feelings can be "jumping the gun": "Not everyone is prepared to talk about their feelings or even know what they are." Second, the same words can be humble or accusatory depending on tone and the relationship. The electrical-worker story (a mandatory review after a safety breach) works because "Can you tell me the whole story of what happened that day?" signalled fact-finding, not blame. The canning-line story fails because the supervisor's questions were a hunt for someone to blame.

The book also separates **open from closed questions**. A closed question makes it harder to say "I don't know" and invites a casual guess or withholding "simply to get the conversation over with" (chapter 1). The discussion guide contrasts "What's going on?" with "Everything going okay?".

### 2. Level 1 and Level 2 relationships (chapters 1, 5 and 6)

- **Level −1:** domination.
- **Level 1:** transactional, role-based, with professional distance. Most work relationships.
- **Level 2:** personal, with openness and trust. People know each other well enough to handle surprises.
- **Level 3:** intimacy and friendship.

Humble Inquiry is the invitation from Level 1 towards Level 2. It only works if it is reciprocated and sincere, and it grows through cycles of asking and **revealing something of yourself** (chapter 6). The authors warn that people sense insincerity quickly ("Faux humility comes across loud and clear", chapter 2) and that using Humble Inquiry as a ploy to draw someone out does more harm than good (chapter 6). Chapter 5 adds that casual warmth from someone who is really only transacting confuses the lower-status person, because it implies a personal interest that is not there.

What this means for us: a bot cannot hold a Level 2 relationship and should not pretend to. The honest position is a Level 1 exchange conducted with a humble attitude: open questions, plain acknowledgement, no claimed feelings, and honest self-disclosure of the only kind a bot has (what it is, what it knows, what happens to the answers). Our opening message already does the last part.

### 3. Here-and-now Humility (Introduction, chapters 1, 2 and 8)

Not humility as a personality trait, but the recognition, in the moment, that you depend on the other person for something you cannot get alone. Showing that dependence gives the other person some power, and that temporary "subordination" is what creates enough safety for them to tell you what they know (chapter 2). The introduction ties this directly to speaking up: people withhold or spin when they have not been asked sincerely, do not feel safe bringing bad news, or have spoken up before and got no response or acknowledgement.

For a feedback bot this is the whole product in one idea. The bot, and the organisation behind it, depends on the person's knowledge. Questions should read as "you saw this, I didn't", not as an audit.

### 4. Barriers to asking (chapters 4, 5 and 7)

- **Culture of "do and tell"** (chapter 4): task over relationship, expertise shown by telling, promotion read as licence to tell. Offering feedback or advice feels good to the giver and is often ignored or resented by the receiver.
- **Status and deference** (chapter 5): people read rank first and adjust what they say. Across a hierarchy the higher-status side has to make it safe. Trust starts with acknowledgement, and being ignored is painful. The line most relevant to us: "If we ask for help, we expect either to be helped or to be offered an explanation as to why we cannot be helped."
- **Face**: grant people the self they present. Social life depends on not humiliating each other (chapter 5).
- **The ORJI cycle** (chapter 7): we Observe, React, Judge and Intervene in a split second, and the most dangerous step is the first, acting on what we think we saw. Humble Inquiry is most needed when something makes us anxious or angry: slow down and check what is really going on before acting. The chapter also says that everything, including silence or ending a conversation, is an intervention with consequences.
- **Speed** (chapter 8): "fail fast" suits machines, not people, because relationships are slow to rebuild once damaged. The authors note, drily, that a bot you reprogram is not offended but a colleague is.

### 5. Feedback, listening and responding to disclosure (chapters 1, 2, 6 and the mini cases)

- **Unsolicited feedback is a tell.** People find feedback useful mainly when they asked for it in relation to a goal of their own. "Do you mind if I give you some feedback?" is not a real question (chapter 1). Honest feedback flows only in settings that explicitly suspend the normal rules, and works best when it stays on goals both sides have agreed (chapter 6).
- **People conceal negatives** to protect each other's self-esteem, and soften to the positive when asked for feedback (chapter 6, the Johari window). This is why reviewers give vague answers, and it is a matter of safety rather than effort.
- **Listening as a listener.** Stay "on your own side of the net" until invited over (chapter 2). Do not turn the conversation to yourself, do not advise.
- **Telling people how to feel** is one of the things that makes a tell offensive (chapter 1).
- **Disclosures in the mini cases.** When a friend says their partner never listens, the humble response is "Ouch, I'm sorry to hear that. Can you tell me more?". "Are you sure you want to talk about this right now?" is the process-oriented alternative, checking readiness. "Have you confronted her/him?" is confrontive and "I would call him/her out" is a straight tell (case 3). For a spouse's fight with a neighbour, "Tell me more..." makes it safe to let it out, whilst "Did you win?" is confrontive (case 7). Case 8 warns that inviting feelings in a group can become a vent session with no outcome.
- **Acknowledge, then say what happens next.** In the Morgan and Taylor dialogue (chapter 6) the manager thanks the person for saying something uncomfortable, reassures them it was safe to say, and names a concrete next step. The authors single out that the next step was identified.

## Mapping to the bot

"Now" is the current text in `docs/bot/concerns-playbook.md`, `apps/api/src/lib/bot-references.ts` (reference bodies and `fixedTail`), `reference-path.ts`, `turn-planner.ts` and the intro and closing messages in `conversation-orchestrator.ts`. Proposals are Nick's call.

| Situation | What the book suggests | What the bot does now | Proposed change |
|---|---|---|---|
| **Routine check-in: the opener** | Open, humble question that shows dependence on the other person's knowledge. Be open about the constraint up front (the doctor example in chapter 2: name the time limit, then ask what matters). | Fixed intro says what this is, how long it takes and who sees the answers, then a model-written question anchored to a shared meeting. | **No change to the intro**: it is the bot's honest self-disclosure. For the question, prefer "what" and "how" openers about what they saw ("What stood out to you about how Jon handled the numbers on Tuesday's call?") over evaluative ones ("How did he do?", the README example). |
| **Routine: follow-ups** | Open, not closed; diagnostic at most, never confrontive; "Can you give me an example?" is the book's own example of a humble follow-up (chapter 3). | Planner may ask one follow-up when the reply is vague or lacks an example; no rule on question form. | Add one line to the planner prompt: "Ask open questions (what, how, can you give an example). Never a yes/no question, and never one that suggests the answer or a judgement ('Didn't that...', 'Why didn't you...')." Use table 3.1 pairs as eval cases. |
| **Routine: a weak or vague answer** | Vagueness is often concealment for safety, not laziness (chapter 6). Pushing makes it worse. | One follow-up, then move on. | No change to behaviour. Follow-up wording should make it easy to say less ("Anything specific come to mind? No worries if not."). |
| **Routine: a bad day** (Nick: not a concern) | Grant the self they present (chapter 5). Don't tell them how to feel (chapter 1). A process-oriented offer respects a tired person without probing. | Acknowledge in a few words, carry on. | Keep. Optionally add a process-oriented out when they sound worn down: "Sounds like a long week. Happy to keep this short, or we can skip it today." It carries on by default, so it stays inside Nick's rule. |
| **Routine: the close** | Plain acknowledgement and what happens next. Praise that tells people how to feel, or claims the bot can't stand behind, reads as insincere (chapters 1 and 2). | Closing messages include "Taking time to think about your week is a real strength. Keep it up!" and "Your feedback makes a real difference". | Replace with plain thanks plus what happens next, e.g. "Thank you. This is saved on your Reflections page." Drop evaluative praise. |
| **privacy** | Answer plainly; if you can't help, say why and who can (chapter 5). The bot's honest self-disclosure is its only form of "revealing" (chapter 6). | Facts only; "I don't know" plus who to ask; then re-ask; tail "You can carry on, skip this question, or reply stop at any time." | **No change.** This is already the most book-consistent part of the design. |
| **off_script** | Process-oriented inquiry is the reset tool: "Is this working?" (chapter 3). | One short redirect, then re-ask. Playbook: after two in a row, offer to stop. | When the two-in-a-row offer is built, word it as a process question, not a decision: "Is now a bad time? We can pick this up another day." |
| **wellbeing** | Acknowledge specifically; don't push into feelings ("jumping the gun", chapter 3); stay on your side of the net (no advice); if you can't help, say so and say why (chapter 5); name the next step. The mini cases would add "Can you tell me more?" (see conflicts). | Model writes one or two sentences of acknowledgement, no questions. Tail: "If work's weighing on you, [HR] is there to talk it through[, and there's also EAP]. I can let [Jo] know you'd welcome a chat, but only if you reply yes. Otherwise we'll leave the check-in here for today." | (a) Reference body: add "Reflect back one specific thing they said, in their words. Don't name their feelings for them, and don't claim feelings of your own ('I understand how you feel')." (b) Tail: drop the conditional "If work's weighing on you", which can read as doubting what they have just said. (c) Say the bot's limit openly, as the doctor does: "I'm only a feedback assistant, so I can't help with this myself, but [HR] is there if you'd like to talk it through..." (d) End with an open door rather than a decision: "I'll stop the questions here. We can pick the check-in up another time, and there's no need to reply." |
| **conduct** | Don't judge; confrontive questions ("why didn't you say something?") make people defend themselves (chapter 3); blame-hunting drives people out (canning line). Acknowledge the act of speaking up, because people who got no acknowledgement stop speaking up (Introduction). Be clear what happens next (chapter 6). | Acknowledge it sounds serious; fine to share only what they're comfortable with; never ask what led up to it; no digging. Tail offers to pass it on only with a yes. | (a) Reference body: the acknowledgement should include thanks for raising it ("Thank you for telling me."). (b) Tail: once C1 is decided, say exactly what would be passed on and to whom, so a yes is informed. (c) Keep "never ask what led up to it": the book backs it. |
| **safety** | Nothing clinical. The general points still hold: acknowledge, don't counsel, say plainly what happens next and what doesn't. | One or two caring sentences, then fixed wording: named contact will check in, told only that a check-in may be welcome; Samaritans line pending; stop. | **No wording change from this book.** It is the wrong source for this level (see Limits). |
| **After a "yes"** (any level) | Acknowledge and confirm the next step (chapter 6); if you asked for help you expect help or an explanation of why not (chapter 5). | Not built: escalation is not wired. | Behaviour: never offer an action that isn't wired. After a yes, confirm exactly what was done ("Done: I've let Jo know you'd welcome a chat. I haven't passed on anything you wrote."). |

## Where the book pulls against decisions already made

Flagged, not overridden. The first two are Nick's decisions; the rest are playbook defaults still marked as proposals.

1. **"Do not over-flag a bad day" (Nick).** Mostly supported: granting the self people present (chapter 5) argues for treating "shattered" as ordinary. The tension is small: the book's instinct on hearing "rough week" is a light open question ("What's been going on?"), not acknowledge-and-move-on. With a three-exchange cap and a feedback purpose, I would not change the rule. The optional "keep it short or skip" line above is the nearest book-consistent move that stays inside it.
2. **"Wording stays work-relevant; we are not a crisis service" (Nick).** Supported on the "don't counsel" side (stay on your side of the net). But the book's whole mechanism for trust is moving towards Level 2 through personal questions and self-revelation, which a work-only bot deliberately does not do. The note's reading is that this is fine: the book also says professional distance is a legitimate choice (chapter 2), and a bot faking Level 2 would fail the sincerity test. It does mean the book's strongest claims about trust apply less to us than to a human manager.
3. **"Do not ask them to explain more" and "do not dig for details" (playbook, wellbeing and conduct).** This is the clearest conflict. The mini cases (3 and 7) treat "Can you tell me more?" as the humble response to a disclosure. I would keep the playbook rule, for reasons outside the book: the bot cannot follow through on what it hears, every extra detail becomes stored data, and a friend over a glass of wine is a Level 2 setting we are not in. But Nick should know the book points the other way.
4. **"When unsure between wellbeing and safety, choose safety" (playbook).** The ORJI chapter argues for checking what is really going on before acting on an ambiguous observation, which would suggest a gentle clarifying question instead of routing straight to the safety response. This is a clinical question the book cannot settle, and "a false alarm is recoverable, a miss is not" is a reasonable safety principle. Leave it for the clinical reviewer.
5. **"Stop the feedback questions" after a serious concern (playbook).** The book would ask rather than decide ("Would you rather stop here?", process-oriented inquiry). Keeping the stop is defensible; the proposal above only changes the wording so it leaves the door open instead of closing it.

No conflict with "never contact emergency services" or "Opus 5.5 for serious concerns": the book is silent on both.

## Limits

- **It is a leadership and relationship book, not clinical, HR or legal guidance.** Its "psychological safety" (from Edmondson, cited in the notes) means feeling safe to speak up at work, not risk of harm. Nothing in it covers suicide risk, self-harm, crisis response, safeguarding, harassment procedure or data protection.
- **It is about humans with a relationship to build.** Several of its central moves (self-revelation, Level 2, sincerity read from body language and tone) do not transfer to a bot. I have used them only as a reason for the bot to be honest about what it is.
- **It warns against scripts.** Using it to write fixed wording is a stretch it would not endorse. The proposals above take its stance and its question classification, not tested phrases.
- **Its examples are illustrations, not evidence.** The book reports stories and the authors' consulting experience, with no trials or measured outcomes. I haven't found anything in it that could be cited as evidence a particular phrase works.
- **US-centred.** Chapters 4 and 5 are explicitly about US culture. Our beta is UK.
- **No page numbers** in the e-book; references are by chapter.

### Other sources needed

I haven't read or checked any of these for this note; they are candidates for the next round.

- **Safety level (most urgent):** Samaritans' guidance for workplaces and their safe messaging guidance; NHS or Mind material on responding to someone who mentions suicide; Mental Health First Aid England's approach (which, as I understand it, encourages asking directly and calmly, something to verify). This level also needs the HR or clinical reviewer the playbook already calls for; no book replaces that.
- **Wellbeing level:** HSE Management Standards for work-related stress; Mind's workplace wellbeing resources; CIPD guidance on health and wellbeing at work. Motivational interviewing's reflective listening (open questions, affirmations, reflections, summaries) would give more concrete wording rules for acknowledgement than Schein does.
- **Conduct level:** Acas guidance on bullying, harassment and grievances; the Equality Act 2010 as amended by the Worker Protection Act 2023 (employer duty to prevent sexual harassment; check the current position); whistleblowing law (PIDA 1998) for reports that are really disclosures.
- **Feedback itself:** Schein's *Helping* (2009, cited in the notes), which is closer to "someone asks you for help"; Edmondson's *The Fearless Organization* on speaking up; Stone and Heen's *Thanks for the Feedback* on the receiving side; Kluger and DeNisi's 1996 meta-analysis on when feedback interventions backfire.
