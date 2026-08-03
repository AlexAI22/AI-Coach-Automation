import path from 'path';
import { test as base, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { AUTH_FILE, ensureAuthenticated, savedSessionExists } from '../../support/session';

/**
 * ONE browser, opened once, for the whole run.
 *
 * Playwright's built-in `page`/`context` fixtures are test-scoped: every test
 * gets a fresh context, which in a headed run means a new browser window
 * flashing up for each test — plus one more for the old globalSetup login. Here
 * the context and page are WORKER-scoped and the built-in `page`/`context`
 * fixtures are overridden to hand those shared instances back, so every test
 * drives the same window and the login happens in it too.
 *
 * With `workers: 1` + `fullyParallel: false` (playwright.config.ts) a run
 * therefore launches exactly one browser process.
 *
 * Everything lives in a single `test` object on purpose: Playwright restarts the
 * worker (and so launches another browser) when a spec file uses a different set
 * of worker fixtures. Specs that need a logged-OUT page ask for `anonPage`
 * instead of `page` — that second window is created lazily, only when such a
 * spec actually runs, and shares this same browser.
 *
 * TRADE-OFF: Playwright's per-test artifacts (trace/video/screenshot on failure)
 * hang off the built-in context fixture, so they are not produced for the shared
 * window. Tracing is off by default anyway — these specs run against a real
 * staging account in a reused session, and a trace would embed account data. For
 * debugging, set TRACE=on to record ONE trace for the whole run; it contains the
 * login request, so keep it local and delete it afterwards.
 */

type SharedWorkerFixtures = {
  /** The single browser context every authenticated test shares. */
  sharedContext: BrowserContext;
  /** The single page (window) every authenticated test shares. */
  sharedPage: Page;
  /** Logged-out context, created only if a spec asks for `anonPage`. */
  anonContext: BrowserContext;
  /** The logged-out window backing `anonPage`. */
  anonWindow: Page;
};

type SharedTestFixtures = {
  /**
   * A logged-out page in the same browser, for specs that exercise the login
   * form itself. Cookies are cleared after each test so the next one starts
   * from a clean slate in the same window.
   */
  anonPage: Page;
};

const TRACE_ENABLED = (process.env.TRACE ?? '').toLowerCase() === 'on';

/**
 * Context options that cannot come from the config's `use` block.
 *
 * `browser.newContext()` inherits the project-level options (baseURL, viewport,
 * userAgent, ...) but not per-file `test.use({ ... })`, so the options the specs
 * used to set there are applied here instead.
 */
function sharedContextOptions(browser: Browser, storageState: string | undefined) {
  // The Personal Digest "copy talking point" test reads navigator.clipboard.
  // Only Chromium knows these permission names, so don't send them to
  // Firefox/WebKit (BROWSER=firefox|webkit), where newContext would reject them.
  const permissions =
    browser.browserType().name() === 'chromium'
      ? ['clipboard-read', 'clipboard-write']
      : undefined;
  return { storageState, permissions };
}

export const test = base.extend<SharedTestFixtures, SharedWorkerFixtures>({
  sharedContext: [
    async ({ browser }, use, workerInfo) => {
      // Reuse a previously saved session when there is one; otherwise the
      // context starts clean and ensureAuthenticated() logs in below.
      const context = await browser.newContext(
        sharedContextOptions(browser, savedSessionExists() ? AUTH_FILE : undefined),
      );
      if (TRACE_ENABLED) {
        console.warn('[fixtures] TRACE=on — the run trace will contain the login request. Keep it local.');
        await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      }
      await use(context);
      if (TRACE_ENABLED) {
        const tracePath = path.join(workerInfo.project.outputDir, 'run-trace.zip');
        await context.tracing.stop({ path: tracePath });
        console.warn(`[fixtures] Run trace written to ${tracePath}`);
      }
      await context.close();
    },
    { scope: 'worker' },
  ],

  sharedPage: [
    async ({ sharedContext }, use) => {
      const page = await sharedContext.newPage();
      // Logs in once per run, in this very window, and only if the saved session
      // is missing or expired.
      await ensureAuthenticated(page);
      await use(page);
      // The page goes away with the context above.
    },
    { scope: 'worker' },
  ],

  anonContext: [
    async ({ browser }, use) => {
      const context = await browser.newContext(sharedContextOptions(browser, undefined));
      await use(context);
      await context.close();
    },
    { scope: 'worker' },
  ],

  anonWindow: [
    async ({ anonContext }, use) => {
      await use(await anonContext.newPage());
    },
    { scope: 'worker' },
  ],

  context: async ({ sharedContext }, use) => {
    await use(sharedContext);
  },

  page: async ({ sharedPage }, use) => {
    await use(sharedPage);
    // watchHttpErrors() adds a 'response' listener per test; on a long-lived
    // page those would pile up (and keep filling the arrays of finished tests),
    // so drop them between tests.
    sharedPage.removeAllListeners('response');
  },

  anonPage: async ({ anonWindow }, use) => {
    await use(anonWindow);
    await anonWindow.context().clearCookies();
    anonWindow.removeAllListeners('response');
  },
});

export { expect, AUTH_FILE };
