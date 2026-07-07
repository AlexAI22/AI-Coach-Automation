# BDD specification for the Personal Digest → Daily Digest flows automated in
# tests/personal-digest.spec.ts. These scenarios document the behaviour in
# Given/When/Then form; the Playwright spec is the executable implementation.
#
# Preconditions shared by every scenario:
#  - The session is authenticated ONCE (global-setup.ts) and reused via
#    storageState, so no scenario logs in or out.
#  - The base URL is the staging tenant (https://stage-aicoach.insight.com).
#  - The first-run "Welcome to AI Coach" personalisation modal is dismissed
#    before any interaction, as it overlays the page and intercepts clicks.

Feature: Personal Digest - Daily Digest
  As an authenticated AI Coach user
  I want to view my Daily Digest
  So that I can quickly see relevant news, KPIs and suggested talking points

  Background:
    Given I have an authenticated AI Coach session
    And I open the Daily Digest page

  Scenario: Load the Daily Digest page with header and tabs
    Then the page URL should match "/personal-digest/daily-digest"
    And the "Personal Digest" heading should be visible
    And the digest description should be visible
    And the "Daily Digest" tab should link to "/personal-digest/daily-digest"
    And the "Market Trends" tab should link to "/personal-digest/market-trends"
    And the "About Personal Digest" control should be visible
    And no HTTP 4xx or 5xx errors should have occurred while the page loaded

  Scenario: Show the KPI summary cards
    Then the KPI summary should be visible
    And it should show an "Active Accounts" card
    And it should show a "Tracked Industries" card
    And each KPI card should display a numeric value

  Scenario: Render Featured News with a consistent count and valid links
    Then the Featured News section should be visible
    And the "N articles" counter should equal the number of news items shown
    And exactly one news item should be flagged as the "TOP STORY"
    And every news item should show a relevance badge
    And every news item title should link to an external source
    And every news link should open in a new tab with rel "noopener"

  Scenario: Render ranked Suggested Talking Points
    Then the Suggested Talking Points section should be visible
    And at least one talking point should be shown
    And each talking point should be ranked in order (#1, #2, ...)
    And each talking point should have a title and a body
    And each talking point should have a "Copy talking point" button

  Scenario: Copy a talking point to the clipboard
    Given I dismiss the "Welcome to AI Coach" modal if it is shown
    When I click the "Copy talking point" button on the first talking point
    Then the clipboard should contain non-empty text

  Scenario: Navigate to Market Trends and back to Daily Digest
    Given I dismiss the "Welcome to AI Coach" modal if it is shown
    When I click the "Market Trends" tab
    Then the page URL should match "/personal-digest/market-trends"
    And the "Personal Digest" heading should still be visible
    When I click the "Daily Digest" tab
    Then the page URL should match "/personal-digest/daily-digest"
    And the Featured News section should be visible

  @slow
  Scenario: Refresh the digest without HTTP errors
    Given I dismiss the "Welcome to AI Coach" modal if it is shown
    And the "Refresh Digest" button is enabled
    When I click "Refresh Digest"
    Then the digest should regenerate and the button becomes enabled again
    And the Featured News section should still be visible with at least one item
    And no HTTP 4xx or 5xx errors should have occurred during the refresh

  # Notes:
  #  - Counts are asserted relationally (counter == rendered items) rather than
  #    hard-coded, because the digest content changes over time.
  #  - The staging backend renders sections asynchronously and slowly, so the
  #    automated suite uses a raised (20s) web-first assertion timeout.
