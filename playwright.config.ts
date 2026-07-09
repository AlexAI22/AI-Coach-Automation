import { defineConfig, devices } from '@playwright/test';

/**
 * Runtime configuration via environment variables — nothing sensitive lives in
 * the repo, and no .env loader is used. Set them in your shell before running,
 * e.g. (PowerShell):
 *
 *   $env:BROWSER="chrome"; $env:HEADLESS="false"; `
 *   $env:EMAIL="you@insight.com"; $env:PASSWORD="<secret>"; `
 *   npm run test:sales-coach
 *
 *  - BROWSER  : chrome (default) | chromium | edge | firefox | webkit
 *  - HEADLESS : false (default locally, so you SEE the browser) | true.
 *               Forced true on CI (no display available there).
 *  - SLOWMO   : ms to pause before each action so you can watch what the test
 *               does (default 250 locally, 0 on CI). Set 0 to disable.
 *  - EMAIL    : login email
 *  - PASSWORD : login password (pass it in the command; or use
 *               `npm run test:sales-coach:secure` for a hidden prompt)
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
  /* Log in once before the run; credentialed tests reuse the saved session. */
  globalSetup: require.resolve('./global-setup'),
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* The staging backend renders content asynchronously and slowly, so give
     web-first assertions more room than the 5s default. */
  expect: { timeout: 20000 },
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: 'https://stage-aicoach.insight.com',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

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
