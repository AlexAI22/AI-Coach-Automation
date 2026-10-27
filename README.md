# AI Coach Automation

End-to-end UI test automation for the **AI Coach** application (staging), built with
[Playwright](https://playwright.dev/) and TypeScript. The suite covers the PropelAuth
login flow and the authenticated app: **Sales Coach** (agents, chat creation, response
download), **Personal Digest**, the **Customer Value Portal** and the account-level
**Coach Me** assistants (Expansion Plan, Account Roadmap). It uses the Page Object
Model, a single shared browser window, and a reused authentication session.

- **App under test:** `https://stage-aicoach.insight.com` (staging)
- **Auth provider:** PropelAuth (staging tenant `AICOACH-STAGING`)
- **UI framework:** Mantine

---

## Tech stack

| Tool | Purpose |
|------|---------|
| `@playwright/test` | Test runner, browser automation, assertions, HTML reporter |
| `@types/node` (+ `typescript` via `npx`) | Typed test/page-object code (editor + `tsc` type-checking) |
| `@playwright/mcp` | Playwright MCP server for AI-assisted authoring (see below) |

The browser, headed/headless mode and action pacing are chosen at runtime through
environment variables (see below). Locally the default is real **Google Chrome**,
**headed**, slowed down so you can watch it; on CI it is headless Chromium.

---

## Prerequisites

- **Node.js** 20.x or later (CI runs on Node 24)
- **PowerShell 7 (`pwsh`)** for the `:secure` scripts
- A valid **AI Coach staging account** (PropelAuth staging has a separate user store
  from production)

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browsers
npx playwright install
```

### Credentials & run configuration

Credentials are **not stored in the repo**. They are read from environment variables at
runtime; no `.env` loader is used.

| Variable | Values | Default |
|----------|--------|---------|
| `AICoach_MICROSOFT_EMAIL` (legacy: `EMAIL`) | staging account email | none (required) |
| `AICoach_MICROSOFT_PASSWORD` (legacy: `PASSWORD`) | staging account password | none (required) |
| `BROWSER` | `chrome` \| `chromium` \| `edge` \| `firefox` \| `webkit` (case-insensitive) | `chrome` |
| `HEADLESS` | `true` \| `false` | `false` locally, `true` on CI |
| `SLOWMO` | ms to pause before each action (Chromium-based browsers) | `250` locally, `0` on CI |
| `RETRIES` | number of retries per failed test | `0` locally, `2` on CI |
| `TRACE` | `on` = record ONE trace for the whole run (contains the login request, so keep it local) | off |
| `PROJECT_NAME` | Sales Coach project used by the download spec | `Tesla - Q4 2026 Account Plan` |

Both credential naming schemes are accepted; the `AICoach_MICROSOFT_*` names win when
both are set. A trailing newline in a secret is trimmed automatically.

```powershell
# PowerShell
$env:AICoach_MICROSOFT_EMAIL="you@insight.com"; $env:AICoach_MICROSOFT_PASSWORD="your-password"; npm run test:sales-coach
```

```bash
# bash / CI
EMAIL='you@insight.com' PASSWORD='your-password' BROWSER=chromium HEADLESS=true npm run test:sales-coach
```

Without credentials, every credentialed test **skips** (only the login-form specs run).

#### Keeping the password off the command line

The `:secure` scripts run [scripts/run-secure.ps1](scripts/run-secure.ps1), which:

1. loads `email` / `password` from a git-ignored `credentials.local.json` in the repo
   root, if present:
   ```json
   { "email": "you@insight.com", "password": "secret" }
   ```
2. otherwise prompts for the email (if not already in `EMAIL`) and the password at a
   **masked** prompt,
3. runs the tests and scrubs `PASSWORD` from the environment afterwards.

```powershell
npm run test:secure                                          # whole suite
npm run test:secure -- -Spec personal-digest.spec.ts -Headed  # one spec, visible browser
npm run test:secure -- -Grep "welcome landing"               # filter by title
```

---

## Running the tests

Each suite has a plain, a `:headed` and (mostly) a `:secure` variant, e.g.
`npm run test:customer-cvp`, `npm run test:customer-cvp:headed`,
`npm run test:customer-cvp:secure`.

| Command | Spec(s) | Description |
|---------|---------|-------------|
| `npm test` | all | Full suite (includes the slow, mutating tests below) |
| `npm run test:headed` | all | Full suite, visible browser |
| `npm run test:login` | `login-success.spec.ts` | Login form (logged-out window) |
| `npm run test:sales-coach` | `sales-coach.spec.ts` | Sales Coach landing, welcome modal, **agent chat creation** |
| `npm run test:download-response` | `downloadAgentResponse.spec.ts` | "Download response" `.docx` export for every agent chat in a project |
| `npm run test:personal-digest` | `personal-digest.spec.ts` | Personal Digest → Daily Digest |
| `npm run test:customer-cvp` | `customer-cvp.spec.ts` | Customer Value Portal list, search, currency, pagination, account detail |
| `npm run test:expansion-coach-me` | `expansionPlanCoachMe.spec.ts` | Expansion Plan tab + Coach Me prompts (read-only) |
| `npm run test:expansion-coach-me-answers` | `expansionPlanCoachMeAnswers.spec.ts` | Runs each Expansion Plan prompt and checks the AI answer |
| `npm run test:roadmap-coach-me` | `accountRoadmapCoachMe.spec.ts` | Account Roadmap tab + Coach Me prompts (read-only) |
| `npm run test:roadmap-coach-me-answers` | `accountRoadmapCoachMeAnswers.spec.ts` | Runs each Account Roadmap prompt and checks the AI answer |
| `npm run test:coach-me:all` | Opportunities + Expansion + Roadmap prompts | All read-only Coach Me prompt suites |
| `npm run test:coach-me:answers` | Opportunities + Expansion + Roadmap answers | All Coach Me answer suites |
| `npm run test:coach-me:everything` | all six of the above | Prompts and answers together |
| `npm run report` | | Open the last HTML report |

> **Opportunities and FFA Coach Me are disabled.** `coachMeOpportunities*.spec.ts`
> and `coachMeFFA*.spec.ts` are fully commented out, so `test:coach-me` /
> `test:coach-me-answers` currently run no tests. Uncomment a file to re-enable it.

### Test categories and cost

| Category | How to recognise it | Cost |
|----------|---------------------|------|
| Read-only UI checks | everything else | seconds per test |
| AI answer suites | title contains `should return a usable answer` | one real AI run per prompt (≈15 s to 3 min each) |
| Mutating chat creation | title starts with `should create a` | creates a real chat in the **Automation Project** and runs the agent (minutes each) |

The titles are what CI uses to pick suites, so keep these naming conventions when adding
tests. Use `--grep` / `--grep-invert` with the same strings locally, e.g.:

```bash
npx playwright test --grep-invert "should create a|should return a usable answer"   # smoke
```

The staging backend is slow and all credentialed tests share one account, so the
whole suite runs single-worker (`workers: 1`, `fullyParallel: false`). Don't override
it with `--workers`.

### One browser window per run

A run opens the browser **once** and every test drives that same window: handy when
watching a headed run, and much lighter on the shared staging account. This is done
with worker-scoped `context`/`page` fixtures in
[tests/support/fixtures.ts](tests/support/fixtures.ts); the login happens in that same
window, so there is no `globalSetup`.

- The login-form specs need a logged-out page, so they take `anonPage` instead of
  `page`. That is a second window in the **same** browser, created only when those
  specs run.
- Playwright discards a worker after a test failure, so a failing run reopens the
  window for the remaining tests (the saved session is reused, no second login).
- The AI answer suites run all prompts of a modal in **one** test (one step per
  prompt), so a failing prompt doesn't relaunch the browser for every remaining one.

### Timeouts

The default test timeout is **120 s** and the `expect` timeout **20 s**, to absorb the
slow staging backend. Long flows raise their own limit with `test.setTimeout()` (agent
chat creation allows up to 8 minutes).

### Type-checking

```bash
npx -p typescript tsc --noEmit
```

---

## Continuous Integration (GitHub Actions)

CI is defined in [.github/workflows/playwright.yml](.github/workflows/playwright.yml).
It runs on Ubuntu with bundled **Chromium**, headless, Node 24, single worker, and a
90-minute job timeout.

| Trigger | Suite | What runs |
|---------|-------|-----------|
| push / PR to `main` | **smoke** | Everything except AI answer suites and mutating tests (~10 min) |
| nightly, `0 20 * * *` UTC (23:00 Romania summer time) | **nightly** | Everything non-mutating, AI answer suites included (`--max-failures=20`) |
| manual (`workflow_dispatch`) | choose one | `smoke` \| `answers` \| `nightly` \| `full` \| `coach-me` |

- `answers` runs only the AI answer suites (`--max-failures=10`); `full` runs
  everything, including the mutating chat-creation tests; `coach-me` runs
  `npm run test:coach-me:everything`.
- Retries are 2 for smoke/full and 1 for nightly/answers, since a failing AI-answer
  attempt costs minutes.
- The run **fails immediately** if the credential secrets are missing, instead of
  passing with every test skipped.
- Reporters on CI: `github` (inline annotations), `list` (failures streamed live, so a
  cancelled run still shows what broke) and `html`.
- The HTML report is always uploaded as an artifact (`playwright-report-<run_id>`,
  kept 14 days), even on timeout.
- Only one run per ref at a time; a newer push cancels the older run.

GitHub cron is always UTC. Switch the schedule to `0 21 * * *` at the October clock
change to stay on 23:00 Romania time, and back to `0 20 * * *` in March.

### Required repository secrets

Add these under **Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|-------|
| `AICOACH_EMAIL` | staging account email |
| `AICOACH_PASSWORD` | staging account password |

They are mapped to the `EMAIL` / `PASSWORD` environment variables the suite reads;
credentials are never stored in the repository.

---

## Project structure

```
.
├── pages/                              # Page Object Model
│   ├── LoginPage.ts                    # PropelAuth login screen
│   ├── SalesCoachPage.ts               # Authenticated app shell + Sales Coach page, sidebar projects/chats
│   ├── DraftChatPage.ts                # Project view (agent cards) and the draft-chat form
│   ├── PersonalDigestPage.ts           # Personal Digest → Daily Digest / Market Trends
│   ├── CustomerValuePortalPage.ts      # Customer list, search, Demo Mode, currency, pagination
│   ├── CustomerAccountPage.ts          # Account detail: KPIs, tabs (Opportunities, FFA, Expansion Plan, Account Roadmap, …)
│   └── CoachMeModalPage.ts             # Coach Me modal: suggested questions, Ask, answers, Clear chat
├── tests/
│   ├── login-success.spec.ts           # Login form (logged-out `anonPage`)
│   ├── sales-coach.spec.ts             # Sales Coach landing + agent chat creation (mutating)
│   ├── downloadAgentResponse.spec.ts   # .docx export of every agent chat in a project
│   ├── personal-digest.spec.ts         # Daily Digest
│   ├── customer-cvp.spec.ts            # Customer Value Portal + account detail
│   ├── coachMeFFA*.spec.ts             # FFA Coach Me prompts + answers (currently disabled)
│   ├── expansionPlanCoachMe.spec.ts    # Expansion Plan Coach Me prompts (read-only)
│   ├── expansionPlanCoachMeAnswers.spec.ts
│   ├── accountRoadmapCoachMe.spec.ts   # Account Roadmap Coach Me prompts (read-only)
│   ├── accountRoadmapCoachMeAnswers.spec.ts
│   ├── coachMeOpportunities*.spec.ts   # Opportunities Coach Me (currently disabled)
│   ├── fixtures/transcript.txt         # Upload for the Upsell & Cross Sell agent
│   └── support/
│       ├── fixtures.ts                 # ONE browser/window for the whole run, shared `page`, `anonPage`
│       └── httpErrors.ts               # watchHttpErrors(): fail on app 4xx/5xx responses
├── support/
│   ├── credentials.ts                  # Credentials read from the environment
│   ├── session.ts                      # Logs in ONCE in the shared window, saves the session
│   └── routes.ts                       # App paths navigated to directly
├── scripts/
│   ├── run-secure.ps1                  # Any spec with a hidden password prompt / credentials.local.json
│   ├── run-sales-coach.ps1             # Sales Coach with a hidden password prompt
│   └── run-personal-digest.ps1         # Personal Digest with a hidden password prompt
├── features/                           # BDD (Gherkin) specification of the flows, one per area
├── playwright.config.ts                # Base URL, env-driven browser/headless/slowMo, single worker, reporters
├── tsconfig.json                       # Type-checking config (Node16, strict)
├── .github/workflows/playwright.yml    # CI
├── .github/agents/                     # AI agent definitions (see below)
├── .mcp.json / .vscode/mcp.json        # Playwright MCP server for Claude Code / VS Code
└── README.md
```

Spec files prefixed with `_` (e.g. `_scratch.spec.ts`) are ignored by the config, so
they can be used for local reconnaissance without ever running in CI.

---

## Architecture & conventions

### Page Object Model
UI structure and locators live in `pages/`; specs stay focused on behavior and
assertions. The app no longer emits `data-sentry-component` hooks, so locators are
anchored on accessible roles, labels, text and structure (`getByRole`, `getByText`,
`getByTestId` where available) rather than brittle CSS. Credential errors are matched by
message because PropelAuth renders them with generated (unstable) Mantine class names.

### Session reuse (log in once)
`support/session.ts` logs in a single time (in the run's shared window, on the first
test that needs it) and saves the authenticated session to
`playwright/.auth/user.json`. Later runs load that file, so they skip the login form
entirely; if the saved session has expired (staging redirects to PropelAuth), it logs in
again and refreshes the file. Credentialed specs therefore start **already
authenticated** and never re-login per test.

### Routes
Direct-navigation paths live in [support/routes.ts](support/routes.ts). The app does
**not** 404 on a stale path; it silently renders the Customer Value Portal list instead,
so a renamed route only shows up as "expected content never appeared". Update the path
there in one place.

### HTTP error watching
Flows that matter call `watchHttpErrors(page)` from
[tests/support/httpErrors.ts](tests/support/httpErrors.ts) and assert the collected list
is empty at the end, so any 4xx/5xx from the AI Coach host fails the test even if the
UI looks fine. Known transient errors can be tolerated (and logged) via `allow`.

### AI answer checks
Answers are non-deterministic prose, so the answer suites assert properties every valid
answer must have: the run completes, the question is echoed verbatim, there is exactly
one answer of substantial length, and no failure marker appears. After each prompt the
chat is cleared so the next one starts from an empty conversation.

### Credential safety in traces
Tracing is **off** (`trace: 'off'`). A Playwright trace captures network request bodies
and DOM snapshots, both of which contain real credentials on the login request and
account data afterwards, so no `trace.zip` / HTML-report artifact can embed them. Set
`TRACE=on` when you need to debug locally: it records one trace for the whole run
(login included). Treat that file as a secret and delete it. The session file
(`playwright/.auth/`) and `credentials.local.json` are gitignored.

### Headed Chrome on Windows
Chromium-based browsers launch with `--disable-gpu` and Windows occlusion detection
turned off. This fixes a headed window that renders **black** on some machines even
though the page is painted. Don't add `--disable-software-rasterizer`; it brings the
blank window back.

---

## AI agents

`.github/agents/` contains three QA-focused agent definitions used for AI-assisted test
work:

- **Agent Generator** generates Playwright specs / page objects from natural-language scenarios
- **Agent Healer** diagnoses failures and fixes flaky tests and broken locators
- **Agent Planner** plans test suites/tiers and CI/CD integration

`.mcp.json` (Claude Code) and `.vscode/mcp.json` (VS Code) wire up the Playwright MCP
server for browser-driven authoring.

---

## Reports

Test runs produce an HTML report in `playwright-report/`:

```bash
npm run report
```

On CI, download the `playwright-report-<run_id>` artifact from the workflow run.

---

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `No account found with those credentials` | Account not registered in the **staging** PropelAuth tenant, or wrong password. |
| Credentialed tests are skipped | Credential env vars not set for the run. Pass them in the command or use a `:secure` script. |
| CI fails at "Verify credentials are configured" | `AICOACH_EMAIL` / `AICOACH_PASSWORD` repository secrets are missing. |
| `Your account has been locked for security reasons` | Too many failed logins tripped PropelAuth's lockout; reset the password or wait. |
| `page.goto` timeout | Staging responding slowly; navigation uses `waitUntil: 'domcontentloaded'`, and re-running usually clears it. |
| Page loads but expected content never appears | Possibly a renamed route: the app falls back to the portal list instead of 404. Check [support/routes.ts](support/routes.ts). |
| Flaky failures when running in parallel | Shared staging account + slow backend. The config pins the run to one worker; don't override it with `--workers`. |
| A second browser window appears mid-run | Playwright discards the worker after a test failure and reopens the window; the login-form specs also use their own logged-out window. |
| Headed Chrome window is black | GPU/occlusion issue on Windows; the config's launch flags handle it. Make sure you haven't added `--disable-software-rasterizer`. |
| Run is too slow to watch / too slow overall | Tune `SLOWMO` (e.g. `SLOWMO=0`), or run `HEADLESS=true`. |
| `test:coach-me` runs 0 tests | The Opportunities Coach Me specs are commented out (disabled). |
