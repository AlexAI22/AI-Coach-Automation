# BDD specification for the login-page flows automated in
# tests/login-success.spec.ts. These scenarios document the behaviour in
# Given/When/Then form; the Playwright spec is the executable implementation.
#
# These are logged-out tests against the PropelAuth login screen
# (staging tenant AICOACH-STAGING) and need no credentials.

Feature: Login
  As a visitor of the AI Coach app
  I want a working login screen with validation and navigation
  So that I can sign in, recover my password, or sign up

  Background:
    Given I am on the AI Coach login page

  Scenario: Display all login form elements
    Then the "Log in to ..." heading is visible
    And the Email field is visible
    And the Password field is visible
    And the "Log in with email" button is visible
    And the "Forgot password?" link is visible
    And the "Sign in with SSO" link is visible
    And the "Sign up" link is visible

  Scenario: Reject invalid credentials and keep the user on the login page
    When I log in with email "invalid@test.com" and password "WrongPassword123!"
    Then a form-level error is shown (no account found / account locked)
    And the URL still matches "/login"
    And the "Log in with email" button is still visible

  Scenario: Show inline errors when submitting empty fields
    When I submit the login form with both fields empty
    Then an inline email error "Email required" is shown
    And an inline password error "Password required" is shown

  Scenario: Navigate to the Forgot Password page
    When I click the "Forgot password?" link
    Then the URL matches "/forgot_password"

  Scenario: Navigate to the Sign Up page
    When I click the "Sign up" link
    Then the URL matches "/signup"

  # Successful, credentialed login is covered separately (global-setup.ts and
  # sales-coach.spec.ts) with tracing disabled so real credentials are never
  # captured in a trace artifact.
