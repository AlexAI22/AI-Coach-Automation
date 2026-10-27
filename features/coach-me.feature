# ============================================================================
# Coach Me — BDD specification
#
# These scenarios document the Coach Me behaviour in Given/When/Then form; the
# Playwright specs are the executable implementation. Every active scenario
# maps onto a test case, so the counts here match `--list`.
#
#   Feature                  Spec                                        Cases  AI runs
#   FFA prompts              tests/coachMeFFA.spec.ts                       20        0
#   FFA answers              tests/coachMeFFAAnswers.spec.ts                 8        8
#   Expansion Plan prompts   tests/expansionPlanCoachMe.spec.ts             12        0
#   Expansion Plan answers   tests/expansionPlanCoachMeAnswers.spec.ts       1        4
#   Account Roadmap prompts  tests/accountRoadmapCoachMe.spec.ts            21        0
#   Account Roadmap answers  tests/accountRoadmapCoachMeAnswers.spec.ts      1        8
#                                                                  total    63       20
#
#   @disabled  Opportunities prompts  tests/coachMeOpportunities.spec.ts        (commented out)
#   @disabled  Opportunities answers  tests/coachMeOpportunitiesAnswers.spec.ts (commented out)
#
# The "prompts" features check TEXT ONLY and click no prompt, so they trigger
# no AI run. The "answers" features trigger real AI runs, which is why they are
# separate specs. The Expansion Plan and Account Roadmap answers suites run ALL
# their prompts as steps inside ONE test (one browser session): Playwright
# replaces the worker - and relaunches the browser - after every failed test,
# so one-test-per-prompt reopened the browser whenever a prompt failed.
#
# The two Opportunities suites are commented out on request (Oct 2026); their
# scenarios are kept below, tagged @disabled, for when they are re-enabled.
# NOTE: the npm scripts test:coach-me, test:coach-me:all, :answers and
# :everything still point at the disabled Opportunities specs and do NOT include
# the FFA specs - run the FFA specs by path.
#
# ----------------------------------------------------------------------------
# Preconditions shared by EVERY scenario
#  - The session is authenticated ONCE per run and reused
#    (tests/support/fixtures.ts + support/session.ts), so no scenario logs in or
#    out. Credentials are only needed when the saved session has expired; with
#    none set, every case is skipped.
#  - The base URL is the staging tenant (https://stage-aicoach.insight.com).
#  - The first-run "Welcome to AI Coach" personalisation modal is dismissed
#    before any interaction, as it overlays the page and intercepts clicks.
#  - The account view intermittently mounts an empty page body (hydration/data
#    race); the automation reloads until the header renders.
#  - All scenarios reach the account page by DEEP LINK to
#    /customer-value-portal/customer?id=<GGP ID>&id_type=SourceGGP&id_region=<region>
#    (the route moved from /account in Aug 2026; the old path renders the
#    portal LIST in place of the account, with no 404). CustomerAccountPage.goto()
#    takes the region as its second argument.
#  - All active scenarios run against customer "Inflexion Buyout V Investments
#    LP" (GGP ID 0009623781, region EMEA). The disabled Opportunities suites
#    still target the Demo Mode customer "Ballyvesey Industries Ltd"
#    (0009626222).
#
# ----------------------------------------------------------------------------
# Cross-cutting behaviour, verified against staging
#
#  1. THREE Coach Me modal variants exist and every one differs:
#
#       Section                Modal title                  Prompts  Context banner  Buttons
#       FFA / Opportunities    "AI Coach — <opportunity>"         8  yes             1 per card
#       Expansion Plan         "Expansion Coach — <plan>"         4  no              1 per card
#       Account Roadmap        "Account Roadmap Coach"            8  no              1 for the tab
#
#     The FFA tab's "Foundation Frontier Assessment" card opens the same AI
#     Coach modal, with the same 8-prompt set, as the Opportunities tab did.
#     Account Roadmap is the only title with no trailing subject. The sets share
#     no prompt text, so a negative check asserting one set against another
#     modal fails on text even where the counts coincide.
#
#  2. CLICKING A PROMPT DOES NOT ASK IT. It only fills the "Ask a custom
#     question" input, which is what enables the "Ask" button. The question is
#     sent by pressing Ask. After "Clear chat" a new session is created and a
#     prompt clicked before it is ready is ignored, so the automation retries
#     the click (up to 30s) until the input holds the prompt.
#
#  3. The answer is NOT streamed — it appears in one block. "Ask" returns to
#     DISABLED once submitted, because submitting clears the input, so Ask is
#     NOT a completion signal; the assistant message is.
#
#  4. CONVERSATIONS PERSIST per opportunity / expansion plan / section.
#     Reopening a Coach Me modal restores whatever was last asked, so the suites
#     CLEAR the conversation before each question rather than asserting it
#     starts empty, and clear it again after each answer.
#
#  5. The modal has no role="dialog" and the app no longer emits
#     data-sentry-component hooks, so the automation anchors on the body-level
#     block holding the modal's controls and locates from there by role, text
#     and structure.
#
#  6. The Suggested Questions panel collapses to ZERO WIDTH rather than
#     unmounting, so "hidden" is asserted on the panel container, not on the
#     individual prompt buttons.
#
#  7. THE PANEL HEADER ROW IS ITSELF A BUTTON. "Suggested Questions" is a
#     disclosure control (aria-expanded + a chevron), so the prompt locator
#     excludes aria-expanded as well as aria-labelled buttons - otherwise
#     "Suggested Questions" is received as an extra first prompt.
#
#  8. TWO controls collapse the panel and they are NOT interchangeable:
#
#       Control            Where                     Effect
#       Disclosure header  inside the panel          collapses the PROMPT LIST;
#                                                    the panel stays on screen
#       "Hide" / "Show"    beside the conversation   collapses the WHOLE panel
#                                                    to zero width
#
#     The "Close suggested questions" X was removed in Aug 2026, and the Hide
#     toggle's collapsed label changed from "Suggested Questions" to "Show".
#
#  9. ANSWER CHECKS. Answers are non-deterministic prose, so the HARD checks
#     cover properties every valid answer must have: the question is echoed
#     verbatim, exactly one answer is returned, it is longer than 200
#     characters and carries no failure marker. Three SOFT checks flag issues
#     without masking the hard ones:
#       - content gap   "Service Catalogue entry not loaded" and similar
#       - placeholder   an unfilled TBC / TBD / TODO / lorem ipsum
#                       ("[Contact name]"-style slots are allowed in drafts)
#       - topic         the answer talks about what the prompt asked
#     In the single-test Expansion Plan and Account Roadmap suites the answer
#     checks are ALL soft, so every prompt runs and is reported. Each answer is
#     attached to the HTML report, and the run time, length and whether it
#     names the customer are logged, not asserted.
# ============================================================================


# ----------------------------------------------------------------------------
# tests/coachMeFFA.spec.ts — 20 cases. Prompt and modal text only; no prompt is clicked.
# ----------------------------------------------------------------------------
Feature: Coach Me - FFA suggested question prompts
  As an authenticated AI Coach user
  I want the FFA Coach Me modal to offer a fixed set of coaching questions
  So that I can start a coaching session for the Foundation Frontier Assessment without writing a prompt myself

  Background:
    Given I have an authenticated AI Coach session
    And I open the account page for customer "Inflexion Buyout V Investments LP" with GGP ID "0009623781" in region "EMEA"

  Scenario: Open Coach Me for FFA from the customer account
    When I open the "FFA" tab
    Then the "Foundation Frontier Assessment" card should be visible
    And its "Coach Me" button should be enabled
    When I click its "Coach Me" button
    Then the AI Coach modal should open
    And the modal title should read "AI Coach — Foundation Frontier Assessment"
    And the context banner should name the customer "Inflexion Buyout V Investments LP"
    And no HTTP 4xx or 5xx errors should have occurred while the modal opened

  Scenario: Display the Suggested Questions panel with its header
    Then the "Suggested Questions" panel should be visible
    And it should show the "Suggested Questions" header
    And the header should be an expanded disclosure control

  Scenario: Display exactly eight suggested question prompts
    Then exactly 8 suggested question prompts should be displayed

  Scenario: Display every suggested question prompt verbatim and in order
    Then the suggested question prompts should read, in order:
      | # | prompt                                                                                  |
      | 1 | What are the client outcomes / deliverables from this opportunity?                      |
      | 2 | Why is this opportunity recommended for this client?                                    |
      | 3 | How should I pitch this as a continuation of the roadmap we’ve developed for my client? |
      | 4 | How should I write an email to introduce this opportunity?                              |
      | 5 | What objections might the client raise and how should I respond?                        |
      | 6 | Can you help me draft a blue sheet for this opportunity?                                |
      | 7 | How should I engage with Microsoft for this offer?                                      |
      | 8 | What do I need to do to get Microsoft funding for this opportunity?                     |

  Scenario Outline: Display prompt <n>: "<prompt>"
    Then the prompt "<prompt>" should be displayed
    And the prompt "<prompt>" should be enabled

    Examples:
      | n | prompt                                                                                  |
      | 1 | What are the client outcomes / deliverables from this opportunity?                      |
      | 2 | Why is this opportunity recommended for this client?                                    |
      | 3 | How should I pitch this as a continuation of the roadmap we’ve developed for my client? |
      | 4 | How should I write an email to introduce this opportunity?                              |
      | 5 | What objections might the client raise and how should I respond?                        |
      | 6 | Can you help me draft a blue sheet for this opportunity?                                |
      | 7 | How should I engage with Microsoft for this offer?                                      |
      | 8 | What do I need to do to get Microsoft funding for this opportunity?                     |

  Scenario: Render no empty and no duplicate prompts
    Then no suggested question prompt should be blank
    And no suggested question prompt should appear twice

  Scenario: Offer a custom question box alongside the suggested prompts
    Then the "Ask a custom question:" input should be visible
    And the question field should be visible
    And the "Ask" button should be disabled while the input is empty

  Scenario: Display every text in the modal header
    Then the modal title should read "AI Coach — Foundation Frontier Assessment"
    And the modal close button should be visible
    And the disclosure header should read "Suggested Questions"

  Scenario: Display the conversation toolbar with its initial states
    Then the toolbar should show these controls:
      | control               | state    | why                                 |
      | Hide                  | enabled  |                                     |
      | Clear chat            | enabled  |                                     |
      | Attachments (0)       | disabled | nothing is attached yet             |
      | Upload materials      | enabled  |                                     |
      | Download conversation | disabled | there is no conversation to download |

  Scenario: Display the session context and the empty-conversation hint
    Then the "Attached:" label should be visible
    And the context banner should read "Session ready · Inflexion Buyout V Investments LP"
    And the hint "Ask a question or choose a suggested prompt below to get started." should be visible
    And the conversation should hold no question and no answer

  Scenario: Display the question box placeholder and the Ask button
    Then the question field placeholder should read "Ask a question..."
    And the question field should be empty
    And the "Ask" button should read "Ask"
    And the "Ask" button should be disabled

  Scenario: Hide the prompts when the panel is collapsed and restore them when reopened
    When I collapse the whole panel via the "Hide" toggle
    Then the Suggested Questions panel should no longer be shown
    When I restore it via the same toggle, which now reads "Show"
    Then all 8 prompts should be displayed again, verbatim and in order

  Scenario: Display the same prompts after the modal is closed and reopened
    When I close the modal
    And I click "Coach Me" on the "Foundation Frontier Assessment" card again
    Then all 8 prompts should be displayed again, verbatim and in order

  # Notes:
  #  - The cases run serially against ONE modal opened by the first scenario, so
  #    the two state-changing scenarios are deliberately last.
  #  - The FFA card is the bordered card on the FFA tab whose h3 title is
  #    exactly "Foundation Frontier Assessment" (CustomerAccountPage.ffaCard).


# ----------------------------------------------------------------------------
# tests/coachMeFFAAnswers.spec.ts — 8 cases (8 AI runs), one per prompt.
# ----------------------------------------------------------------------------
Feature: Coach Me - FFA answers
  As an authenticated AI Coach user
  I want each FFA suggested question to return a usable coaching answer
  So that I can act on the AI Coach output for the Foundation Frontier Assessment

  Background:
    Given I have an authenticated AI Coach session
    And I open the account page for customer "Inflexion Buyout V Investments LP" with GGP ID "0009623781" in region "EMEA"
    And the AI Coach modal is open for the "Foundation Frontier Assessment" card on the "FFA" tab, reopening it if a previous case left it closed

  Scenario Outline: Prompt <n> should return a usable answer: "<prompt>"
    Given the conversation is empty, clearing any leftover one first
    When I click the prompt "<prompt>", retrying until the custom question input contains it verbatim
    And I press the "Ask" button
    Then exactly one question should be in the conversation
    And it should read "<prompt>" verbatim
    And the custom question input should be cleared
    And exactly one assistant answer should be returned
    And the answer should be longer than 200 characters
    And the answer should not contain a failure marker
    And, as soft checks, the answer should not report missing source content
    And it should not contain an unfilled placeholder
    And it should match the topic "<topic>"
    When I wait 3 seconds
    And I press "Clear chat"
    Then the hint "Ask a question or choose a suggested prompt below to get started." should be shown again
    And no HTTP 4xx or 5xx errors should have occurred during the run

    Examples:
      | n | prompt                                                                                  | topic                                                |
      | 1 | What are the client outcomes / deliverables from this opportunity?                      | outcome, deliverable                                 |
      | 2 | Why is this opportunity recommended for this client?                                    | recommend, because, priorit, fit                     |
      | 3 | How should I pitch this as a continuation of the roadmap we’ve developed for my client? | roadmap                                              |
      | 4 | How should I write an email to introduce this opportunity?                              | subject, dear, hi, hello, regards                    |
      | 5 | What objections might the client raise and how should I respond?                        | objection, concern, respon                           |
      | 6 | Can you help me draft a blue sheet for this opportunity?                                | blue sheet, single sales objective, buying influence |
      | 7 | How should I engage with Microsoft for this offer?                                      | microsoft                                            |
      | 8 | What do I need to do to get Microsoft funding for this opportunity?                     | fund                                                 |

  # Notes:
  #  - Runs in default (not serial) mode so one failing prompt cannot skip the
  #    prompts after it; the setup reopens the modal if a failed case closed it.
  #  - KNOWN PRODUCT ISSUES on staging. These cases FAIL ON PURPOSE as the
  #    standing signal and pass by themselves once the content is fixed - do
  #    NOT loosen the checks to make them pass:
  #      prompt 1  the Service Catalogue entry is not loaded, so no outcomes or
  #                deliverables are listed (soft content-gap check)
  #      prompt 7  "Advisory Motion training content has not been loaded"
  #                (~140 chars: fails the length floor and the failure markers)
  #      prompt 8  the canned funding reply ends "please reach out to TBC"
  #                (soft placeholder check)


# ----------------------------------------------------------------------------
# tests/expansionPlanCoachMe.spec.ts — 12 cases. Tab copy and prompt text only.
# ----------------------------------------------------------------------------
Feature: Coach Me - Expansion Plan suggested question prompts
  As an authenticated AI Coach user
  I want every expansion plan's Coach Me button to offer its coaching questions
  So that I can start a coaching session for any recommended expansion

  Background:
    Given I have an authenticated AI Coach session
    And I open the account page for customer "Inflexion Buyout V Investments LP" with GGP ID "0009623781" in region "EMEA"
    And I open the "Expansion Plan" tab and wait for the plan list

  Scenario: List expansion plans, each with a title, description and Coach Me button
    Then between 1 and 5 expansion plans should be listed
    And the number of "Coach Me" buttons should equal the number of plans
    And every plan should show a heading and a non-empty description
    And every plan should show an enabled "Coach Me" button
    And no HTTP 4xx or 5xx errors should have occurred while the tab loaded

  Scenario: Display the Expansion Plan intro text verbatim
    Then the intro should read:
      """
      Plans are automatically generated based on this account's invoiced spend, open pipeline, and AI-driven upsell signals. Each plan is tailored to the account's profile (e.g. cloud-heavy, device-centric, security-focused) and highlights 3–5 strategic growth actions across Microsoft Copilot, AI, Security, and Device as a Service.
      """

  Scenario: Display the Salesforce connection controls
    Then the "Connect Salesforce (SSO)" button should be visible and enabled
    And the Salesforce status should read "Salesforce not connected"

  Scenario: Every expansion plan card should display its full text and actions
    Given at least one expansion plan is listed
    Then every plan card should show:
      | element             | expectation                                     |
      | title               | a non-empty h3 heading                          |
      | AI badge            | reads "AI", with the hover hint "AI-suggested"  |
      | Last updated        | matches "Last updated: <d> <Mon> <yyyy>"        |
      | description         | exactly one paragraph, at least 50 characters   |
    And every plan card should show these enabled actions:
      | action                       |
      | Send to Salesforce as a Lead |
      | Coach Me                     |
      | Show AI catalogue mapping    |

  Scenario: List expansion plans with unique titles
    Then no two expansion plans should share a title

  Scenario: Every Coach Me button should open an Expansion Coach modal offering the four suggested questions
    Given at least one expansion plan is listed
    When I click "Coach Me" on each expansion plan in turn
    Then each modal title should read "Expansion Coach — <that plan's title>"
    And each modal should show the "Suggested Questions" header
    And each modal should offer exactly 4 prompts
    And each modal should offer exactly these prompts, in order:
      | # | prompt                                                                |
      | 1 | Why is this expansion recommended for this client?                    |
      | 2 | How should I pitch this to my client?                                 |
      | 3 | How should I write an email to introduce this expansion to my client? |
      | 4 | What objections might the client raise and how best should I respond? |
    And each modal should close again between plans

  Scenario Outline: Display prompt <n> for the first plan: "<prompt>"
    Given the Expansion Coach modal is open for the first expansion plan
    Then the prompt "<prompt>" should be displayed
    And the prompt "<prompt>" should be enabled

    Examples:
      | n | prompt                                                                |
      | 1 | Why is this expansion recommended for this client?                    |
      | 2 | How should I pitch this to my client?                                 |
      | 3 | How should I write an email to introduce this expansion to my client? |
      | 4 | What objections might the client raise and how best should I respond? |

  Scenario: Display exactly four prompts, none blank or duplicated
    Given the Expansion Coach modal is open for the first expansion plan
    Then exactly 4 suggested question prompts should be displayed
    And no prompt should be blank
    And no prompt should appear twice

  Scenario: Offer a custom question box alongside the suggested prompts
    Given the Expansion Coach modal is open for the first expansion plan
    Then the "Ask a custom question:" input should be visible
    And the question field should be visible
    And the "Ask" button should be disabled while the input is empty

  # Notes:
  #  - Plans are AI-generated and carry a "Last updated" date, so their titles
  #    and count change over time. The cards are discovered at RUNTIME and no
  #    plan title is hard-coded; the loops assert a plan exists first, so they
  #    cannot pass by looping zero times. Each plan is a named report step.
  #  - The tab's static copy (intro, Salesforce controls) IS asserted verbatim;
  #    the plan descriptions are AI prose, so only their structure is checked.
  #  - The test account never completes Salesforce SSO, hence "not connected".
  #  - The plan cards are the children of the LAST wrapper that contains Coach
  #    Me buttons: while plans load, the Salesforce block is the last child and
  #    used to be counted as cards.


# ----------------------------------------------------------------------------
# tests/expansionPlanCoachMeAnswers.spec.ts — 1 case (4 AI runs), one step per prompt.
# ----------------------------------------------------------------------------
Feature: Coach Me - Expansion Plan answers
  As an authenticated AI Coach user
  I want an expansion plan's suggested questions to return usable answers
  So that I can act on the Expansion Coach output for a recommended expansion

  Background:
    Given I have an authenticated AI Coach session
    And I open the account page for customer "Inflexion Buyout V Investments LP" with GGP ID "0009623781" in region "EMEA"
    And I open the "Expansion Plan" tab and wait for the plan list

  Scenario: Every suggested question should return a usable answer
    Given exactly one expansion plan titled "Copilot-Powered Productivity & AI Adoption Program" is listed
    When I click its "Coach Me" button
    Then the modal title should read "Expansion Coach — Copilot-Powered Productivity & AI Adoption Program"

    # The steps below run once per prompt in the Examples table, as one report
    # step each ("Q<n>: <prompt>"), inside the same test and browser session.
    Given the conversation is empty, clearing any leftover one first
    When I click the prompt, retrying until the custom question input contains it verbatim
    And I press the "Ask" button
    Then exactly one question should be in the conversation
    And, as soft checks, it should read the prompt verbatim
    And the custom question input should be cleared
    And exactly one assistant answer should be returned
    And the answer should be longer than 200 characters
    And the answer should not contain a failure marker
    And the answer should not report missing source content
    And the answer should not contain an unfilled placeholder
    And the answer should match the prompt's topic
    When I wait 3 seconds
    And I press "Clear chat"
    Then the hint "Ask a question or choose a suggested prompt below to get started." should be shown again

    When all four prompts are done
    Then I close the modal
    And no HTTP 4xx or 5xx errors should have occurred during the run

    Examples:
      | n | prompt                                                                | topic                                       |
      | 1 | Why is this expansion recommended for this client?                    | recommend, because, priorit, fit, signal, spend |
      | 2 | How should I pitch this to my client?                                 | pitch, position, value, messag              |
      | 3 | How should I write an email to introduce this expansion to my client? | subject, dear, hi, hello, regards           |
      | 4 | What objections might the client raise and how best should I respond? | objection, concern, respon                  |

  # Notes:
  #  - Only this one plan is exercised: the four prompts are identical on every
  #    plan, and the prompt text of all plans is covered by the prompts spec.
  #    If the plan is regenerated under a new name the case fails with a message
  #    saying to update PLAN_TITLE.
  #  - KNOWN PRODUCT ISSUE on staging - the case FAILS ON PURPOSE on the HTTP
  #    error check: each new Expansion Coach session (on open and after "Clear
  #    chat") requests GET /csm/coach-sessions/expansion_coach/<sessionId>/materials,
  #    which returns 404. The FFA coach's equivalent call succeeds, so an empty
  #    session should return an empty list, not 404. The answers themselves pass
  #    every content check. Do NOT allow-list the 404.


# ----------------------------------------------------------------------------
# tests/accountRoadmapCoachMe.spec.ts — 21 cases. Tab copy and prompt text only.
# ----------------------------------------------------------------------------
Feature: Coach Me - Account Roadmap suggested question prompts
  As an authenticated AI Coach user
  I want the Account Roadmap Coach to offer its coaching questions
  So that I can prepare a roadmap conversation without writing a prompt myself

  Background:
    Given I have an authenticated AI Coach session
    And I open the account page for customer "Inflexion Buyout V Investments LP" with GGP ID "0009623781" in region "EMEA"
    And I open the "Account Roadmap" tab

  Scenario: Show the Account Roadmap tab with a single Coach Me entry point
    Then the "Account Roadmap" heading should be visible
    And the intro "Review the context below, then use Coach Me to prepare your pitch" should be visible
    And exactly 4 context accordion sections should be shown
    And the sections "Client Context", "Insight and Client Relationship", "Customer Personas" and "Technology Landscape" should be listed
    And exactly one enabled "Coach Me" button should be shown for the whole tab
    And no HTTP 4xx or 5xx errors should have occurred while the tab loaded

  Scenario: Display the heading and intro text verbatim
    Then the level-1 heading should read "Account Roadmap"
    And the intro should read "Review the context below, then use Coach Me to prepare your pitch"
    And "Coach Me" should be emphasised inside the intro

  Scenario: List the context accordions verbatim, in order, all collapsed
    Then the accordion headers should read, in order:
      | section                         |
      | Client Context                  |
      | Insight and Client Relationship |
      | Customer Personas               |
      | Technology Landscape            |
    And every accordion header should be enabled
    And every accordion should be collapsed, showing only its header

  Scenario: Display the Coach Me call-to-action text verbatim
    Then the call-to-action should read "Prep your roadmap conversation — what to cover, what to expect, and how to get buy-in"
    And the "Coach Me" button should read "Coach Me" and be enabled

  Scenario: Display the Client Roadmap upload area text verbatim
    Then the level-2 heading "Client Roadmap" should be visible
    And the text "Upload the client's strategic roadmap to auto-generate opportunities." should be visible
    And exactly one drop zone should be shown
    And it should read "Drop roadmap file here or click to browse"
    And it should show the hint "Supports .xlsx"
    And its file input should accept only ".xlsx"

  Scenario: Open the "Account Roadmap Coach" modal from the Coach Me button
    When I click the "Coach Me" button
    Then the modal should open
    And the modal title should read "Account Roadmap Coach"

  Scenario: Display the Suggested Questions panel with its header
    Then the "Suggested Questions" panel should be visible
    And it should show the "Suggested Questions" header
    And the disclosure header that collapses the prompt list should be visible

  Scenario: Display exactly eight suggested question prompts
    Then exactly 8 suggested question prompts should be displayed

  Scenario: Display every suggested question prompt verbatim and in order
    Then the suggested question prompts should read, in order:
      | # | prompt                                                                               |
      | 1 | Can you draft a Pursuit Plan for this account based on the context above?            |
      | 2 | Can you draft Deal Plan discovery questions for my first customer conversation?      |
      | 3 | What are the biggest issues or pain points I should be probing for with this client? |
      | 4 | What discovery questions should I ask in the first client conversation?              |
      | 5 | How should I structure the first discovery meeting?                                  |
      | 6 | How do I translate what I heard in discovery into actionable recommendations?        |
      | 7 | What's a good structure for presenting the roadmap back to the client?               |
      | 8 | How do I handle it when the client pushes back on a recommendation?                  |

  Scenario Outline: Display prompt <n>: "<prompt>"
    Then the prompt "<prompt>" should be displayed
    And the prompt "<prompt>" should be enabled

    Examples:
      | n | prompt                                                                               |
      | 1 | Can you draft a Pursuit Plan for this account based on the context above?            |
      | 2 | Can you draft Deal Plan discovery questions for my first customer conversation?      |
      | 3 | What are the biggest issues or pain points I should be probing for with this client? |
      | 4 | What discovery questions should I ask in the first client conversation?              |
      | 5 | How should I structure the first discovery meeting?                                  |
      | 6 | How do I translate what I heard in discovery into actionable recommendations?        |
      | 7 | What's a good structure for presenting the roadmap back to the client?               |
      | 8 | How do I handle it when the client pushes back on a recommendation?                  |

  Scenario: Render no empty and no duplicate prompts
    Then no suggested question prompt should be blank
    And no suggested question prompt should appear twice

  Scenario: Offer a custom question box alongside the suggested prompts
    Then the "Ask a custom question:" input should be visible
    And the question field should be visible
    And the "Ask" button should be disabled while the input is empty

  Scenario: Hide the prompts when the panel is collapsed and restore them when reopened
    When I collapse the whole panel via the "Hide" toggle
    Then the Suggested Questions panel should no longer be shown
    When I restore it via the same toggle, which now reads "Show"
    Then all 8 prompts should be displayed again, verbatim and in order

  Scenario: Display the same prompts after the modal is closed and reopened
    When I close the modal
    And I click "Coach Me" again
    Then all 8 prompts should be displayed again, verbatim and in order

  # Notes:
  #  - The tab has ONE Coach Me button for the whole tab (below the four context
  #    accordions), not one per card as on Expansion Plan.
  #  - The call-to-action contains a <br>; it is compared on inner text, which
  #    normalises the line break to a single space.
  #  - The Suggested Questions panel SCROLLS: prompts 6-8 sit outside the
  #    viewport but are still rendered, which is what visibility asserts
  #    (Playwright visibility means "has a non-empty box", not "in viewport").
  #  - The cases run serially; the tab-copy scenarios run before the modal is
  #    opened, and the two state-changing scenarios are deliberately last.


# ----------------------------------------------------------------------------
# tests/accountRoadmapCoachMeAnswers.spec.ts — 1 case (8 AI runs), one step per prompt.
# ----------------------------------------------------------------------------
Feature: Coach Me - Account Roadmap answers
  As an authenticated AI Coach user
  I want every Account Roadmap suggested question to return a usable answer
  So that I can prepare a roadmap conversation from the coach output

  Background:
    Given I have an authenticated AI Coach session
    And I open the account page for customer "Inflexion Buyout V Investments LP" with GGP ID "0009623781" in region "EMEA"
    And I open the "Account Roadmap" tab

  Scenario: Every suggested question should return a usable answer
    When I click the "Coach Me" button
    Then the modal title should read "Account Roadmap Coach"
    And all 8 prompts should be displayed, verbatim and in order

    # The steps below run once per prompt in the Examples table, as one report
    # step each ("Q<n>: <prompt>"), inside the same test and browser session.
    Given the conversation is empty, clearing any leftover one first
    When I click the prompt, retrying until the custom question input contains it verbatim
    And I press the "Ask" button
    Then exactly one question should be in the conversation
    And, as soft checks, it should read the prompt verbatim
    And the custom question input should be cleared
    And exactly one assistant answer should be returned
    And the answer should be longer than 200 characters
    And the answer should not contain a failure marker
    And the answer should not report missing source content
    And the answer should not contain an unfilled placeholder
    And the answer should match the prompt's topic
    When I wait 3 seconds
    And I press "Clear chat"
    Then the hint "Ask a question or choose a suggested prompt below to get started." should be shown again

    When all eight prompts are done
    Then I close the modal
    And no HTTP 4xx or 5xx errors should have occurred during the run

    Examples:
      | n | prompt                                                                               | topic                                             |
      | 1 | Can you draft a Pursuit Plan for this account based on the context above?            | pursuit plan, objective, stakeholder, next step   |
      | 2 | Can you draft Deal Plan discovery questions for my first customer conversation?      | contains a question mark                          |
      | 3 | What are the biggest issues or pain points I should be probing for with this client? | pain point, issue, challenge, risk                |
      | 4 | What discovery questions should I ask in the first client conversation?              | contains a question mark                          |
      | 5 | How should I structure the first discovery meeting?                                  | agenda, structure, minutes, open, close, next step |
      | 6 | How do I translate what I heard in discovery into actionable recommendations?        | recommendation                                    |
      | 7 | What's a good structure for presenting the roadmap back to the client?               | roadmap, structure, phase, agenda                 |
      | 8 | How do I handle it when the client pushes back on a recommendation?                  | push back, pushback, objection, concern, acknowledge |

  # Notes:
  #  - The tab has one Coach Me button and a FIXED prompt set, so the prompts
  #    are hard-coded (CoachMeModalPage.ROADMAP_QUESTIONS).
  #  - Roadmap answers have historically been the LONGEST and SLOWEST of the
  #    sections (~6.5-12.6k chars, ~33-54s per prompt), consistent with the
  #    coach drawing on all four context accordions. Useful as a performance
  #    baseline if response times regress.


# ============================================================================
# DISABLED SUITES — tests/coachMeOpportunities.spec.ts and
# tests/coachMeOpportunitiesAnswers.spec.ts are commented out on request
# (Oct 2026). The scenarios are kept as documentation of what they cover when
# uncommented. They still target the Demo Mode customer
# "Ballyvesey Industries Ltd" (GGP ID 0009626222) and the "Opportunities" tab;
# the same modal and prompt set is now covered through the FFA tab above.
# ============================================================================

# ----------------------------------------------------------------------------
# tests/coachMeOpportunities.spec.ts — DISABLED (16 cases when enabled).
# ----------------------------------------------------------------------------
@disabled
Feature: Coach Me - Opportunities suggested question prompts
  As an authenticated AI Coach user
  I want the AI Coach modal to offer a fixed set of coaching questions for an opportunity
  So that I can start a coaching session without writing a prompt myself

  Background:
    Given I have an authenticated AI Coach session
    And I open the account page for customer "Ballyvesey Industries Ltd" with GGP ID "0009626222"
    And I open the "Opportunities" tab

  Scenario: Open the AI Coach modal from an opportunity's Coach Me button
    Given the "Foundation Frontier Assessment" opportunity is listed
    And it shows a "Coach Me" button
    When I click its "Coach Me" button
    Then the AI Coach modal should open
    And the modal title should read "AI Coach — Foundation Frontier Assessment"
    And the context banner should name the customer "Ballyvesey Industries Ltd"
    And no HTTP 4xx or 5xx errors should have occurred while the modal opened

  Scenario: Display the Suggested Questions panel with its header
    Then the "Suggested Questions" panel should be visible
    And it should show the "Suggested Questions" header
    And the header should be a disclosure control that collapses the prompt list

  Scenario: Display exactly eight suggested question prompts
    Then exactly 8 suggested question prompts should be displayed

  Scenario: Display every suggested question prompt verbatim and in order
    Then the suggested question prompts should match the FFA set above, verbatim and in order

  Scenario Outline: Display the suggested question prompt "<prompt>"
    Then the prompt "<prompt>" should be displayed
    And the prompt "<prompt>" should be enabled

    Examples:
      | prompt                                                                                  |
      | What are the client outcomes / deliverables from this opportunity?                      |
      | Why is this opportunity recommended for this client?                                    |
      | How should I pitch this as a continuation of the roadmap we’ve developed for my client? |
      | How should I write an email to introduce this opportunity?                              |
      | What objections might the client raise and how should I respond?                        |
      | Can you help me draft a blue sheet for this opportunity?                                |
      | How should I engage with Microsoft for this offer?                                      |
      | What do I need to do to get Microsoft funding for this opportunity?                     |

  Scenario: Render no empty and no duplicate prompts
    Then no suggested question prompt should be blank
    And no suggested question prompt should appear twice

  Scenario: Offer a custom question box alongside the suggested prompts
    Then the "Ask a custom question:" input should be visible
    And the "Ask" button should be disabled while the input is empty

  Scenario: Hide the prompts when the panel is collapsed and restore them when reopened
    When I collapse the whole panel via the "Hide" toggle
    Then the Suggested Questions panel should no longer be shown
    When I restore it via the same toggle, which now reads "Show"
    Then all 8 prompts should be displayed again, verbatim and in order

  Scenario: Display the same prompts after the modal is closed and reopened
    When I close the modal
    And I click "Coach Me" on the "Foundation Frontier Assessment" opportunity again
    Then all 8 prompts should be displayed again, verbatim and in order

  # Notes:
  #  - The tab strip carries both "Opportunities" and "Opportunities (new)", so
  #    the tab locator matches EXACTLY or every tab click hits a strict-mode
  #    violation.


# ----------------------------------------------------------------------------
# tests/coachMeOpportunitiesAnswers.spec.ts — DISABLED (8 cases / 8 AI runs when enabled).
# ----------------------------------------------------------------------------
@disabled
Feature: Coach Me - Opportunities answers
  As an authenticated AI Coach user
  I want each suggested question to return a usable coaching answer
  So that I can act on the AI Coach output for an opportunity

  Background:
    Given I have an authenticated AI Coach session
    And I open the account page for customer "Ballyvesey Industries Ltd" with GGP ID "0009626222"
    And I open the "Opportunities" tab
    And the AI Coach modal is open for "Foundation Frontier Assessment"

  Scenario Outline: Run the suggested question "<prompt>" and check its answer
    Given the conversation is empty, clearing any leftover one first
    When I click the prompt "<prompt>"
    Then the custom question input should contain that prompt verbatim
    And the "Ask" button should become enabled
    But no question should have been sent yet
    When I press the "Ask" button
    Then the question "<prompt>" should be echoed into the conversation verbatim
    And the custom question input should be cleared
    And exactly one assistant answer should be returned
    And the answer should be longer than 200 characters
    And the answer should not contain a failure marker
    When I wait 3 seconds
    And I press "Clear chat"
    Then the conversation should be empty again
    And no HTTP 4xx or 5xx errors should have occurred during the run

    Examples:
      | prompt                                                                                  |
      | What are the client outcomes / deliverables from this opportunity?                      |
      | Why is this opportunity recommended for this client?                                    |
      | How should I pitch this as a continuation of the roadmap we’ve developed for my client? |
      | How should I write an email to introduce this opportunity?                              |
      | What objections might the client raise and how should I respond?                        |
      | Can you help me draft a blue sheet for this opportunity?                                |
      | How should I engage with Microsoft for this offer?                                      |
      | What do I need to do to get Microsoft funding for this opportunity?                     |

  # Notes:
  #  - Known issue when last enabled: prompt 7 answered "Guidance for engaging
  #    with Microsoft for this offer is not yet available. The required Advisory
  #    Motion training content has not been loaded." - the same staging content
  #    gap the FFA answers suite reports.
