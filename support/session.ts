import fs from 'fs';
import { expect, type Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { getEmail, getPassword } from './credentials';

/**
 * Authenticated session shared by the whole run.
 *
 * The login happens ONCE, in the single browser window the suite uses (see
 * tests/support/fixtures.ts) — there is no separate globalSetup browser any
 * more. The resulting cookies/localStorage are saved to AUTH_FILE so later runs
 * start already logged in and skip the login form altogether.
 */
export const AUTH_FILE = 'playwright/.auth/user.json';

/** True when a previous run left a usable session file behind. */
export function savedSessionExists(): boolean {
  try {
    return fs.statSync(AUTH_FILE).size > 0;
  } catch {
    return false;
  }
}

/**
 * Makes sure `page` is logged in, reusing the saved session when it is still
 * valid and logging in (once) when it is not.
 *
 * Called from the worker-scoped page fixture, so it runs a single time per run:
 * every test then starts from an authenticated window without re-authenticating.
 * Does nothing when no credentials are set — the credentialed tests skip
 * themselves in that case.
 */
/**
 * In-flight/completed auth for this worker process. The fixture that calls this
 * is worker-scoped, so it already runs once per run — this memo makes that a
 * guarantee rather than a consequence of fixture scoping: any extra caller gets
 * the same result without a second trip to the login form. A worker restart
 * re-imports the module and resets it, which is correct — that is a new browser.
 */
let authInFlight: Promise<void> | null = null;

export async function ensureAuthenticated(page: Page): Promise<void> {
  if (authInFlight) return authInFlight;
  // Reset on failure so a retry can genuinely try again.
  authInFlight = authenticate(page).catch((error) => {
    authInFlight = null;
    throw error;
  });
  return authInFlight;
}

async function authenticate(page: Page): Promise<void> {
  const email = getEmail();
  const password = getPassword();
  if (!email || !password) {
    console.warn(
      '[session] No credentials set (AICoach_MICROSOFT_EMAIL/AICoach_MICROSOFT_PASSWORD or EMAIL/PASSWORD) — skipping login; credentialed tests will skip.',
    );
    return;
  }

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const loginPage = new LoginPage(page);
  // The authenticated app shell; PropelAuth's login page is a separate app and
  // carries no data-sentry-component hooks, so this cannot match there.
  const appShell = page.locator('[data-sentry-component="Header"]');

  // Staging redirects to PropelAuth when the session is missing or expired, but
  // that redirect is CLIENT-SIDE and happens after domcontentloaded. Reading
  // page.url() here would race it and, when it lost, wrongly conclude the saved
  // session was still good — skipping the login and stranding every later
  // navigation on the login form (which surfaces as an unrelated "element not
  // found" timeout deep in a test). So wait for whichever actually renders.
  await expect(
    loginPage.loginButton.or(appShell).first(),
    'Neither the AI Coach app shell nor the PropelAuth login form rendered',
  ).toBeVisible({ timeout: 45000 });

  if (await appShell.isVisible()) {
    console.warn('[session] Saved session still valid — no login needed this run.');
    // Re-save it so the refreshed token is persisted rather than letting the
    // stored one age out silently.
    await page.context().storageState({ path: AUTH_FILE });
    return;
  }

  console.warn('[session] Saved session missing or expired — logging in once for this run.');
  await loginPage.isLoaded();
  await loginPage.loginExpectingSuccess(email, password);
  // Save (or refresh) the session so subsequent runs skip the login form.
  await page.context().storageState({ path: AUTH_FILE });
}
