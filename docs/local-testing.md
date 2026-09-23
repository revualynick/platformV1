# Local Testing

How to run Revualy locally and exercise it — UI via Playwright, chat via the
`claude -p` simulation harness.

## 1. Bring up the stack

```bash
docker compose up -d                      # Postgres (pgvector) + Redis
set -a; source .env; set +a               # load env into the shell
pnpm --filter @revualy/db migrate         # apply migrations
pnpm --filter @revualy/db seed            # seed demo org (14 users, goals, etc.)
pnpm dev                                  # api :3000 + web :3001
```

Required `.env` for local testing (see `.env.example`):

```
DATABASE_URL=postgresql://revualy:revualy@localhost:5432/revualy_dev
REDIS_URL=redis://:revualy@localhost:6379
ORG_ID=dev-org
ENCRYPTION_KEY=<64 hex chars>
WS_TOKEN_SECRET=<random>
INTERNAL_API_SECRET=<random>
NEXTAUTH_SECRET=<random>
DEMO_MODE=false
TEST_LOGIN_ENABLED=true
TEST_LOGIN_KEY=<random>
ANTHROPIC_API_KEY=<needed only for the chat simulation>
```

## 2. Test login (no Google OAuth needed)

Google OAuth is the only real login, so automated tests authenticate through a
**key-gated** dev endpoint. It is inert unless `TEST_LOGIN_ENABLED=true` **and**
the caller presents the matching `TEST_LOGIN_KEY` — so if the flag is ever left
on in production it is still not an open door.

```
GET /api/test-login?email=<seeded-email>&key=<TEST_LOGIN_KEY>&redirect=/home
```

It mints a real DB-backed session cookie for the seeded user. Seeded roles:
`sarah.chen@acmecorp.com` (employee), `alex.thompson@acmecorp.com` /
`jordan.wells@acmecorp.com` (manager), `dana.whitfield@acmecorp.com` (super_admin).

## 3. UI tests (Playwright)

```bash
set -a; source .env; set +a
pnpm exec playwright test --config e2e/playwright.config.ts          # full route matrix
pnpm exec playwright test --config e2e/playwright.config.ts -g "GET /team"   # subset
```

`e2e/specs/routes.spec.ts` visits every route across all roles and fails on any
server error, client exception, or console error. Results are written to
`e2e/results.json` and `e2e/playwright-report/`.

## 4. Chat simulation (`claude -p`)

The feedback chat (normally Slack/Teams/GChat) can be driven locally via the
`internal` platform. `POST /api/v1/dev/simulate-chat` runs the real conversation
orchestrator (LLM question generation, theme progression, close logic) and
returns the bot's reply. **Requires `ANTHROPIC_API_KEY`** — every bot turn calls
the LLM.

Use the CLI wrapper, which keeps conversation state across invocations so
`claude -p` can hold a multi-turn conversation:

```bash
node scripts/chat-sim.mjs --email sarah.chen@acmecorp.com --start
node scripts/chat-sim.mjs --email sarah.chen@acmecorp.com --message "It went well — I shipped the new API."
node scripts/chat-sim.mjs --email sarah.chen@acmecorp.com --message "The hardest part was the auth refactor."
node scripts/chat-sim.mjs --email sarah.chen@acmecorp.com --reset
```

Interaction types: `--type self_reflection` (default), `peer_review`,
`three_sixty`, `pulse_check`. For peer/360, pass `--subject <email>`.

Example `claude -p` loop (Claude plays an anxious employee):

```bash
claude -p "You are simulating an employee doing a self-reflection. Run
'node scripts/chat-sim.mjs --email sarah.chen@acmecorp.com --start', read the
bot's question, then reply in character with
'node scripts/chat-sim.mjs --email sarah.chen@acmecorp.com --message \"<your reply>\"'.
Continue until the conversation closes, then summarise how the bot did."
```

The CLI reads `TEST_LOGIN_KEY` and `INTERNAL_API_SECRET` from `.env`.
