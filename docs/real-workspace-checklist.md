# Real-Workspace verification checklist

Status: written 2026-09-28 for the beta gate (C3 step 8); not yet run. It needs the Google Chat app installed on the beta Workspace. Run it once on the beta tenant before real employees are invited, tick each line, and put anything that fails in `docs/backlog.md`.

Each item says what to do and what should happen. Items marked **(assumption)** check something we built from Google's documentation but have never seen on a real Workspace (`docs/c3-plan.md`, "Google Chat facts"). If one of those fails, the fix is in the adapter, not in the checklist.

You need: the beta tenant deployed from the release commit, two or three test people in the Workspace (one a manager of another), an admin account, and Claude Code on the laptop for the fleet commands.

## 1. Before installing

- [ ] `pnpm tenant:fleet health --apply` with `OPS_TOKEN` set: every row ok, including the ops checks. Jobs that haven't had their first run show as "hasn't run yet".
- [ ] Encryption: `pnpm --filter @revualy/db encryption check` against the tenant reports no plaintext rows; `ENCRYPTION_LEGACY_READS` is not set (the ops check `encryption_legacy_reads` is ok).
- [ ] `REVIEWER_PSEUDONYM_SECRET` is set on the api service, and `GET /api/v1/admin/privacy/audit/verify` as a super admin returns ok.
- [ ] `OPS_ALERT_EMAIL` and `RESEND_API_KEY` are set on the api service. To prove alerts arrive, stop the worker for 30 minutes on a quiet evening, or wait for the first natural one. The email names no one.
- [ ] `TEST_LOGIN_ENABLED` is false: `/api/test-login` returns 404.
- [ ] Support settings (`/settings/support`): the client's contact and details are filled in, and the HR team has signed off the wording, or has knowingly chosen to go with the defaults for now.
- [ ] A Railway Postgres backup exists and a restore to a scratch database has been tried once.

## 2. Install and authentication

- [ ] The Workspace admin installs the Chat app for the test people (or domain-wide).
- [ ] **(assumption)** Requests verify: the webhook accepts Google's bearer token with our `GOOGLE_CHAT_AUDIENCE` setting. Look for no `401` on `/webhooks/gchat` in the api logs. If the Chat API "Authentication audience" is set to the endpoint URL, check which issuer Google actually uses (we implemented `accounts.google.com` OIDC).
- [ ] **(assumption)** An `ADDED_TO_SPACE` event arrives for each person on admin install (not only when they open the app themselves). Check `identity_link_events` has an `auto` link per person.
- [ ] **(assumption)** `user.email` is present on events, and matches `users.email` case-insensitively. If it isn't, people stay unlinked: note which event types lacked it.
- [ ] **(assumption)** The Chat user id (`users/{id}`) equals the Google account id we store at sign-in (`auth_accounts.provider_account_id`).
- [ ] Each person gets the welcome DM, and it mentions help and stop.
- [ ] A person who removes the app shows as `linked` (not `reachable`) and gets no check-ins.

## 3. Reaching people

- [ ] **(assumption)** `findDirectMessage` with app auth finds the DM for a linked person who hasn't opened the app, after an admin install. If it 404s, people are only reachable after they open the app once: record that, and whether the admin install pre-created DM spaces.
- [ ] The scheduling pass (04:00 UTC, or trigger it by hand) proposes check-ins only for reachable people, respects quiet days and the person's preferred time, and sends at that time.
- [ ] With Google Calendar connected: the nightly calendar model proposes check-ins anchored to real shared meetings, never 1:1s or meetings with sensitive-looking titles.

## 4. A conversation, end to end

- [ ] A peer check-in: the opener names the colleague (and the meeting, if anchored); a two-message burst gets one reply; the conversation closes after the message cap.
- [ ] Order: replies sent quickly in a row appear in the transcript in the order sent (`seq`), whatever order Google delivered them.
- [ ] `help`, `stop` and `start` behave as in the welcome text; `stop` ends an open check-in and it's analysed as partial.
- [ ] A late addition within 7 days is acknowledged and re-analysed.
- [ ] Privacy question ("who sees this?"): factual answer, the question asked again, the check-in carries on.
- [ ] Off-script twice: the offer to stop appears; three times: the check-in ends for today.
- [ ] A wellbeing or safety message: the client's signpost wording with its contact and details, the check-in ends, nothing appears as feedback, and `support_signposts` counts it.
- [ ] A conduct report: the conduct wording, the check-in ends. (C2 is open: note whether it appears in the colleague's feedback.)
- [ ] Typing indicator shows during the 8-16 s serious-concern replies.

## 5. What people see

- [ ] Peer feedback appears in the subject's and their manager's views only once released (three reviewers, fortnightly batch), paraphrased, with no reviewer name.
- [ ] A skip-level manager and an admin see signals only on the member page.
- [ ] Self-reflection conversations appear on the person's Reflections page only.
- [ ] Weekly digest and flag-alert emails arrive, with working unsubscribe links, and hold no feedback text.
- [ ] Break-glass: an admin opens a grant with a reason, sees the read-only view, and the person sees the notice in their dashboard and settings.

## 6. 1:1 notes (if the beta uses Meet)

- [ ] A Meet 1:1 with Gemini notes on: the transcript and notes are found (location and format as we expect), semi-automatic mode asks the manager to approve, and approved items appear for both people only.

## 7. After the first week

- [ ] Ops checks stayed ok, or every alert was explained.
- [ ] `model_fallbacks` stayed low (under 20% of judged answers).
- [ ] Nothing in `inbound_messages` is stuck or unrouted without explanation.
- [ ] Support signpost counts look plausible for the group size (a sudden run of safety signposts is worth a look at the classifier, not at people).
