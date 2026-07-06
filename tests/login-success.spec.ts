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
    await expect(loginPage.signInWithSSOLink).toBeVisible();
    await expect(loginPage.signUpLink).toBeVisible();
  });

  test('should reject invalid credentials and keep the user on the login page', async ({ page }) => {
    await loginPage.login('invalid@test.com', 'WrongPassword123!');
    // The app surfaces a form-level error and does not authenticate. The error
    // is server-driven, so allow for slow staging responses (default is 5s).
    await expect(loginPage.loginError).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/login/);
    await expect(loginPage.loginButton).toBeVisible();
  });

  test('should show inline errors when submitting empty fields', async () => {
    await loginPage.loginButton.click();
    await expect(loginPage.emailError).toBeVisible();
    await expect(loginPage.emailError).toHaveText('Email required');
    await expect(loginPage.passwordError).toBeVisible();
    await expect(loginPage.passwordError).toHaveText('Password required');
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
