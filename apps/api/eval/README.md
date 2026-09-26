# Conversation evaluation harness

Tests the bot's LLM calls with real models. Runs on the Linux box (see
`sync-to-box.sh`); results land in `eval/results/` (git-ignored).

## Roles

| Role | Model | How |
|---|---|---|
| Bot (what we tune) | `claude-sonnet-5` (production's standard tier) | the production gateway on the API, or `claude -p` |
| Judge | Opus 5.5 | `claude -p`, fixed rubric in `judge/rubric-vN.md`, blind to backend and variant |
| Employee (full conversations, later) | `qwen3:8b` | local Ollama, with temperature guards |

## Rules for the tuning loop

- Change one or two variables per iteration, and log hypothesis, change, result, keep/revert.
- Hard rules (`lib/checks.ts`) gate; the judge's score only ranks variants that pass them.
- The rubric is fixed per version. The loop may not edit `judge/`; a new rubric is a person's decision.
- Held-out snapshots are for checkpoints only.

## Known limits

- `claude -p` flattens the conversation into one prompt, has no structured
  outputs, and adds machine/account context that cannot be removed (the
  neutraliser line reduces its effect; `leak` in the report counts it).
  Experiment 1 (`compare-backends.ts`) measures how much this matters.
- Snapshot expectations are a person's judgement, not ground truth.

## Run

    apps/api/eval/sync-to-box.sh    # on the Mac
    # on the box, in apps/api:
    pnpm exec tsx eval/compare-backends.ts --repeats 3 --budget 1 --claude-config-dir ~/.claude-personal

The API key comes from `$ANTHROPIC_API_KEY` or `~/.config/revualy-eval/anthropic.env`
on the box. Never commit it.

## decide() calibration

`decide-calibration.ts` runs the concern decision through `decide()`
(packages/ai-core) over the snapshots, rewrites and topic grid, and reports
accuracy per confidence band, a threshold sweep for "accept none only above
t", and agreement with the turn planner's flag. See
`docs/design/typed-decisions.md`.

    pnpm exec tsx eval/decide-calibration.ts --dry-run          # fake model, no key, no cost
    pnpm exec tsx eval/decide-calibration.ts --repeats 3 --budget 5 --planner
    pnpm exec tsx eval/decide-calibration.ts --configs standard:medium,advanced:high --repeats 3 --budget 15 \
      --planner-results eval/results/e2e-<stamp>/results.json
