# Revualy

A dynamic, AI-powered peer review platform where all feedback happens through chat — and a dashboard ties it all together.

## Overview

Revualy transforms peer reviews from dreaded annual forms into natural conversations. AI-driven review interactions happen where employees already work — Slack, Google Chat, Microsoft Teams — while dashboards give individuals, managers, and admins full visibility and control.

The system learns who works with whom by observing calendar interactions, building an organic relationship graph that evolves over time — no manual peer assignment needed.

## What Makes Revualy Different

### Chat-First, Always-On Reviews

There are no review "cycles" or "kick-offs." Revualy is **continuous data collection** — the AI reaches out to each employee **2-3 times per week** with short, focused interactions of **1-5 messages each**. Enough to capture meaningful insight without being intrusive.

This drip-feed approach means feedback is always fresh and tied to recent interactions, not a scramble to remember six months of work before a deadline.

**Supported platforms:**
- Slack
- Google Chat
- Microsoft Teams

### The Relationship Web

Employees aren't siloed into rigid org charts for review purposes. Revualy maps a dynamic **relationship graph** — a spider web of connections between employees based on:

- **Calendar data** — Meeting frequency, shared calendar events, 1:1s, and project syncs are analyzed to learn who actually collaborates with whom.
- **Manual connections** — Managers and admins can explicitly link peers.
- **Chat interaction patterns** — Frequency and context of cross-team communication.

This graph is **self-learning** — it strengthens connections when people collaborate more and surfaces new review relationships automatically. The AI uses this web to determine _who_ should review _whom_ and _what questions_ to ask based on the nature of their working relationship.

### Custom Question Banks & Templates

Managers and admins can feed custom questions into the AI at multiple levels:

- **Team-level questions** — Each team can have its own question set tailored to their function (e.g., engineering teams get questions about code quality and collaboration, sales teams about pipeline support and client handoffs).
- **Company-wide questions** — Org-level prompts that apply across all review cycles.
- **Role-specific questions** — Targeted prompts based on job function or seniority.
- **Track-based templates** — Upload templated question sets and assign them to employees based on their career track (e.g., IC vs. management, junior vs. senior).

The AI blends these custom questions with its own dynamically generated prompts, so reviews feel natural rather than scripted.

### Pulse Check: Company Comms Listener

Revualy can ingest company-wide communications — all-hands announcements, policy changes, org restructures, new initiatives — and **organically follow up with employees** via chat to gauge sentiment and understanding.

**How it works:**
- A major announcement goes out (e.g., new remote work policy, leadership change, product pivot)
- Revualy picks it up from a connected channel or feed
- The AI reaches out to relevant employees individually via DM — not as a survey, but as a natural check-in: _"Hey, saw the update about X. How are you feeling about it? Any concerns?"_
- Responses are aggregated and anonymized into sentiment reports for leadership

This turns one-way company comms into a **two-way feedback loop** without employees needing to raise their hand or fill out a survey.

### Org Structure: Managers & Employees

- **Appoint managers** — Assign manager roles with direct reports mapped beneath them.
- **Assign employees to managers** — Each employee rolls up to a manager, but can have peer connections across the entire org.
- **Cross-functional visibility** — The relationship web exists independently of the reporting hierarchy, so reviews capture the full picture of how someone works.

## Feedback Philosophy

### Unfiltered Feedback, Flagged for Coaching

Revualy does **not** censor or sanitize feedback. The goal is to capture people's true opinions. However:

- **Problematic language is flagged** — The AI detects language that may indicate bias, hostility, or inappropriateness and highlights it to the relevant manager for coaching purposes.
- **Feedback is never altered** — The original response is preserved. Flagging is a layer on top, not a filter.
- **Coaching opportunity, not punishment** — Flagged language is framed as a development conversation, not a disciplinary action.

### Self-Reflection

The AI periodically prompts employees with self-reflection questions via chat — not tied to a formal review cycle. These build self-awareness over time and create a personal baseline that can be compared against peer feedback.

### 360 Manager Reviews

Employees can provide upward feedback on their managers through a **360 review process**:

- **Aggregated by default** — Manager feedback is combined across all reports into themes and sentiment. No individual responses are attributed.
- **Problematic feedback escalates up** — If the AI detects concerning patterns (e.g., multiple reports of micromanagement, favoritism, or hostility), that feedback is routed to the **manager's manager** for review — not back to the manager being reviewed.
- **Safe by design** — Employees can be honest because individual responses are never exposed to the manager in question.

### Core Values Rating

Reviews aren't scored on abstract scales — they're anchored to the company's **core value statements**. Each organization defines its values (e.g., "Ownership," "Collaboration," "Customer Obsession"), and peer feedback is mapped against them.

- **Value-aligned scoring** — When peers give feedback, the AI maps responses to relevant core values and generates per-value ratings.
- **Company-defined, AI-applied** — Admins configure the core values; the AI weaves them into conversations naturally rather than presenting a checkbox grid.
- **Trend tracking** — Employees and managers can see how value scores evolve over time, identifying strengths and areas for growth against the behaviours the company actually cares about.

### Engagement Scoring & Leaderboard

Every interaction is scored on **willingness and quality of engagement**:

- **High engagement** — Thoughtful, detailed responses with specific examples and context.
- **Low engagement** — One-word answers, dismissive responses, or minimal effort.
- The AI scores each interaction and builds an **engagement score** per employee over time.

**Weekly leaderboard:**
- Top 3 most engaged employees each week are recognized and **win a voucher**.
- Leaderboard is displayed on the landing page alongside the kudos digest.
- Encourages a culture where giving quality feedback is valued and rewarded — not treated as a chore.

### Kudos & Recognition

Positive peer feedback and shoutouts don't sit in a database — they get visibility:

- Employees can give real-time kudos via chat at any time.
- **Weekly kudos digest** — A curated post is published on the system's landing page each week, highlighting standout recognition across the org.
- Kudos feed into the broader feedback picture for an employee, contributing to their growth profile alongside formal reviews.

## AI-Assisted Calibration

Instead of scheduling formal calibration meetings, Revualy provides **continuous, AI-driven calibration**:

- **Leniency/severity detection** — The AI identifies managers who consistently rate higher or lower than their peers and flags the pattern.
- **Cross-team comparison** — Similar roles across different teams are compared to surface inconsistencies (e.g., "Senior Engineers on Team A average 4.5 while Team B averages 3.2 — worth reviewing").
- **Blind review mode** — Strips names and demographics from feedback summaries so managers can evaluate performance without bias.
- **Outlier alerts** — Flags individual ratings that deviate significantly from the consensus, prompting a second look.
- **Calibration dashboard** — HR and senior leadership can view normalization data across the org without needing to convene a meeting.

## Onboarding: AI-Powered Get-to-Know-You

When a new employee joins, the AI initiates a conversational onboarding sequence via chat:

- **Communication preferences** — How do they prefer to receive feedback? Direct and blunt, or wrapped in context? Written or verbal?
- **Work style** — How do they collaborate best? Do they prefer async or sync? Heads-down focus or frequent check-ins?
- **Strengths & growth areas** — What do they consider their strengths? Where do they want to develop?
- **Personal context** — What should peers know about how they work? Any preferences or boundaries?

This profile is used by the AI to **tailor how it interacts with each person** — adjusting tone, question style, and feedback delivery. It also seeds the relationship web with initial context before calendar data kicks in.

## Escalation & HR Feed

When feedback surfaces serious concerns — harassment, discrimination, safety issues, or repeated patterns of toxic behavior — it is handled separately from normal review flows:

- **Direct escalation to HR** — Flagged content is routed to a dedicated HR feed in the admin dashboard, bypassing managers entirely.
- **Not aggregated** — Serious concerns are surfaced individually with full context, not blended into summaries.
- **Audit trail** — All escalations are logged with timestamps and actions taken.
- **Managed in-dashboard** — HR can review, assign, track, and resolve escalations directly within the admin dashboard.

## Privacy & Data

- **Employee access** — Every employee has full access to their own data: feedback given, feedback received, self-reflections, and their relationship web.
- **Manager access** — Managers see aggregated feedback for their direct reports, calibration data for their team, and flagged items requiring coaching.
- **HR/Admin access** — Full org visibility, escalation feed, calibration dashboards, and configuration.
- **Encryption at rest** — All feedback data, relationship graphs, and personal profiles are encrypted at rest.
- **Data ownership** — Employees can export their data at any time.

## Dashboards

### Employee Dashboard
- View received peer feedback (anonymized or attributed based on settings)
- Review and edit their own submitted feedback before finalization
- See personal growth trends and competency tracking over time
- View their relationship web — who they're connected to and upcoming reviews
- Self-reflection history and AI-suggested development areas
- Weekly kudos feed on the landing page

### Manager Dashboard
- Aggregated peer feedback summaries for each direct report
- AI-generated insights: strengths, growth areas, sentiment trends
- Core values scores and trends per employee
- Team engagement scores — who's contributing quality feedback, who's disengaged
- Relationship web view for their team — see who collaborates with whom
- Flagged language alerts for coaching conversations
- Calibration view — cross-team consistency and outlier detection
- Escalated 360 feedback from their direct reports' teams (when applicable)

### Admin / HR Dashboard
- Org-wide configuration: manager assignments, team structures
- Manage the relationship graph — override, add, or remove connections
- Review cycle templates and scheduling across the org
- Platform integrations setup (Slack, Google Chat, calendar sync)
- Analytics and reporting across all teams
- HR escalation feed — review, assign, and track serious concerns
- Org-wide calibration dashboard

## How It Works

```
1. ONBOARD    → New employee completes AI get-to-know-you via chat
2. CONNECT    → Sync calendars + messaging platforms
3. LEARN      → AI maps the relationship web from real interactions
4. COLLECT    → 2-3 micro-interactions per week, 1-5 messages each (always on)
5. REFLECT    → Periodic self-reflection prompts woven into the rhythm
6. SCORE      → Each interaction scored on engagement quality
7. FLAG       → Problematic language flagged for coaching, serious issues → HR
8. CALIBRATE  → AI normalizes feedback across teams and managers
9. SYNTHESIZE → AI maps feedback to core values and generates insights
10. DELIVER   → Dashboards update continuously as data flows in
11. RECOGNIZE → Weekly leaderboard (top 3 win vouchers) + kudos digest
12. EVOLVE    → Relationship web, AI prompts, and interaction styles refine over time
```

## Tech Stack

_TBD — to be determined as the project progresses._

## Project Status

**Phase: Ideation / Planning**
