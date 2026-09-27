# The Coaching Habit: what it suggests for the bot's wording (research, 2026-09-27)

Status: **proposal for Nick's review** (2026-09-27). Nothing in the playbook, prompts or code has changed. Second source in the "wording from established literature" work, after `humble-inquiry.md`. The last two sections compare the two books and merge their proposals.

**Source:** Michael Bungay Stanier, *The Coaching Habit*, Box of Crayons Press, Toronto, © 2016. E-book ISBN 978-0-9784407-5-6 (paperback 978-0-9784407-4-9). The e-book metadata gives a publication date of 2015-10-21 and a modification date of 2016-02-17, and the printing line starts at 2016, so this is the original edition in its first printing. The book doesn't call itself a first edition, and I haven't checked whether a later revised edition exists. Read in full: introduction, the habit chapter, chapters 1–7, the eight "Question Masterclass" interludes, the 1-2-3 combination, the conclusion and the source list. The e-book has no page numbers, so references are by chapter or masterclass.

Quotes are kept to a phrase or a sentence. Everything else is paraphrase.

## What the book is, in one paragraph

A short, practical book for managers who give too much advice. The argument is that a manager who asks a few good questions, then stays quiet and listens, gets better answers and ends up with a less dependent team. It rests on seven questions, eight craft tips about how to ask, and a habit-forming method (trigger, old habit, new behaviour). It is written in a breezy, jokey register and draws on popular neuroscience and behavioural economics, with a short list of cited studies at the back. Like Schein's book, it is about ordinary work conversations between colleagues. It says nothing about distress, risk or misconduct, and it is about **coaching**, where the person being coached owns the problem. A Revualy check-in is closer to a short structured interview than a coaching session, which limits how much of it transfers.

## Core ideas that bear on the bot

### 1. The seven questions (chapters 1–7)

- **Kickstart** (chapter 1): "What's on your mind?" The author says it is open enough to let people choose what matters, but focused enough to skip small talk and the standing agenda. He contrasts it with the "Default Diagnosis", where both sides assume they know what the conversation is about.
- **AWE** (chapter 2): "And what else?" The first answer is rarely the only or the best one. The question also stops the asker jumping in with advice (the "Advice Monster"). He suggests asking it three to five times and treating "there is nothing else" as success. "Is there anything else?" is the gentler form that invites closure whilst leaving the door open.
- **Focus** (chapter 3): "What's the real challenge here for you?" The words "for you" keep it about the person in front of you, not a third party. He names three ways conversations go foggy: too many challenges at once, talking about someone who isn't there ("Coaching the Ghost"), and abstraction.
- **Foundation** (chapter 4): "What do you want?" It draws on Peter Block's idea of an adult relationship as being "able to ask for what you want, knowing that the answer may be No". The chapter also sets out the TERA model (below).
- **Lazy** (chapter 5): "How can I help?" It draws on Schein's *Helping*: offering help raises your status and lowers theirs. It also uses the Karpman Drama Triangle (Victim, Persecutor, Rescuer), where most managers default to Rescuer. Asking stops you assuming you know what help is wanted. The chapter adds that you don't have to say yes to the answer: you can say no, offer something else, or take time.
- **Strategic** (chapter 6): "If you're saying yes to this, what are you saying no to?" Mostly about workload. Little bearing on the bot.
- **Learning** (chapter 7): "What was most useful for you?" People learn by recalling and reflecting, not by being told. It is placed at the end because endings shape how a conversation is remembered (Kahneman's peak-end rule). Tellingly, the chapter lists "you tell people how wonderful they are" among the endings to replace.

### 2. How to ask (the eight masterclasses)

1. **Ask one question at a time.** Several in a row feel like an interrogation.
2. **Cut the intro and ask the question.** If a lead-in is needed, "Out of curiosity" lightens the question.
3. **No fake questions.** "Have you thought of…?" is "advice with a question mark attached". If you have an idea, offer it as an idea.
4. **Ask "what", not "why".** "Why" puts people on the defensive and is usually a hunt for detail so you can fix things: "If you're not trying to fix things, you don't need the backstory." He gives rewrites, such as "What were you hoping for here?" in place of "Why did you do that?".
5. **Get comfortable with silence.** Don't fill a pause with another question or the same one reworded.
6. **Actually listen**, rather than performing listening.
7. **Acknowledge the answers you get**, briefly, before the next question. His own examples are short approving words ("Nice", "Yes, that's good"). He says the acknowledgement is not about judging but about showing you heard.
8. **The questions work just as well in writing**: email, chat, instant messages.

### 3. TERA: why questions feel safe or unsafe (chapter 4)

The author's model of what makes a conversation feel safe or risky. The brain checks the situation constantly and, when unsure, reads it as unsafe. Four things drive that reading:

- **Tribe:** are you with me or against me?
- **Expectation:** do I know what happens next?
- **Rank:** am I being made to feel smaller?
- **Autonomy:** do I get a say?

He argues that asking raises tribe, rank and autonomy, whilst lowering expectation a little because a question is more open than an answer. This is the book's closest point to Schein's psychological safety, and the most useful idea for the concern levels. People who have just said something difficult need to know **what happens next** (expectation) and to feel they have a **choice** (autonomy). The underlying neuroscience is presented loosely (see Limits), but the four headings work as a checklist whatever their basis.

### 4. Where advice still belongs (chapters 3 and 5)

The book is not against answering. If someone asks where the folder is, tell them: coaching a plain factual request is just annoying. A manager's job still includes having answers. The book's aim is to stop advice being the default, not to ban it.

### 5. What it says about difficult moments

Almost nothing directly. The closest material is:
- The Drama Triangle's Rescuer, who jumps in to fix things, feels indispensable and ends up creating the Victims they rescue (chapter 5).
- The warning against drifting into talk about an absent person, which the author calls gossip ("Coaching the Ghost", chapter 3).
- The rule that you don't need the backstory unless you are trying to fix things (masterclass 4).
- TERA's point that uncertainty about what happens next reads as danger (chapter 4).

## Mapping to the bot

"Now" refers to the same files as the Humble Inquiry note: `docs/bot/concerns-playbook.md`, `apps/api/src/lib/bot-references.ts` (reference bodies and `fixedTail`), `reference-path.ts`, `turn-planner.ts`, and the intro and closing messages in `conversation-orchestrator.ts`.

| Situation | What the book suggests | What the bot does now | Proposed change |
|---|---|---|---|
| **Routine: the opener** | Open but focused (Kickstart). Cut the preamble (masterclass 2). Say what happens next and give people a say (TERA). | Fixed intro (what this is, how long, who sees what), then one model-written question anchored to a shared meeting. | Keep the intro: it is the "expectation" part of TERA. **Add autonomy up front:** one short clause in the intro, "You can skip any question or reply stop", which today appears only after a privacy question. For self-reflection, a Kickstart-style first question fits well: "What's been on your mind at work this week?" |
| **Routine: question form** | One question at a time; no fake questions; "what", not "why" (masterclasses 1, 3, 4). | Planner prompt already says "ONE focused question". Nothing on "why" or on advice dressed as a question. | Add to the planner prompt: "Start questions with what or how, not why. Never put a suggestion inside a question ('Have you thought about…')." Add a few "why" and fake-question cases to the eval. |
| **Routine: follow-ups** | "And what else?" draws out more. "For you" keeps it about the speaker's own experience (chapters 2 and 3). | One follow-up at most per theme, when the reply is vague or lacks an example. | Keep the cap (Nick's contact limits). In **peer reviews**, a "for you" follow-up grounds a vague comment about a colleague in the reviewer's own experience: "What was the effect of that on your work?" This also counters the gossip drift the book warns about. |
| **Routine: acknowledging an answer** | Acknowledge briefly before moving on (masterclass 7). | Planner: "build on what they just shared"; no explicit acknowledgement rule. | Brief acknowledgement that shows the answer was heard, **without rating it** (see the disagreement with Schein below). In a peer review, "Great!" after a criticism of a colleague would read as the bot agreeing. Prefer a specific reflection ("That handover sounds like it cost you a day.") to a verdict ("Good one."). |
| **Routine: a weak or vague answer** | Treat "there is nothing else" as success; don't fill the silence with the same question reworded (chapter 2, masterclass 5). | One follow-up, then move on. | No change in behaviour. When the person says there is nothing more, accept it and move on without re-asking. |
| **Routine: a bad day** (Nick: not a concern) | Don't chase the backstory (masterclass 4); autonomy (TERA). | Acknowledge in a few words, carry on. | Keep. Supports the Humble Inquiry proposal to offer, optionally, to keep it short or skip today. |
| **Routine: the close** | End on reflection, not praise (chapter 7). Endings shape memory (peak-end rule). "Is there anything else?" closes whilst leaving the door open (chapter 2). | Fixed closing messages with praise ("a real strength. Keep it up!", "Your feedback makes a real difference"). | Replace the praise with plain thanks and what happens next (as in the Humble Inquiry note). For **self-reflection only**, the last question can be a Learning Question: "What's one thing from this week you want to remember?" Peer and pulse check-ins stay a plain close: the reviewer is not being coached. |
| **privacy** | Answer factual questions directly: don't coach a request for information (chapter 3). Expectation (TERA). | Facts only, "I don't know" plus who to ask, re-ask, then "carry on, skip, or stop". | **No change.** The book backs answering plainly. |
| **off_script** | One question at a time; when things are stuck, ask what the person wants (chapter 4). | One redirect, then re-ask; after two in a row, offer to stop (playbook). | When the two-in-a-row offer is built, make it a real choice: "Is now a bad time? We can pick this up another day." (Same as the Humble Inquiry proposal; "What do you want?" is too blunt from a bot.) |
| **wellbeing** | Don't rescue (chapter 5). Don't chase the backstory (masterclass 4). Say plainly what you can and can't do, and offer an alternative ("I can't do that, but I could…", chapter 5). Expectation and autonomy (TERA). | One or two sentences of acknowledgement, no questions; fixed text offers HR and EAP and a yes-only message to HR, then "we'll leave the check-in here for today." | Supports the Humble Inquiry proposals: reflect back one specific thing they said; state the bot's limit ("I'm only a feedback assistant, so I can't help with this myself, but…"), which is the book's "can't, but could" shape; end with an open door. **New:** the fixed text should say in one clause what happens next in each case (yes: HR gets only that they'd welcome a chat; no reply: nothing is sent). |
| **conduct** | "What", not "why", and no backstory (masterclass 4). Don't rescue. Expectation and autonomy (TERA). | Acknowledge; never ask what led up to it; don't dig; offer the HR route, pass on only with a yes. | Keep "never ask what led up to it": masterclass 4 backs it directly. Supports the Humble Inquiry proposals: thank them for raising it, and once C1 is decided, state exactly what would be passed on and to whom. |
| **safety** | Nothing clinical. | Caring sentence, fixed text: named contact will check in (told only that a check-in may be welcome), Samaritans line pending, stop. | **No wording change from this book.** TERA's "expectation" supports the existing clause saying what the contact is told and not told. |
| **After a "yes"** (any level) | Expectation (TERA): say what happens next. | Not built: escalation is not wired. | Confirm exactly what was done and what wasn't passed on (same as the Humble Inquiry proposal). |

## Where the book pulls against decisions already made

Flagged, not overridden.

1. **Three exchanges per check-in (Nick, contact limits).** The book's central move is to ask "And what else?" three to five times. That conflicts with the cap and with the product's promise of a two-to-three-minute check-in. I would keep the cap. The book's gentler "Is there anything else?" could go in the last exchange where it fits, and "there is nothing else" counts as a good ending, not a failure.
2. **Peer reviews are about a colleague.** This is a product decision rather than one of the playbook rules, but it is the sharpest tension. The book says you can only coach the person in front of you, and that long talk about an absent third person is gossip ("Coaching the Ghost"). A peer review is, by design, talk about someone who isn't there. The book's advice doesn't argue against peer reviews: it isn't about collecting feedback. But its warning is worth keeping in the prompt. Anchoring to a shared meeting and asking about the effect on the reviewer's own work ("for you") keeps answers specific and less like gossip.
3. **"Do not ask them to explain more" (playbook).** Here the book is on the playbook's side. "And what else?" would dig, but masterclass 4 is explicit that you don't need the backstory unless you are fixing the problem, and the bot is not fixing it. No conflict in practice.
4. **"Keep it work-relevant" (Nick).** Agrees. The book is entirely about work, and its move from "project" to "people" to "patterns" (chapter 1) stays within work.
5. **"Don't over-flag a bad day" (Nick).** Agrees: no backstory, and give people a say.
6. **"Never contact emergency services" and "Opus 5.5 for serious concerns" (Nick).** The book is silent on both.

## Limits

- **It is a coaching book for managers, not clinical, HR or legal guidance.** It covers nothing on suicide risk, self-harm, safeguarding, harassment procedure or data protection. The wellbeing and safety levels need the sources listed in the Humble Inquiry note, and the clinical or HR reviewer the playbook already asks for.
- **Coaching is not what the bot does.** Coaching assumes the person owns a problem and the coach helps them think it through. In a peer review the reviewer is a witness, not a coachee. Only self-reflection check-ins are close to a coaching conversation. I have used the book mostly for its craft rules (how to ask), which transfer, and less for its seven questions, which mostly don't.
- **The evidence is thin and loosely reported.** The "Box of Crayons Lab" sections cite a handful of studies (listed at the back), mostly single papers summarised in a sentence, alongside popular neuroscience ("five times a second", the "amygdala hijack", TERA). The doctor-opening-question studies (Heritage and Robinson, 2006) are the most relevant to us, since they compare general and specific opening questions. I haven't read any of the cited papers. TERA is useful as a checklist; I wouldn't cite it as evidence.
- **It is also a sales book** for the author's training programme, and its tone is deliberately jokey. Neither matters for wording rules, but both are reasons to take the confident claims ("almost fail-safe", "the best coaching question in the world") as enthusiasm, not findings.
- **No page numbers** in the e-book; references are by chapter or masterclass.

## Agreement and disagreement with the Humble Inquiry proposals

Mostly agreement. The two books come at the same idea from different ends: Schein from relationships and humility, Bungay Stanier from manager habits. Bungay Stanier cites Schein's *Helping* in chapter 5 and lists it on his "top shelf".

**Where they agree**
- **Open questions, no leading or disguised questions.** Schein's "confrontive inquiry" and Bungay Stanier's "fake questions" (masterclass 3) are the same thing. Bungay Stanier adds a concrete rule Schein doesn't state: "what", not "why".
- **Don't rush to advise or rescue.** Schein's "telling" and "staying on your side of the net"; Bungay Stanier's Advice Monster and Rescuer.
- **Don't dig for backstory after a disclosure.** Schein's warning that feelings questions can be "jumping the gun"; Bungay Stanier's "you don't need the backstory". Both support the playbook's no-digging rule for wellbeing and conduct. That makes the Humble Inquiry mini cases ("Can you tell me more?") the outlier, not the norm.
- **No praise at the close.** Schein: don't tell people how to feel. Bungay Stanier lists telling people "how wonderful they are" as the ending to replace.
- **Answer factual questions directly.** Schein: explain why you can't help if you can't. Bungay Stanier: tell them where the folder is.
- **Say what happens next.** Schein's Morgan and Taylor dialogue names the next step; Bungay Stanier's TERA "expectation".
- **Give people a real choice.** Schein's process-oriented inquiry ("Is this working?"); Bungay Stanier's autonomy and "What do you want?".

**Where they differ**
- **Acknowledgement.** Bungay Stanier recommends short approving words after each answer ("Nice", "Yes, that's good"). Schein would treat those as mild telling, and in a peer review they can read as the bot endorsing a criticism of a colleague. The merged proposal takes Bungay Stanier's instruction to acknowledge and Schein's caution about judging: reflect back something specific, don't rate it.
- **How hard to draw people out.** Bungay Stanier pushes for more ("And what else?" three to five times; "trust me, the person will have something"). Schein is more cautious about pushing people who are holding back for good reasons. With a three-exchange cap, Schein's caution wins by default; Bungay Stanier contributes the view that "there is nothing else" is a fine ending.
- **What a check-in is.** Schein's frame (building a relationship) and Bungay Stanier's (coaching the person in front of you) both fit a bot awkwardly. Schein's warning about fake intimacy is the more useful one for us. Bungay Stanier's "Coaching the Ghost" is the more useful warning for peer reviews specifically.
- **Evidence style.** Schein relies on consulting stories; Bungay Stanier on popular science and a few cited studies. Neither is strong evidence for specific wording.

## Merged list of proposed changes (both books)

Marked **HI** (Humble Inquiry), **CH** (The Coaching Habit) or **both**. All are proposals for Nick; none changes a decision he has already made.

**Routine turns**
1. Open questions only. Start with "what" or "how", never "why". No yes/no questions, and no suggestion or judgement dressed as a question ("Didn't that…", "Have you thought about…"). **Both** (the "what, not why" rule is **CH**).
2. One question per message. Already in place. **CH**.
3. Opener question about what the person saw, not an evaluation of the colleague: "What stood out to you about how Jon handled the numbers on Tuesday's call?" rather than "How did he do?". **Both.**
4. Add "You can skip any question or reply stop" to the fixed intro, so autonomy is there from the start rather than only after a privacy question. **CH** (TERA autonomy); consistent with **HI**.
5. Self-reflection: an open-but-focused first question ("What's been on your mind at work this week?"). **CH.**
6. Peer-review follow-ups: ground vague comments in the reviewer's own experience ("What was the effect of that on your work?"). **CH** (the "for you" framing, Coaching the Ghost).
7. Acknowledge each answer briefly by reflecting something specific, never by rating it. **Both** (CH to acknowledge, HI not to judge).
8. Vague answers: make it easy to say less ("No worries if not"). Accept "nothing else" as a good ending, and don't re-ask the same question reworded. **Both.**
9. Bad day: keep acknowledge-and-carry-on (Nick), optionally offering to keep it short or skip today. **HI**, supported by **CH** (autonomy).
10. Closing messages: plain thanks plus what happens next, with no praise. **Both.**
11. Self-reflection close only: a Learning Question ("What's one thing from this week you want to remember?"). **CH.**
12. Eval: add cases for "why" questions, fake questions, and confrontive twins of diagnostic questions (Schein's table 3.1). **Both.**

**Concern levels**
13. Privacy: no change. **Both.**
14. Off-script, the two-in-a-row offer: word it as a real choice ("Is now a bad time? We can pick this up another day."). **Both.**
15. Wellbeing reference body: reflect back one specific thing they said; don't name their feelings; no "I understand how you feel". **Both.**
16. Wellbeing fixed text:
    - Drop "If work's weighing on you". **HI**
    - State the bot's limit and the alternative: "I'm only a feedback assistant, so I can't help with this myself, but…". **Both** (Schein's constrained doctor; Bungay Stanier's "can't, but could").
    - Say what happens in each case (yes, or no reply). **CH** (expectation), consistent with **HI**.
    - End with an open door rather than a decision. **Both.**
17. Conduct:
    - Keep "never ask what led up to it". **Both.**
    - Thank them for raising it. **Both.**
    - Once C1 is decided, state exactly what would be passed on and to whom. **Both.**
18. Safety: no wording change from either book. Needs clinical sources and review. **Both.**
19. After any "yes": confirm exactly what was done and what wasn't passed on. Never offer an action that isn't wired. **Both.**
