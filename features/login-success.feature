# BDD specification for the login-page flows automated in
# tests/login-success.spec.ts. These scenarios document the behaviour in
# Given/When/Then form; the Playwright spec is the executable implementation.
#
# These are logged-out tests against the PropelAuth login screen
# (staging tenant AICOACH-STAGING) and need no credentials.
#
# They take the "anonPage" fixture rather than the shared authenticated page:
# a SECOND window in the same browser, created only when these scenarios run,
# with cookies cleared between them (tests/support/fixtures.ts).

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
    And the "Sign up" link is visible
    # Present in the DOM but hidden by default (opacity:0; pointer-events:none),
    # so it is asserted as ATTACHED rather than visible.
    And the "Sign in with SSO" link is attached to the page

  Scenario: Reject invalid credentials and keep the user on the login page
    When I log in with email "invalid@test.com" and password "WrongPassword123!"
    Then the URL still matches "/login"
    And the "Log in with email" button is still visible
    And the Email field is still visible

  Scenario: Do not authenticate when submitting empty fields
    When I submit the login form with both fields empty
    Then the URL still matches "/login"
    And the Email field is still visible
    And the Password field is still visible

  Scenario: Navigate to the Forgot Password page
    When I click the "Forgot password?" link
    Then the URL matches "/forgot_password"

  Scenario: Navigate to the Sign Up page
    When I click the "Sign up" link
    Then the URL matches "/signup"

  # Notes:
  #  - THE FAILURE SCENARIOS ASSERT BEHAVIOUR, NOT MESSAGES. PropelAuth no
  #    longer renders a locatable inline/form-level error node (it used to show
  #    "Email required" / "Password required" and a no-account-found banner), so
  #    the scenarios prove what matters - the user is NOT authenticated and the
  #    form is still there - instead of waiting out a timeout on a message the
  #    provider can reword or drop at any time.
  #  - Successful, credentialed login is covered separately: support/session.ts
  #    logs in once per run, in the shared window, and sales-coach.spec.ts
  #    asserts the app is reached without re-logging in. Tracing is off by
  #    default so real credentials are never captured in a trace artifact.
