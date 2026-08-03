import { defineConfig, devices } from '@playwright/test';

/**
 * Runtime configuration via environment variables — nothing sensitive lives in
 * the repo, and no .env loader is used. Set them in your shell before running,
 * e.g. (PowerShell):
 *
 *   $env:Browser="Chrome"; $env:Headless="false"; `
 *   $env:AICoach_MICROSOFT_EMAIL="you@insight.com"; `
 *   $env:AICoach_MICROSOFT_PASSWORD="<secret>"; `
 *   npm run test:sales-coach
 *
 *  - BROWSER  : chrome (default) | chromium | edge | firefox | webkit
 *               (env var names are case-insensitive on Windows, and the value
 *               is lowercased, so `$env:Browser="Chrome"` also works)
 *  - HEADLESS : false (default locally, so you SEE the browser) | true.
 *               Forced true on CI (no display available there).
 *  - SLOWMO   : ms to pause before each action so you can watch what the test
 *               does (default 250 locally, 0 on CI). Set 0 to disable.
 *  - TRACE    : on = record ONE trace for the whole run (off by default; the
 *               file contains the login request, so keep it local).
 *  - AICoach_MICROSOFT_EMAIL    : login email (legacy fallback: EMAIL)
 *  - AICoach_MICROSOFT_PASSWORD : login password (legacy fallback: PASSWORD).
 *               Pass it in the command, or use
 *               `npm run test:sales-coach:secure` for a hidden prompt.
 */
const isCI = !!process.env.CI;
const browserKey = (process.env.BROWSER ?? 'chrome').toLowerCase();
// Show the browser by default when running locally; always headless on CI.
const headless = (process.env.HEADLESS ?? (isCI ? 'true' : 'false')).toLowerCase() !== 'false';
// Pace each action so it's watchable locally; no artificial delay on CI.
const slowMo = Number(process.env.SLOWMO ?? (isCI ? '0' : '250'));

// Fix the black headed-Chrome window on Windows. The window renders black even
// though the page is actually painted (screenshots look correct) because
// Windows' native occlusion detection marks the window "occluded" and Chrome
// stops compositing it. Disabling CalculateNativeWinOcclusion (and backgrounding
// of occluded windows) keeps it painting; `--disable-gpu` covers GPU-compositing
// failures too. NOTE: do NOT add `--disable-software-rasterizer` — that removes
// the software fallback and leaves the window blank.
const CHROMIUM_LAUNCH = {
  launchOptions: {
    // Slow each action down so the run is watchable in a headed window.
    slowMo,
    args: [
      // Turn off GPU compositing entirely and fall back to CPU. On machines
      // whose GPU/driver can't composite Chrome, the visible window renders
      // black — disabling the GPU is the most reliable fix. (The SwiftShader
      // "--use-gl=angle --use-angle=swiftshader" combo was tried first but
      // still produced a black window on this hardware.)
      '--disable-gpu',
      // Occlusion detection has two halves: the calculation and the
      // backgrounding it triggers. Disable both so Windows doesn't mark the
      // window "occluded" and stop compositing it (also a black-window cause).
      '--disable-features=CalculateNativeWinOcclusion',
      '--disable-backgrounding-occluded-windows',
    ],
  },
};

const BROWSERS: Record<string, { name: string; use: Record<string, unknown> }> = {
  chrome: { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome', ...CHROMIUM_LAUNCH } },
  chromium: { name: 'chromium', use: { ...devices['Desktop Chrome'], ...CHROMIUM_LAUNCH } },
  edge: { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge', ...CHROMIUM_LAUNCH } },
  firefox: { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  webkit: { name: 'webkit', use: { ...devices['Desktop Safari'] } },
};
const selectedBrowser = BROWSERS[browserKey] ?? BROWSERS.chrome;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Ignore scratch/recon specs (prefixed with an underscore) so they never run
     in CI or a normal `playwright test`. */
  testIgnore: '**/_*.spec.ts',
  /* ONE browser window for the whole run: a single worker (so a single browser
     process) driving the worker-scoped page from tests/support/fixtures.ts. The
     login also happens in that window, which is why there is no globalSetup —
     it used to open (and close) a browser of its own before the run. */
  fullyParallel: false,
  workers: 1,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* The staging backend renders content asynchronously and slowly, so give
     web-first assertions more room than the 5s default. */
  expect: { timeout: 20000 },
  /* The first test also pays for opening the shared window (and, on the first
     run of the day, the login) — the 30s default is not enough for that against
     slow staging. Long flows still raise it further via test.setTimeout(). */
  timeout: 120000,
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: 'https://stage-aicoach.insight.com',

    /* No tracing. The suite runs against a real staging account in a reused
       session, so a trace.zip would embed account data (and the login request).
       Per-test artifacts do not apply to the shared window anyway — set
       TRACE=on for a single whole-run trace when debugging locally. */
    trace: 'off',

    /* Headed/headless is driven by the HEADLESS env var (default headless). */
    headless,
  },

  /* Single project selected by the BROWSER env var (default real Google Chrome). */
  projects: [
    {
      name: selectedBrowser.name,
      use: selectedBrowser.use,
    },
  ],
});
