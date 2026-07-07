# AI Coach Automation

End-to-end UI test automation for the **AI Coach** application (staging), built with
[Playwright](https://playwright.dev/) and TypeScript. The suite covers the PropelAuth
login flow and the authenticated **Sales Coach** experience, using the Page Object Model
and a reused authentication session.

- **App under test:** `https://stage-aicoach.insight.com` (staging)
- **Auth provider:** PropelAuth (staging tenant `AICOACH-STAGING`)
- **UI framework:** Mantine

---

## Tech stack

| Tool | Purpose |
|------|---------|
| `@playwright/test` | Test runner, browser automation, assertions, HTML reporter |
| `typescript` / `@types/node` | Typed test/page-object code (editor + `tsc` type-checking) |
| `@playwright/mcp` | Playwright MCP server for AI-assisted authoring (see below) |

The browser and headed/headless mode are chosen at runtime via the `BROWSER` and
`HEADLESS` environment variables (see below); default is real **Google Chrome**, headless.

---

## Prerequisites

- **Node.js** 20.x, 22.x, or 24.x
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

Credentials are **not stored in the repo** — pass them as environment variables in the
command that runs the tests. No `.env` loader is used.

| Variable | Values | Default |
|----------|--------|---------|
| `EMAIL` | staging account email | — (required) |
| `PASSWORD` | staging account password | — (required) |
| `BROWSER` | `chrome` \| `chromium` \| `edge` \| `firefox` \| `webkit` | `chrome` |
| `HEADLESS` | `true` \| `false` | `true` |

```powershell
# PowerShell
$env:BROWSER="chrome"; $env:EMAIL="you@insight.com"; $env:PASSWORD="your-password"; npm run test:sales-coach
```

```bash
# bash / CI
BROWSER=chrome EMAIL='you@insight.com' PASSWORD='your-password' npm run test:sales-coach
```

To keep the password off the command line entirely, use the hidden prompt instead
(set `EMAIL` first): `npm run test:sales-coach:secure`.

---

## Running the tests

| Command | Description |
|---------|-------------|
| `npm test` | Full suite in the `BROWSER` (default Chrome) |
| `npm run test:headed` | Full suite with a visible browser |
| `npm run test:login` | Login form tests |
| `npm run test:login:headed` | Login form tests, visible browser |
| `npm run test:sales-coach` | Authenticated Sales Coach tests (`--workers=1`) |
| `npm run test:sales-coach:headed` | Sales Coach tests, visible browser |
| `npm run test:sales-coach:secure` | Sales Coach tests, password entered at a hidden prompt |
| `npm run report` | Open the last HTML report |

> Prefix any command with the credential/browser env vars, e.g.
> `$env:EMAIL="..."; $env:PASSWORD="..."; npm run test:sales-coach`.
> The staging backend is slow and all credentialed tests share one account, so the
> Sales Coach scripts already run with `--workers=1`.

### Type-checking

```bash
npx -p typescript tsc --noEmit
```

---

## Continuous Integration (GitHub Actions)

CI is defined in [.github/workflows/playwright.yml](.github/workflows/playwright.yml):

- **Triggers:** push to `main`, pull requests, and manual `workflow_dispatch`
  (a nightly schedule is included but currently commented out).
- **Runtime:** Ubuntu + bundled **Chromium**, headless. `CI=true` enables 2 retries
  and single-worker mode (shared staging account).
- **Suites:**
  - push / PR / nightly → **smoke** (fast, non-mutating tests only — the mutating
    chat-creation tests are excluded via `--grep-invert "should create a"`).
  - manual run → choose **smoke** or **full** (full also runs the ~2-minute agent
    chat-creation tests).
- The HTML report is uploaded as a build artifact (`playwright-report-<run_id>`).

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
├── pages/                     # Page Object Model
│   ├── LoginPage.ts           # PropelAuth login screen
│   └── SalesCoachPage.ts      # Authenticated app shell + Sales Coach page
├── tests/
│   ├── login-success.spec.ts  # Login form tests (logged-out)
│   └── sales-coach.spec.ts     # Sales Coach tests (reused auth session)
├── global-setup.ts            # Logs in ONCE, saves the session for reuse
├── playwright.config.ts       # Base URL, env-driven browser/headless, reporter, global setup
├── tsconfig.json              # Type-checking config (Node16, strict)
├── scripts/run-sales-coach.ps1 # Runs Sales Coach tests with a hidden password prompt
├── features/                  # BDD (Gherkin) specification of the flows
└── .github/agents/            # AI agent definitions (see below)
```

---

## Architecture & conventions

### Page Object Model
UI structure and locators live in `pages/`; specs stay focused on behavior and
assertions. Locators favor accessible roles/labels (`getByRole`, `getByText`) over
brittle CSS, and credential errors are matched by message because PropelAuth renders
them with generated (unstable) Mantine class names.

### Session reuse (log in once)
`global-setup.ts` logs in a single time before the run and saves the authenticated
session to `playwright/.auth/user.json`. The Sales Coach specs opt in with
`test.use({ storageState: ... })`, so they start **already authenticated** and never
re-login — making them fast and avoiding repeated logins against the shared account.
The login form specs deliberately stay logged-out to test the login page itself.

### Credential safety in traces
`sales-coach.spec.ts` runs with `trace: 'off'`. A Playwright trace captures network
request bodies and DOM snapshots, both of which contain real credentials on the login
request — disabling tracing for credentialed specs ensures no `trace.zip` / HTML-report
artifact can embed them. The session file (`playwright/.auth/`) is gitignored, and
credentials are passed as environment variables at runtime — never stored in the repo.

---

## AI agents

`.github/agents/` contains three QA-focused agent definitions used for AI-assisted test
work:

- **Agent Generator** — generates Playwright specs / page objects from natural-language scenarios
- **Agent Healer** — diagnoses failures, fixes flaky tests and broken locators
- **Agent Planner** — plans test suites/tiers and CI/CD integration

`.vscode/mcp.json` wires up the Playwright MCP server for browser-driven authoring inside
the editor.

---

## Reports

Test runs produce an HTML report in `playwright-report/`:

```bash
npm run report
```

---

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `No account found with those credentials` | Account not registered in the **staging** PropelAuth tenant, or wrong password. |
| Credentialed tests are skipped | `EMAIL` / `PASSWORD` env vars not set for the run — pass them in the command. |
| `Your account has been locked for security reasons` | Too many failed logins tripped PropelAuth's lockout; reset the password or wait. |
| `page.goto` timeout in `beforeEach` | Staging responding slowly; navigation uses `waitUntil: 'domcontentloaded'`, and re-running usually clears it. |
| Flaky failures when running everything in parallel | Shared staging account + slow backend. Run with `--workers=1`. |
```
