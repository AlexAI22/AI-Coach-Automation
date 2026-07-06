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
    this.passwordInput = page.getByRole('textbox', { name: /password/i });
    this.loginButton = page.getByRole('button', { name: 'Log in with email' });
    this.forgotPasswordLink = page.getByRole('link', { name: 'Forgot password?' });
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
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async isLoaded(): Promise<void> {
    await expect(this.loginButton).toBeVisible();
    await expect(this.pageHeading).toBeVisible();
  }
}
