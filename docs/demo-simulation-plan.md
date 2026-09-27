# Demo tenant and a simulated month

Status: agreed 2026-09-28, in progress (step 1). Nick's decisions: run on the staging box first, then provision a Railway demo tenant from the result; a faked clock stepping a day at a time; the real models for the bot, analysis and calendar model, a local model for the 100 simulated people.

## Why
Everything is tested in pieces, but nothing has run for weeks with a real-sized organisation. Contact limits, fortnightly releases, streaks, digests, retention and the calendar model all interact over time. A simulated month shows whether they do the right thing together, and its output is a believable demo tenant, not mock data.

## Steps

1. **Clock spike.** Prove `libfaketime` works across the API and worker (Node), Postgres (`now()`, `clock_timestamp()`) and Redis (BullMQ delays, TTLs), set to a date and stepped forward a day at a time on the staging box. If any part can't be faked, decide the fallback before building on it.
2. **Organisation generator.** 100 people, deterministic from a seed:
   - roles: leadership, about 12 managers in two or three levels, an admin, a super admin, the HR support contact
   - structure: teams, reporting lines, core values, question sets, a goal cycle with goals
   - calendars: realistic meetings (stand-ups, 1:1s, project calls, all-hands)
   - persona per person: responsiveness, length, tone, preferred time, quiet days
3. **Fake integrations:**
   - Chat: the internal simulator adapter.
   - Calendar: generated events written to `calendar_events`.
   - 1:1 notes: a fake `MeetingSource` serving generated Gemini-style notes for scheduled 1:1s.
   - Email: captured to a table or file, never sent.
4. **Personas.** A local model on the box's GPU writes each person's replies from their persona and the conversation, through the OpenAI-compatible provider. Scripted edge cases, each on a set day:
   - never replies; terse; off-topic three times; asks who sees their answers
   - a wellbeing disclosure; a possible-risk disclosure; a conduct report
   - a late addition; says stop, then starts again
   - a manager who runs weekly 1:1s and uploads notes
   - an admin who uses break-glass once
5. **Day driver.** For each simulated day:
   - set the clock
   - run the nightly calendar model and the scheduling pass
   - let check-ins go out at people's preferred times, with persona replies at realistic delays
   - run the sweeper, analysis, weekly digests on Mondays, and the fortnightly releases
   - take a snapshot of the checks

   Resumable from any day.
6. **Checks.**
   - **Every day:**
     - ops status green
     - no stuck work
     - contact limits held (at most one peer and two personal check-ins a week)
     - feedback reaches subjects only after release with 3 or more reviewers, and never names a reviewer
     - support conversations never analysed or kept
     - every finished conversation analysed
     - streaks and engagement correct
   - **At the end:** Playwright walks the dashboards for one person in each role; a report of costs, latency, the model fallback rate, and what each persona experienced.
7. **The month run.** Fix what breaks, rerun until clean.
8. **The demo tenant.** Provision on Railway from the clean month (data exported from staging, or the same simulation run there), with the Railway checks from `docs/real-workspace-checklist.md` section 1.

## Before anyone outside sees the demo
- Nick's two privacy decisions (flagged items; org-wide export), because the demo would show both.
- A current Anthropic key for the run (the eval key on the box expires around 3 October).
- Integration tests that fail rather than skip when the database is expected (backlog).

## Cost and limits
- Roughly $20-40 of API spend per month-run for the bot, analysis and calendar model. Not measured at this scale; the first days of the run will tell us.
- Personas from a local model write less naturally than people. The run tests mechanics, limits and privacy rules; it's weaker evidence for how real people will feel about the bot.
- The simulation doesn't exercise Google itself (Chat, Calendar, Meet); `docs/real-workspace-checklist.md` still covers that.
