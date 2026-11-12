import path from 'path';
import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';
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
 * window. The automatic `failureArtifacts` fixture below fills the screenshot
 * gap: every failing test gets a screenshot, the URL and an ARIA snapshot of
 * each open window attached to its report entry. Tracing is off by default anyway — these specs run against a real
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
  /** Automatic: attaches a screenshot + page state to every failing test. */
  failureArtifacts: void;
};

const TRACE_ENABLED = (process.env.TRACE ?? '').toLowerCase() === 'on';

/**
 * FAILURE_ARTIFACTS=off disables the failure screenshots (default on). They
 * show staging account data, which is the same data the HTML report's error
 * messages already hold. Unlike a trace, they contain no login request.
 */
const FAILURE_ARTIFACTS_ENABLED = (process.env.FAILURE_ARTIFACTS ?? 'on').toLowerCase() !== 'off';

/**
 * The windows this worker has opened, by name. failureArtifacts captures
 * whichever ones exist when a test fails, without asking for them as fixtures:
 * depending on sharedPage would force a login even for the logged-out specs.
 * The worker fixtures below register and unregister their pages here.
 */
const openWindows = new Map<string, Page>();

/** Caps each capture so a hung page cannot eat the teardown budget. */
const CAPTURE_TIMEOUT_MS = 10000;

/**
 * Attaches, for each open window: a viewport screenshot, its URL, and an ARIA
 * snapshot of the page (a compact text tree of what was on screen; it is
 * searchable and survives where a screenshot is ambiguous). Every capture is
 * best-effort: a failure to capture must never replace the test's real error.
 */
async function attachFailureArtifacts(testInfo: TestInfo): Promise<void> {
  for (const [name, page] of openWindows) {
    if (page.isClosed()) continue;
    try {
      await testInfo.attach(`failure-${name}-screenshot`, {
        body: await page.screenshot({ timeout: CAPTURE_TIMEOUT_MS, animations: 'disabled' }),
        contentType: 'image/png',
      });
    } catch (error) {
      console.warn(`[fixtures] Could not screenshot the ${name} window: ${(error as Error).message}`);
    }
    try {
      const aria = await page.locator('body').ariaSnapshot({ timeout: CAPTURE_TIMEOUT_MS });
      await testInfo.attach(`failure-${name}-page-state`, {
        body: `URL: ${page.url()}\n\n${aria}`,
        contentType: 'text/plain',
      });
    } catch (error) {
      await testInfo.attach(`failure-${name}-page-state`, {
        body: `URL: ${page.url()}\n\n(ARIA snapshot unavailable: ${(error as Error).message})`,
        contentType: 'text/plain',
      });
    }
  }
}

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
      openWindows.set('shared', page);
      // Logs in once per run, in this very window, and only if the saved session
      // is missing or expired.
      await ensureAuthenticated(page);
      await use(page);
      openWindows.delete('shared');
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
      const page = await anonContext.newPage();
      openWindows.set('anon', page);
      await use(page);
      openWindows.delete('anon');
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

  /*
   * Replaces Playwright's `screenshot: 'only-on-failure'`, which hangs off the
   * built-in per-test context and so never fires for the shared window. It
   * declares no dependencies, so Playwright sets it up first and tears it down
   * LAST, after the test body and the `page`/`anonPage` teardowns. The window is
   * still open then (the worker owns it) and still shows the state at the
   * failure. Expected failures (test.fail(), see support/knownIssues.ts) count
   * as passing, so they produce no artifacts.
   */
  failureArtifacts: [
    async ({}, use, testInfo) => {
      await use();
      if (FAILURE_ARTIFACTS_ENABLED && testInfo.status !== testInfo.expectedStatus) {
        await attachFailureArtifacts(testInfo);
      }
    },
    { auto: true },
  ],
});

export { expect, AUTH_FILE };
