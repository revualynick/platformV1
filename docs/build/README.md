# Build notes

One note per piece of work merged into `beta-hardening`, written at merge time. They exist so a person or an agent reviewing the branch can see what changed, why, where to look, how it was tested and what to check, without reconstructing it from commits.

- **Design docs** (`docs/design/`) say what we intend. **Build notes** say what was actually built, including where it differs from the design.
- **The backlog** (`docs/backlog.md`) holds follow-ups. A build note's "Not done" items are copied there.
- **The session log** (`.claude/log.md`) is a short diary. Build notes are the reviewable record.

## Rules

- Every merge gets a note in the same commit series, named `YYYY-MM-DD-<topic>.md`, and a row below.
- Use the template. "Review checklist" is written for a reviewer who knows the codebase but not the session: concrete things to open, run or try to break.
- Agents building work must report in the template's shape, so their report becomes the note with light editing.
- When a later change alters something a note describes, add a dated line to that note's "Later changes" rather than rewriting history.

## Index

| Date | Note | Commits | Migration | Review status |
|---|---|---|---|---|
| 2026-09-26 | [Privacy step 1: leaks closed](2026-09-26-privacy-step-1.md) | 2cc7628 | none | not reviewed |
| 2026-09-26 | [Encryption backfill and legacy reads off (C3 step 7)](2026-09-26-encryption-backfill.md) | f9d724b, 528b3d5 | 0042 | not reviewed |
| 2026-09-26 | [Privacy step 2: pseudonymous peer feedback](2026-09-26-privacy-step-2-pseudonyms.md) | 82b2d23 | 0043 | not reviewed |
| 2026-09-26 | [Privacy step 3: tickets and the job-agent gate](2026-09-26-privacy-step-3-tickets.md) | 11e749c | 0044 | not reviewed |
| 2026-09-26 | [Typed decision layer](2026-09-26-typed-decisions.md) | 1fda68e | none | not reviewed |
| 2026-09-26 | [1:1 notes screens and mode limits](2026-09-26-one-on-one-screens.md) | cfb7dc6 | 0045 | not reviewed |
| 2026-09-28 | [Beta gate: full code review and fixes](2026-09-28-beta-gate-review.md) | bf14fd6, 381719a | 0051 | not reviewed |
| 2026-09-28 | [Beta gate: monitoring, alerts, real-Workspace checklist](2026-09-28-beta-gate-monitoring.md) | b4411c9, 1821080 | 0050 | not reviewed |
| 2026-09-27 | [Client-owned wording, off-script offer, real-model run](2026-09-27-wording-signoff-off-script.md) | 4373d1d, 1bfad75 | 0049 | not reviewed |
| 2026-09-27 | [Support signpost; reference path live](2026-09-27-support-signpost.md) | e2e92a4.. | 0048 | not reviewed |
| 2026-09-27 | [Support handover: consented requests (superseded)](2026-09-27-support-handover.md) | fd833ef.. | 0047 | superseded |
| 2026-09-27 | [Break-glass access for admins](2026-09-27-break-glass.md) | 038951b.. | 0046 | not reviewed |
| 2026-09-27 | [Person access and in-page Suspense](2026-09-27-person-access.md) | f459bdf.. | none | not reviewed |
| 2026-09-27 | [Goal cycle refresh, mobile layout, mechanical backlog](2026-09-27-mechanical-fixes.md) | 16643d9..24217a4 | none | not reviewed |
| 2026-09-27 | [Browser suite against any environment](2026-09-27-e2e-any-environment.md) | 36cc8fb..96e92ab | none | not reviewed |
| 2026-09-26 | [Staging mirror and redirect fix](2026-09-26-staging-mirror.md) | bf67c74, 8725411, 8364a02 | none | not reviewed |
| 2026-09-26 | [Test and migration infrastructure](2026-09-26-test-infrastructure.md) | ce5bdd6, 11e749c | none | not reviewed |

## Template

```markdown
# <Title>

Status: merged YYYY-MM-DD, not reviewed | reviewed by <who> on <date>
Commits: <hashes> · Migration: <number or none> · Design: <doc link>

## What and why
Two or three sentences: the problem, and what now happens instead.

## What changed
Bullets by area, naming the main files.

## Where it differs from the design
Anything built differently from the design doc, and why.

## How it was tested
Commands, test counts, which tests prove which claim. What was NOT run (real models, real Workspace, Railway).

## Review checklist
- [ ] Concrete things to read, run or try to break.

## Not done / limits
Copied to docs/backlog.md.

## Decisions pending
Questions for Nick, with a recommendation.

## Later changes
- YYYY-MM-DD: ...
```
