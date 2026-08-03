import fs from 'fs';
import type { Page } from '@playwright/test';
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
export async function ensureAuthenticated(page: Page): Promise<void> {
  const email = getEmail();
  const password = getPassword();
  if (!email || !password) {
    console.warn(
      '[session] No credentials set (AICoach_MICROSOFT_EMAIL/AICoach_MICROSOFT_PASSWORD or EMAIL/PASSWORD) — skipping login; credentialed tests will skip.',
    );
    return;
  }

  // Staging redirects to PropelAuth when the session is missing or expired, so
  // the landing URL tells us whether the saved session is still good.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  if (!/login/i.test(page.url())) return;

  const loginPage = new LoginPage(page);
  await loginPage.isLoaded();
  await loginPage.loginExpectingSuccess(email, password);
  // Save (or refresh) the session so subsequent runs skip the login form.
  await page.context().storageState({ path: AUTH_FILE });
}
