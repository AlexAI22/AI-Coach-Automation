import { test, expect } from './support/fixtures';
import { LoginPage } from '../pages/LoginPage';

/**
 * Login-form behaviour, so these tests need a LOGGED-OUT page: they take
 * `anonPage` instead of `page`. It is a second window in the SAME browser as the
 * rest of the suite (see tests/support/fixtures.ts), opened once and reused by
 * every test here, with cookies cleared in between.
 */
test.describe('Login', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ anonPage }) => {
    loginPage = new LoginPage(anonPage);
    await loginPage.goto();
    await loginPage.isLoaded();
  });

  test('should display all login form elements', async () => {
    await expect(loginPage.pageHeading).toBeVisible();
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.loginButton).toBeVisible();
    await expect(loginPage.forgotPasswordLink).toBeVisible();
    await expect(loginPage.signUpLink).toBeVisible();
    // The "Sign in with SSO" link is present in the DOM but hidden by default
    // (opacity:0; pointer-events:none), so assert it's attached, not visible.
    await expect(loginPage.signInWithSSOLink).toBeAttached();
  });

  test('should reject invalid credentials and keep the user on the login page', async ({ anonPage }) => {
    await loginPage.login('invalid@test.com', 'WrongPassword123!');
    // Invalid credentials must not authenticate: the user stays on the
    // PropelAuth login page with the form still available. The provider no
    // longer renders a locatable inline error node, so we assert the behaviour
    // (no authentication) rather than a specific message.
    await expect(anonPage).toHaveURL(/login/, { timeout: 15000 });
    await expect(loginPage.loginButton).toBeVisible();
    await expect(loginPage.emailInput).toBeVisible();
  });

  test('should not authenticate when submitting empty fields', async ({ anonPage }) => {
    await loginPage.loginButton.click();
    // With no credentials entered the form does not authenticate; the user
    // remains on the login page with both fields still present.
    await expect(anonPage).toHaveURL(/login/);
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
  });

  test('should navigate to Forgot Password page', async ({ anonPage }) => {
    await loginPage.forgotPasswordLink.click();
    await expect(anonPage).toHaveURL(/forgot_password/);
  });

  test('should navigate to Sign Up page', async ({ anonPage }) => {
    await loginPage.signUpLink.click();
    await expect(anonPage).toHaveURL(/signup/);
  });

  // The credentialed login + Sales Coach flows live in sales-coach.spec.ts,
  // where the shared authenticated window is used instead.
});
