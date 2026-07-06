# BDD specification for the Sales Coach flows automated in
# tests/sales-coach.spec.ts. These scenarios document the behaviour in
# Given/When/Then form; the Playwright spec is the executable implementation.
#
# Preconditions shared by every scenario:
#  - The session is authenticated ONCE (global-setup.ts) and reused via
#    storageState, so no scenario logs in or out.
#  - The base URL is the staging tenant (https://stage-aicoach.insight.com).

Feature: Sales Coach
  As an authenticated AI Coach user
  I want to use the Sales Coach app with a reused session
  So that I can reach the app and create agent chats without logging in each time

  Background:
    Given I have an authenticated Sales Coach session
    And I navigate to the Sales Coach page

  Scenario: Reach the Sales Coach app without re-logging in
    Then the page URL should match "/sales-coach"
    And the Insight logo should be attached to the page
    And no "Log in with email" button should be shown

  Scenario: Access the Sales Coach page from the navigation
    Given I dismiss the "Welcome to AI Coach" modal if it is shown
    When I open Sales Coach from the left navigation
    Then the URL should match "/sales-coach"
    And the Sales Coach page header should be visible

  Scenario: Show and dismiss the "Welcome to AI Coach" personalisation modal
    Then the "Welcome to AI Coach" modal heading should be visible
    And the modal explains it "helps the AI give you better, more relevant insights"
    And the modal lists the onboarding steps:
      | Role & practice area     |
      | Territory & region       |
      | Industry focus           |
      | Strategic accounts       |
      | Digest preferences       |
      | Access & feature requests |
    And the modal offers a "Skip for now" button
    And the modal offers a "Get Started" button
    When I click "Skip for now"
    Then the "Welcome to AI Coach" modal should be hidden

  Scenario: Display the Sales Coach welcome landing content
    Given I dismiss the "Welcome to AI Coach" modal if it is shown
    And the Sales Coach page is loaded
    Then the welcome landing should be visible
    And it shows the heading "Welcome to Sales Coach"
    And it shows the text "Your intelligent bid support assistant"
    And it shows a "Create New Project" card
    And it shows the text "Start a new bid support project with AI assistance"
    And the "Get Started" link points to "/sales-coach/project/draft"
    And it shows a "Getting Started" checklist containing:
      | Select a project from the sidebar to view project details |
      | Start a new chat to interact with AI agents               |
      | Use the settings icon to configure agent parameters       |

  # NOTE: These are MUTATING scenarios — each creates a real chat and triggers a
  # full AI run (~1-2 minutes, longer for some legacy agents) in the shared
  # "Automation Project".
  @mutating
  Scenario Outline: Create a chat with a primary (structured-output) agent
    Given I dismiss the "Welcome to AI Coach" modal if it is shown
    And I select the "Automation Project" project
    And the "<agent>" agent card shows the description "<description>"
    When I create a chat for "<agent>" with a unique name using the default prompt
    And the agent run completes successfully
    Then the new chat should appear in the "Automation Project" sidebar folder
    And no HTTP 4xx or 5xx errors should have occurred during the flow

    Examples:
      | agent            | description                                                                                                                          |
      | Customer Profile | Research agent designed to analyse customer profile, news, financials and SWOT analysis with talking points.                          |
      | Deal Plan        | Intelligent agent to help you build a structured deal plan, aligning customer needs with your solution and defining clear next steps to close. |
      | Account Plan     | Intelligent agent to help you build a comprehensive account plan, uncovering growth opportunities and defining a strategy to deepen customer relationships. |
      | Call Plan        | Intelligent agent to help you prepare for customer calls with a structured agenda, tailored talking points and clear objectives.       |

  # Customer Profile additionally exposes a "News Recency (days)" field, set to 7.

  @mutating @legacy
  Scenario Outline: Create a chat with a legacy (plain-text) agent
    Given I dismiss the "Welcome to AI Coach" modal if it is shown
    And I select the "Automation Project" project
    And the "<agent>" agent card shows the description "<description>"
    And the "<agent>" agent card is marked with a "Legacy" badge
    When I create a chat for "<agent>" with a unique name using the default prompt
    And I provide the agent-specific required input "<required input>"
    And the agent run completes successfully
    Then the new chat should appear in the "Automation Project" sidebar folder
    And no HTTP 4xx or 5xx errors should have occurred during the flow

    Examples:
      | agent               | required input                        | description                                                                                                     |
      | Pricing Strategy    | none                                  | Design custom pricing solutions aligned with your goals and customer needs                                      |
      | RFx Responder       | response structure "Summary Only"     | An intelligent assistant designed to streamline and enhance RFx creation through automation and contextual guidance. |
      | BID Writer          | none                                  | A smart assistant that accelerates bid development by automating content generation.                            |
      | Upsell & Cross Sell | transcript file upload                | Intelligent agent to help you match the requested service with upsell or crosssell opportunity from our portfolio. |

  # The "Research Agent" legacy card is "Coming soon" (disabled) and is
  # intentionally not covered by a creation scenario.

  # Notes on the created chat name:
  #  - The Chat name field caps input at 50 characters, so a long requested name
  #    (e.g. for "Upsell & Cross Sell") is truncated; the truncated value is what
  #    the sidebar lookup uses.
  #  - "The agent run completes successfully" means the app navigates to the
  #    created chat (.../project/chat?...&chat_id=...) and shows the "Refine"
  #    action; a backend failure (e.g. HTTP 504 "Failed to create response")
  #    fails the scenario fast.
