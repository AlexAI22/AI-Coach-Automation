import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

test.describe('Login', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
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

  test('should reject invalid credentials and keep the user on the login page', async ({ page }) => {
    await loginPage.login('invalid@test.com', 'WrongPassword123!');
    // Invalid credentials must not authenticate: the user stays on the
    // PropelAuth login page with the form still available. The provider no
    // longer renders a locatable inline error node, so we assert the behaviour
    // (no authentication) rather than a specific message.
    await expect(page).toHaveURL(/login/, { timeout: 15000 });
    await expect(loginPage.loginButton).toBeVisible();
    await expect(loginPage.emailInput).toBeVisible();
  });

  test('should not authenticate when submitting empty fields', async ({ page }) => {
    await loginPage.loginButton.click();
    // With no credentials entered the form does not authenticate; the user
    // remains on the login page with both fields still present.
    await expect(page).toHaveURL(/login/);
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
  });

  test('should navigate to Forgot Password page', async ({ page }) => {
    await loginPage.forgotPasswordLink.click();
    await expect(page).toHaveURL(/forgot_password/);
  });

  test('should navigate to Sign Up page', async ({ page }) => {
    await loginPage.signUpLink.click();
    await expect(page).toHaveURL(/signup/);
  });

  // The credentialed login + Sales Coach flows live in sales-coach.spec.ts,
  // where tracing is disabled file-wide so real credentials never land in a
  // trace artifact.
});
