# Privacy step 3: tickets and the job-agent gate

Status: merged 2026-09-26, not reviewed
Commits: 93a0d44, ead2628, e50f8c1 (merged 11e749c) · Migration: 0044 · Design: `docs/design/privacy-and-agent-access.md` ("Agent access: the air gap")

## What and why
The conversation engine gathered context for each turn with full database access, so a bug or an injected instruction could in principle pull in anyone's data. Now each conversation gets a ticket prepared by the job side, and the chat side reads context only from its ticket. A job agent proposes what goes in; a code gate decides.

## What changed
All under `apps/api/src/lib/tickets/`:
- **`policy.ts`**: the gate, a pure function encoding the design's policy table. Proposals name who an item is about by role ("subject", "reviewer", "pair"), never an id. It drops wrong categories and roles, and checks the one free-text "angle" for other people's names, emails, ids, sensitive wording and length. Required items are always added.
- **`agent.ts`**: the job agent (standard tier, structured output, one retry); null when the model is down, and the deterministic default is used.
- **`prepare.ts`**: `prepareTicket` (the context gathering that used to live in `initiateConversation`): agent, then gate, then fetch only the accepted items, scoped to the ticket's people. Also `attachTicket`, `markTicketDoneForConversation`, `expireTickets` (wipes context), and `prepareTicketForConversation` for conversations opened before this change.
- **`reader.ts`**: `TicketHandle`, the chat side's only context access: `context`, `turns()`, `appendTurn(tx, content)`, `markDone(tx)`. No method takes an id.
- **`writeback.ts`**: result schema and writable fields per ticket type; `writePeerFeedback()`; `writeBackForConversation` validates and marks the ticket written back.
- **Wiring**: `conversation-orchestrator.ts` prepares then opens the ticket; the opening message and every turn read subject name, themes, verbatim flag, meeting, focus and history from it. Tickets are marked done on close and on `markIncomplete`. Sweeper step 8 expires tickets. The analysis worker calls write-back after `runAnalysisPipeline`.
- **Migration 0044**: `tickets` (encrypted JSON context, type, reviewer, subject, unique conversation with ON DELETE CASCADE, status, preparer, gate log without content, expiry).

## Where it differs from the design
- **Write-back doesn't write feedback yet.** The analysis pipeline still writes `feedback_entries` (now under the pseudonym, from step 2). Wiring the ticket's peer sink as well would write each entry twice, so it's left unwired on merge. Moving the write into write-back is a follow-up.
- Chat-side code still writes `conversation_theme_outcomes` and `checkin_jobs` status directly (nothing reads context back through them).
- Opening messages and prompts now use first names only, per the policy.

## How it was tested
- `src/lib/__tests__/ticket-policy.test.ts` (14): every refusal, stored-injection proposals, personal and 1:1 rules.
- `src/lib/__tests__/ticket-air-gap-static.test.ts` (7): parses `reader.ts`, `turn-planner.ts`, `reference-path.ts` with the TypeScript parser; no parameter, member or schema property names a person id; planner and reference path don't import the database.
- `src/__tests__/ticket-air-gap.integration.test.ts` (8): a ticket for Priya about Jon, prepared by a job agent fooled into asking for everything, holds none of Sam's data, Jon's other feedback, Jon's self data or 1:1 content; stored injection via a calendar job's reason and via Priya's own message; model-down default; lifecycle to expiry; invalid result refused.
- Existing engine, sweeper, theme-outcome, meeting-anchor and calendar-model tests pass unchanged.
- **Not run:** a real model as the job agent; the eval harness against the ticket-based engine.

## Review checklist
- [ ] Read `policy.ts` against the design's policy table; try to construct a proposal that gets another person's data past it.
- [ ] Confirm nothing in `turn-planner.ts`, `reference-path.ts` or the turn path of `conversation-orchestrator.ts` queries tier A to C tables directly.
- [ ] Check what the job agent sees (meeting label, calendar model's reason and focus): is anything there person-written text that could carry an injection beyond what the gate handles?
- [ ] Re-run the eval harness (topic grid) on the box to confirm first-name prompts didn't shift bot quality.

## Not done / limits
- Feedback write moves into ticket write-back (see above).
- Tickets don't store turns; turns stay the conversation's messages, reached through the handle.
- Personal goals and focus areas are fetched into personal tickets but not used in prompts yet.
- Nothing creates 1:1 follow-up tickets yet.
- The reference path isn't called by the orchestrator yet, so its ticket wiring is only its input type.

## Decisions pending
- Should the peer job agent see previous feedback themes about the subject? Recommendation: not until the release rule applies to it too.
- Ticket life: 7 days from preparation, reset on done; expiry wipes context. Recommendation: keep.

## Later changes
