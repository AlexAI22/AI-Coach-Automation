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
| `dotenv` | Loads credentials from `.env` |
| `@playwright/mcp` | Playwright MCP server for AI-assisted authoring (see below) |

Tests run on **Chromium, Firefox, and WebKit** (configurable in `playwright.config.ts`).

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

# 3. Configure credentials
cp .env.example .env
#   then edit .env with your staging account
```

### `.env`

```ini
EMAIL=your-email@example.com
PASSWORD="your-password"
```

> **Important:** wrap the password in **double quotes** if it contains `#` or `$` —
> in `.env` syntax an unquoted `#` starts a comment and would silently truncate the value.

Credentials can also be supplied directly from the terminal (these override `.env`):

```powershell
# PowerShell
$env:EMAIL='your-email@example.com'; $env:PASSWORD='your-password'; npm run test:sales-coach
```

```bash
# bash / CI
EMAIL='your-email@example.com' PASSWORD='your-password' npm run test:sales-coach
```

---

## Running the tests

| Command | Description |
|---------|-------------|
| `npm test` | Full suite, all 3 browsers |
| `npm run test:chrome` | Full suite, Chromium only |
| `npm run test:headed` | Full suite with a visible browser |
| `npm run test:login` | Login form tests (Chromium) |
| `npm run test:login:headed` | Login form tests, visible browser |
| `npm run test:sales-coach` | Authenticated Sales Coach tests (Chromium) |
| `npm run test:sales-coach:headed` | Sales Coach tests, visible browser |
| `npm run report` | Open the last HTML report |

> The staging backend is slow and all credentialed tests share one account. For a
> reliable run, add `--workers=1` (e.g. `npm run test:chrome -- --workers=1`).

### Type-checking

```bash
npx -p typescript tsc --noEmit
```

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
├── playwright.config.ts       # Base URL, projects, reporter, global setup
├── tsconfig.json              # Type-checking config (Node16, strict)
├── .env / .env.example        # EMAIL / PASSWORD
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
artifact can embed them. The session file (`playwright/.auth/`) and `.env` are gitignored.

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
| Password seems truncated / login fails with `#` or `$` in it | Quote the value in `.env`: `PASSWORD="..."`. |
| `Your account has been locked for security reasons` | Too many failed logins tripped PropelAuth's lockout; reset the password or wait. |
| `page.goto` timeout in `beforeEach` | Staging responding slowly; navigation uses `waitUntil: 'domcontentloaded'`, and re-running usually clears it. |
| Flaky failures when running everything in parallel | Shared staging account + slow backend. Run with `--workers=1`. |
```
