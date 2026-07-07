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
 *  - HEADLESS : true (default) | false
 *  - EMAIL    : login email
 *  - PASSWORD : login password (pass it in the command; or use
 *               `npm run test:sales-coach:secure` for a hidden prompt)
 */
const browserKey = (process.env.BROWSER ?? 'chrome').toLowerCase();
const headless = (process.env.HEADLESS ?? 'true').toLowerCase() !== 'false';

// Fix the black headed-Chrome window on Windows. The window renders black even
// though the page is actually painted (screenshots look correct) because
// Windows' native occlusion detection marks the window "occluded" and Chrome
// stops compositing it. Disabling CalculateNativeWinOcclusion (and backgrounding
// of occluded windows) keeps it painting; `--disable-gpu` covers GPU-compositing
// failures too. NOTE: do NOT add `--disable-software-rasterizer` — that removes
// the software fallback and leaves the window blank.
const CHROMIUM_LAUNCH = {
  launchOptions: {
    args: [
      // Force the whole GL stack to software (SwiftShader) so the visible
      // window composites without a working GPU, and stop Windows occlusion
      // detection from blanking it. This fixes the black/blank headed window
      // when the machine's GPU/driver can't composite Chrome.
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--disable-features=CalculateNativeWinOcclusion',
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
