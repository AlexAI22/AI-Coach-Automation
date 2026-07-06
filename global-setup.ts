import { chromium, type FullConfig } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

/**
 * Logs in ONCE before the whole run and saves the authenticated session to
 * playwright/.auth/user.json. Tests that opt in via
 * `test.use({ storageState: AUTH_FILE })` then start already logged in, so the
 * suite does not re-authenticate (or log out) for every test.
 *
 * Runs only when EMAIL/PASSWORD are available; credentialed tests skip
 * themselves when the session file is absent.
 */
export const AUTH_FILE = 'playwright/.auth/user.json';

async function globalSetup(config: FullConfig): Promise<void> {
  const email = process.env.EMAIL;
  const password = process.env.PASSWORD;
  if (!email || !password) {
    console.warn('[global-setup] EMAIL/PASSWORD not set — skipping auth; credentialed tests will skip.');
    return;
  }

  const baseURL = config.projects[0]?.use?.baseURL;
  const browser = await chromium.launch();
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
