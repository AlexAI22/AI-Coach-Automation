import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly forgotPasswordLink: Locator;
  readonly signInWithSSOLink: Locator;
  readonly signUpLink: Locator;
  readonly pageHeading: Locator;
  /** Inline error shown below the email field on empty submit */
  readonly emailError: Locator;
  /** Inline error shown below the password field on empty submit */
  readonly passwordError: Locator;
  /** Form-level error shown after submitting credentials that don't match an account */
  readonly loginError: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByRole('textbox', { name: /email/i });
    // The Mantine PasswordInput field has no accessible name and its type flips
    // between "password" and "text" via the visibility toggle, so locate it by
    // its stable autocomplete attribute (fall back to type=password).
    this.passwordInput = page
      .locator('input[autocomplete="current-password"]')
      .or(page.locator('input[type="password"]'))
      .first();
    this.loginButton = page.getByRole('button', { name: 'Log in with email' });
    this.forgotPasswordLink = page.getByRole('link', { name: 'Forgot password?' });
    // The "Sign in with SSO" link is always in the DOM but rendered hidden by
    // default (opacity:0 + pointer-events:none); PropelAuth only reveals it
    // conditionally. Assert on attachment rather than visibility.
    this.signInWithSSOLink = page.getByRole('link', { name: 'Sign in with SSO' });
    this.signUpLink = page.getByRole('link', { name: 'Sign up' });
    this.pageHeading = page.getByRole('heading', { name: /log in to/i });
    // Mantine renders field-level validation errors with these stable component classes
    this.emailError = page.locator('[class*="TextInput-error"]');
    this.passwordError = page.locator('[class*="PasswordInput-error"]');
    // Form-level error after a rejected submit. PropelAuth renders it as a
    // Mantine Text node with only generated classes, so match it by message.
    // Covers both "no such account" and the lockout response.
    this.loginError = page.getByText(
      /no account found with those credentials|your account has been locked/i,
    );
  }

  /**
   * Logs in and waits for a successful authentication, i.e. the app navigates
   * away from the login screen.
   *
   * NOTE: credentials are inherently present in the login network request, which
   * a Playwright trace would capture. The credentialed test that calls this runs
   * with `trace: 'off'` (see login.spec.ts) so no trace.zip ever embeds them.
   */
  async loginExpectingSuccess(email: string, password: string): Promise<void> {
    await this.login(email, password);
    await expect(this.page).not.toHaveURL(/login/, { timeout: 15000 });
  }

  async goto(): Promise<void> {
    // Staging redirects to PropelAuth; wait for the DOM rather than every
    // resource so a slow third-party asset can't stall navigation.
    await this.page.goto('/', { waitUntil: 'domcontentloaded' });
  }

  async login(email: string, password: string): Promise<void> {
    await this.fillStable(this.emailInput, email);
    await this.fillStable(this.passwordInput, password);
    await this.loginButton.click();
  }

  /**
   * Fills a PropelAuth field and confirms the value actually stuck.
   *
   * The PropelAuth email field runs an async SSO/email check on first input and
   * re-renders the (controlled) input right after. A plain `fill()` is wiped by
   * that re-render (leaving the field empty -> "Email required") and
   * `pressSequentially` loses its leading keystrokes (wrong email -> "No account
   * found"). So we fill, let the check settle, and re-fill until the DOM value
   * matches what we intended before moving on.
   */
  private async fillStable(field: Locator, value: string): Promise<void> {
    // A single-line input silently drops newlines, so the value that can
    // actually land in the field is the input minus any CR/LF. Compare against
    // that so a credential stored with a stray newline can't make the check
    // loop forever (and then hard-fail) even though the field holds the right text.
    const expected = value.replace(/[\r\n]+/g, '');
    await field.click();
    await field.fill(expected);
    for (let attempt = 0; attempt < 5; attempt++) {
      await this.page.waitForTimeout(500);
      if ((await field.inputValue()) === expected) return;
      await field.fill(expected);
    }
    // Surface a clear failure rather than submitting a half-typed value.
    await expect(field).toHaveValue(expected, { timeout: 3000 });
  }

  async isLoaded(): Promise<void> {
    await expect(this.loginButton).toBeVisible();
    await expect(this.pageHeading).toBeVisible();
  }
}
