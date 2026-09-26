# Documentation

Start with the root `README.md` for what Revualy is and where it stands. This page says what each doc is for and whether it's current.

**Keeping this tidy:** when a doc is superseded, move it to `archive/` with `git mv`, add a row to `archive/README.md`, and copy anything still open into `backlog.md`. When a design is built, change its status line. Every doc starts with a status line and a date.

## Current

| Doc | What it's for |
|---|---|
| `backlog.md` | Everything open: bugs, decisions waiting on Nick, features, technical debt |
| `plan.md` | Architecture and technical reference; its "Active Context" section is the running record of phases and decisions |
| `c3-plan.md` | The beta-hardening roadmap (steps 0 to 11). Steps 0 to 6 done |
| `deployment.md` | Railway deployment, per-tenant |
| `local-testing.md` | Running the stack locally, Playwright and the chat simulator |
| `ui-test-plan.md` | Playwright test schedule and progress (last updated 2026-07-27) |
| `key-rotation.md` | Encryption key rotation. **Partly outdated** until C3 step 7 rewrites it |

## Design

| Doc | Status |
|---|---|
| `design/privacy-and-agent-access.md` | Agreed in principle, not built (2026-09-26). Anonymity tiers, sharing and consent, raw transcript storage, the ticket air gap between agents and data |
| `design/admin-assistant.md` | Proposed, no code (2026-09-26). The customer-facing admin assistant |
| `bot/concerns-playbook.md` | Draft. How the bot handles privacy, off-script, wellbeing, conduct and safety concerns. Wording to be refined from established literature |

## Research

| Doc | What it covers |
|---|---|
| `research/migration-sources.md` | Export formats from Culture Amp, 15Five, Lattice, Leapsome, Betterworks, Peakon; Google Meet API |

## Elsewhere

- `apps/api/eval/README.md`: the LLM evaluation harness on the Linux box (judges, topic grid, experiments).
- `.claude/skills/revualy-tenant/SKILL.md`: tenant provisioning and fleet operations.
- `.claude/log.md`: session log, newest at the bottom.
- `archive/`: superseded docs, kept for history.
