import { chromium, type FullConfig } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { getEmail, getPassword } from './support/credentials';

/**
 * Logs in ONCE before the whole run and saves the authenticated session to
 * playwright/.auth/user.json. Tests that opt in via
 * `test.use({ storageState: AUTH_FILE })` then start already logged in, so the
 * suite does not re-authenticate (or log out) for every test.
 *
 * Runs only when credentials are available (AICoach_MICROSOFT_EMAIL/
 * AICoach_MICROSOFT_PASSWORD, or the legacy EMAIL/PASSWORD); credentialed tests
 * skip themselves when the session file is absent.
 */
export const AUTH_FILE = 'playwright/.auth/user.json';

async function globalSetup(config: FullConfig): Promise<void> {
  const email = getEmail();
  const password = getPassword();
  if (!email || !password) {
    console.warn(
      '[global-setup] No credentials set (AICoach_MICROSOFT_EMAIL/AICoach_MICROSOFT_PASSWORD or EMAIL/PASSWORD) — skipping auth; credentialed tests will skip.',
    );
    return;
  }

  const baseURL = config.projects[0]?.use?.baseURL;

  // Launch the SAME browser the test projects use (see playwright.config.ts).
  // The staging PropelAuth login does not complete under bundled *headless
  // Chromium* (`chromium.launch()`), so honour BROWSER/HEADLESS here and default
  // to the real Google Chrome channel, headed locally — matching what works
  // interactively and in the login-success tests.
  const isCI = !!process.env.CI;
  const browserKey = (process.env.BROWSER ?? 'chrome').toLowerCase();
  const headless = (process.env.HEADLESS ?? (isCI ? 'true' : 'false')).toLowerCase() !== 'false';
  // Map the browser key to a Chromium channel; unknown keys fall back to real Chrome.
  const channel = browserKey === 'edge' ? 'msedge' : browserKey === 'chromium' ? undefined : 'chrome';

  const browser = await chromium.launch({ headless, channel });
  const page = await browser.newPage({ baseURL });
  try {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.isLoaded();
    await loginPage.loginExpectingSuccess(email, password);
    await page.context().storageState({ path: AUTH_FILE });
  } finally {
    await browser.close();
  }
}

export default globalSetup;
