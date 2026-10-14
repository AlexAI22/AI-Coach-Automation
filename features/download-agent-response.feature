# BDD specification for the "Download response" flows automated in
# tests/downloadAgentResponse.spec.ts. These scenarios document the behaviour in
# Given/When/Then form; the Playwright spec is the executable implementation.
#
# Preconditions shared by every scenario:
#  - The session is authenticated ONCE per run and reused
#    (tests/support/fixtures.ts + support/session.ts), so no scenario logs in
#    or out. There is no global-setup any more: the login happens in the single
#    browser window the whole run shares.
#  - The credentials must be set in the shell that STARTS the run
#    (AICoach_MICROSOFT_EMAIL / AICoach_MICROSOFT_PASSWORD), or every scenario
#    is skipped.
#  - The base URL is the staging tenant (https://stage-aicoach.insight.com).
#  - The first-run "Welcome to AI Coach" personalisation modal is dismissed
#    before any interaction, as it overlays the page and intercepts clicks.
#  - READ-ONLY BY DESIGN. The scenarios open agent chats that ALREADY hold a
#    finished response instead of creating them, so no AI run is triggered and
#    each case costs seconds rather than the minutes a fresh run takes
#    (sales-coach.feature). Nothing in the project is modified.
#  - The project under test is "Tesla - Q4 2026 Account Plan" and can be pointed
#    at another one with the PROJECT_NAME environment variable.
#  - THE DOWNLOAD IS BUILT IN THE BROWSER FROM A BLOB, so the saved file alone
#    cannot tell you why an export broke - the status of the POST behind it can.
#    Every scenario therefore asserts the POST to /sc/download/ FIRST: any
#    non-200 (500, 4xx, ...) fails it immediately with that status in the
#    message, instead of waiting out a download event that is never coming.
#  - The response streams in on a slow staging backend, so the header actions
#    can take well over a minute to render (90s allowed for the button, 60s for
#    the download itself, 4 minutes per scenario).

Feature: Sales Coach - Download agent response
  As an authenticated AI Coach user
  I want to download the stored response of every agent chat in a project
  So that I can share the agent's output as a Word document

  Background:
    Given I have an authenticated Sales Coach session
    And I navigate to the Sales Coach page
    And I dismiss the "Welcome to AI Coach" modal if it is shown
    And I select the "Tesla - Q4 2026 Account Plan" project

  Scenario: Reach the project logged in, with all its agent chats
    Then the AI Coach logo should be attached to the page
    And no "Log in with email" button should be shown
    And the "Tesla - Q4 2026 Account Plan" sidebar folder should list the chats:
      | Customer Profile Tesla    |
      | Deal Plan Tesla           |
      | Account Plan Tesla        |
      | Call Plan Tesla           |
      | Pricing Strategy Tesla    |
      | RFx Responder Tesla       |
      | Upsell & Cross Sell Tesla |

  # One scenario per agent, so a single broken export is reported by agent name
  # rather than hidden behind one failing loop. They run in default (non-serial)
  # mode so one failure does not skip the remaining agents - the point of the
  # suite is to report every agent's status in a single run.
  Scenario Outline: Download the <chat> response as a .docx
    When I open the "<chat>" chat from the project sidebar
    Then the chat should open on its stored response at "/sales-coach/project/chat?...chat_id=..."
    And the "Download response" action should be visible in the chat header
    And the "Download response" action should be enabled
    When I click "Download response"
    Then the POST to "/sc/download/" should answer HTTP 200
    And its content type should be the Word document type
      """
      application/vnd.openxmlformats-officedocument.wordprocessingml.document
      """
    And a file download should be triggered
    And the suggested filename should end in ".docx"
    And the downloaded file should be saved next to the run's other artifacts
    And the download should complete without failure
    And the saved document should not be empty
    And the saved document should start with the "PK" ZIP magic bytes

    Examples:
      | chat                      |
      | Customer Profile Tesla    |
      | Deal Plan Tesla           |
      | Account Plan Tesla        |
      | Call Plan Tesla           |
      | Pricing Strategy Tesla    |
      | RFx Responder Tesla       |
      | Upsell & Cross Sell Tesla |

  # Notes:
  #  - The control is ICON-ONLY, so it is located by its aria-label rather than
  #    by role: its tooltip wrapper <span> also carries role="button" with the
  #    same accessible name, so a role lookup matches two elements.
  #  - It is enabled only once there is a response to export; the app disables it
  #    otherwise.
  #  - Clicking fires the export directly - there is NO format picker or menu in
  #    between.
  #  - Both waiters (the POST and the download event) are armed BEFORE the click
  #    so neither can be missed.
  #  - The exported file is named after the chat/response ids, e.g.
  #    "43b32538-...-_d4151444-....docx".
  #  - A .docx is an OOXML package - a ZIP - so the "PK" magic check catches an
  #    error page or JSON blob served under a .docx name.
  #  - Opening a chat re-enters the project first when the sidebar folder is not
  #    already expanded (the first scenario of the run, or after a previous one
  #    navigated away).
