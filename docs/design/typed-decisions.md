# Typed decisions

Status: **proposal, primitive built, nothing wired in** (2026-09-26). The order below waits on calibration results from the box.

## Why

Nick looked at Jev (TypeSafe AI), a "System One" model that returns typed values with a calibrated confidence instead of text. We are not adopting it. We want the same shape built from what we already run: a deterministic layer driven by a reasoning model. The model makes one typed decision and says how sure it is; code decides what happens next. For alpha and beta, quality is king and token cost is a low priority.

An independent test of Jev found it overconfident in the 0.7 to 0.9 range. A confidence number is only useful if 0.9 means right about 9 times in 10, so we measure that before any threshold goes live.

## What is built

In `packages/ai-core`:

- **`decide()`** (`decide.ts`). Input: a spec (a name, the question, either a fixed set of options each with a description or a score range with optional anchors, guidance, and the context as a string or a message list), plus a tier and effort. Output: the choice or score, a confidence from 0 to 1, and a short rationale kept for audit only. The API enforces a JSON Schema and the result is validated again in code. Invalid output, a cut-off reply or a failed call is retried (three attempts by default); after that the caller gets `{ ok: false, reason }`, never an exception. A refusal is not retried. Default effort is none on fast, medium on standard, high on advanced; any level can be set, including `xhigh` and `max`. Deeper effort gets more thinking room in the request.
- **Policy** (`policy.ts`). The caller declares rules, for example "accept `none` only at 0.9 or above, send privacy and off-script to the standard reference path, anything else escalates". `applyPolicy()` returns the action and which rule fired. Pure, so every branch is unit-tested without a model.
- **Calibration** (`calibration.ts`). `reliability()` buckets (confidence, correct) samples into bands and reports accuracy per band, the gap between confidence and accuracy, expected calibration error and Brier score.

In `apps/api/eval`:

- **`decide-calibration.ts`** runs the concern decision through `decide()` over the snapshots, rewrites and topic grid, repeated, and reports the reliability tables, a threshold sweep for accepting `none`, consistency across repeats, every wrong answer at 0.9 or above, and agreement with the turn planner's own concern flag. `--dry-run` uses a fake model, so it runs in CI without a key.
- **`lib/concern-decision.ts`** is the concern decision as a spec, with the same six labels and definitions as the turn planner's prompt.

Tests: `apps/api/src/lib/__tests__/decide.test.ts` (22 tests).

## Which calls should move, and in what order

### 1. Concern routing (first)

Today the turn planner returns `concern` in the same structured reply as the next question, and anything but `none` goes to the reference path. There is no confidence, so we can't tell a confident `none` from a coin toss.

Proposal:

1. **Shadow.** Run `decide()` on the concern alongside the planner (in parallel, so the turn is no slower) and log both. No behaviour change.
2. **Gate.** Route with a policy: accept `none` only above a threshold that calibration supports; otherwise escalate. Keep the planner's own flag as a second opinion: if either flags a concern, the turn escalates. That trades some over-routing for fewer misses, which is the right way round (missing a safety concern is the worst error; over-flagging a bad day is the next worst).
3. Only then consider dropping `concern` from the planner's schema.

It goes first because the stakes are highest, the labels and test set already exist, and the confidence is directly usable by a threshold.

What it costs: one extra model call per turn, run in parallel. At standard tier with medium effort that is small; at advanced tier with high effort it is slower and dearer, and the gateway's 60 second timeout may need a separate limit for decisions.

### 2. Sensitivity of calendar proposals

The calendar model returns `sensitivity: low | medium | high` inside each proposal, and the code gate rejects `high`. Moving it to a score decision (1 to 5 with anchors, plus confidence) per accepted proposal lets the gate reject "medium but unsure" as well. It runs nightly, so latency does not matter, and a wrong rejection only costs one proposal. Low risk, easy to measure against `calendar-model.ts` fixtures.

### 3. Ticket context proposals

Not built yet (privacy step 3, `docs/design/privacy-and-agent-access.md`). The job agent proposes context items for a ticket and a code gate checks them against a fixed policy. Each proposed item fits `decide()` naturally: include or exclude, with a confidence, and the policy gate still has the last word. Designing tickets on `decide()` from the start is cheaper than moving them later.

### 4. Reply quality (last, perhaps never)

`quality: answered | weak` only decides whether to ask one follow-up, and the planner writes the next question to match the action in the same reply. Splitting it out adds a call for little gain and could leave the question out of step with the decision. Move it only if calibration of the planner shows its quality judgement is poor.

## What calibration has to show first

Numbers for Nick to set; these are suggestions:

- At the chosen threshold, **no missed safety cases** across all repeats of the safety snapshots and their rewrites.
- Over-routing of ordinary turns (critical feedback, bad days) below about 10% at that threshold.
- The reliability table's gap within about 0.05 in the 0.8 to 1.0 bands. If the model is overconfident there, as Jev was, set thresholds from the measured accuracy, not the stated confidence.

## Limits I know about

- The test set is small: about 150 inputs, of which about 35 are real concerns. Repeats of the same input are not independent samples, so the per-band numbers are noisy, especially in the bands with a handful of cases.
- Expectations are a person's judgement (2026-09-26), not ground truth. Where two labels are allowed, both count as right.
- The confidence is what the model says, not a probability from the model's internals. If it proves poorly calibrated, the fallback is self-consistency: ask several times and use agreement as the confidence. That multiplies cost, which is acceptable for alpha and beta.
- Frozen snapshots are not live traffic. Shadow mode is what tells us how it behaves on real conversations.
- I haven't run it against the real API. The dry run only proves the script and report work.

## Decisions for Nick

1. Thresholds for concern routing, once the first calibration run is in.
2. Whether the planner's flag stays as a second opinion (either flags, escalate) or `decide()` replaces it.
3. Tier for the concern decision: standard with medium effort, or advanced with high effort. The script can compare both in one run (`--configs standard:medium,advanced:high`).
4. Whether reply quality moves at all.
