# Typed decision layer

Status: merged 2026-09-26, not reviewed
Commits: 5f50748, 79c771c, 9c60eee (merged 1fda68e) · Migration: none · Design: `docs/design/typed-decisions.md`

## What and why
Nick wants a deterministic layer driven by a reasoning model (in the spirit of Jev, built on our own models), with quality before token cost for alpha and beta. `decide()` returns a typed choice with a confidence; code applies declared thresholds; a calibration eval measures whether the confidence can be trusted before anything live uses it.

## What changed
- **`packages/ai-core/src/decide.ts`**: spec (name, question, fixed options with descriptions or a score range, guidance, context), JSON-schema output validated again in code, retries (3 by default) then `{ ok: false, reason }`, refusals not retried. Default effort: none on fast, medium on standard, high on advanced.
- **Gateway**: `EffortLevel` gains `xhigh` and `max`, with more thinking room at high effort (12k, 24k tokens). A cast in `providers/anthropic.ts` because the SDK types lack `xhigh`.
- **`policy.ts`**: declared rules ("accept none only at 0.9 or above, else escalate"); `applyPolicy()` returns the action, the rule and why. Pure.
- **`calibration.ts`**: reliability per confidence band, expected calibration error, Brier score, Markdown table.
- **Eval** `apps/api/eval/decide-calibration.ts` (spec in `eval/lib/concern-decision.ts`): the concern decision over snapshots, rewrites and the topic grid (149 inputs), repeated; reliability tables, a threshold sweep (miss rate against over-routing), comparison with the turn planner's flag. `--dry-run` uses a fake model.
- **Nothing live uses it yet.**

## Where it differs from the design
Not applicable: the design doc was written alongside.

## How it was tested
- `apps/api/src/lib/__tests__/decide.test.ts` (22).
- `pnpm exec tsx eval/decide-calibration.ts --dry-run` runs end to end (fake model, so its "WRONG" lines are expected).
- **Not run:** a real calibration run.

## Review checklist
- [ ] `decide()` never throws to the caller on bad model output; it returns `ok: false`.
- [ ] `applyPolicy()` handles a failed decision explicitly (no silent default to "none").
- [ ] The eval's threshold sweep treats a missed safety case as disqualifying, not as one error among many.

## Not done / limits
- No real calibration run; the test set has about 37 real concerns among 149 inputs, so per-band numbers will be noisy.
- Sensitivity and ticket-context decisions have no specs yet.
- The 60 s gateway timeout may be tight at advanced tier with `max` effort.

## Decisions pending
- Run the calibration on the Linux box: `pnpm exec tsx eval/decide-calibration.ts --configs standard:medium,advanced:high --repeats 3 --budget 15 --planner-results eval/results/e2e-<stamp>/results.json`. Recommendation: yes, next.
- After it: thresholds, tier, and whether `decide()` replaces the planner's flag or runs alongside it (recommendation: alongside, escalate if either flags).

## Later changes
