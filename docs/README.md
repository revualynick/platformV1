# Documentation

Start with the root `README.md` for what Revualy is and where it stands. This page says what each doc is for and whether it's current.

**Keeping this tidy:** when a doc is superseded, move it to `archive/` with `git mv`, add a row to `archive/README.md`, and copy anything still open into `backlog.md`. When a design is built, change its status line. Every doc starts with a status line and a date.

## Current

| Doc | What it's for |
|---|---|
| `backlog.md` | Everything open: bugs, decisions waiting on Nick, features, technical debt |
| `build/` | **Build notes**: one per merged piece of work, with what changed, how it was tested and a review checklist. Start here to review the branch |
| `plan.md` | Architecture and technical reference; its "Active Context" section is the running record of phases and decisions |
| `c3-plan.md` | The beta-hardening roadmap (steps 0 to 11). Steps 0 to 7 done |
| `deployment.md` | Railway deployment, per-tenant |
| `demo-simulation-plan.md` | A 100-person demo tenant and a simulated month on the staging box: clock, generator, fakes, personas, daily checks |
| `real-workspace-checklist.md` | Beta gate: what to verify on the real Google Workspace once the Chat app is installed, including the Google Chat assumptions never seen live |
| `staging.md` | Staging on the Linux box: always-on copy, reached through an SSH tunnel; how to deploy and look after it |
| `local-testing.md` | Running the stack locally, Playwright and the chat simulator |
| `ui-test-plan.md` | Playwright test schedule and progress (last updated 2026-07-27) |
| `key-rotation.md` | Encryption key rotation, backfill and checks (rewritten 2026-09-26) |

## Design

| Doc | Status |
|---|---|
| `design/privacy-and-agent-access.md` | Steps 1 to 3 built, 4 to 6 not started (2026-09-26). Anonymity tiers, sharing and consent, raw transcript storage, the ticket air gap between agents and data |
| `design/typed-decisions.md` | Proposal (2026-09-26). `decide()` and the order to move calls onto it, pending calibration |
| `design/admin-assistant.md` | Proposed, no code (2026-09-26). The customer-facing admin assistant |
| `bot/concerns-playbook.md` | Draft. How the bot handles privacy, off-script, wellbeing, conduct and safety concerns. Wording to be refined from established literature |

## Research

| Doc | What it covers |
|---|---|
| `research/humble-inquiry.md` | Schein, *Humble Inquiry* (2nd ed., 2021) mapped onto the concerns playbook: proposed wording changes, conflicts with Nick's decisions, limits |
| `research/coaching-habit.md` | Bungay Stanier, *The Coaching Habit* (2016) mapped onto the concerns playbook, plus a merged list of 19 proposals across both books |
| `research/migration-sources.md` | Export formats from Culture Amp, 15Five, Lattice, Leapsome, Betterworks, Peakon; Google Meet API |

## Elsewhere

- `apps/api/eval/README.md`: the LLM evaluation harness on the Linux box (judges, topic grid, experiments).
- `.claude/skills/revualy-tenant/SKILL.md`: tenant provisioning and fleet operations.
- `.claude/log.md`: session log, newest at the bottom.
- `archive/`: superseded docs, kept for history.
