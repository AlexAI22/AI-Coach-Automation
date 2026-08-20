# ============================================================================
# Coach Me — BDD specification
#
# These scenarios document the Coach Me behaviour in Given/When/Then form; the
# Playwright specs are the executable implementation. Every scenario below maps
# 1:1 onto a test case, so the counts here match `--list`.
#
#   Feature                  Spec                                        Cases  Runtime
#   Opportunities prompts    tests/coachMeOpportunities.spec.ts             16   ~20s
#   Opportunities answers    tests/coachMeOpportunitiesAnswers.spec.ts       8   ~5m
#   Expansion Plan prompts   tests/expansionPlanCoachMe.spec.ts              8   ~13s
#   Expansion Plan answers   tests/expansionPlanCoachMeAnswers.spec.ts       5   ~8.7m
#   Account Roadmap prompts  tests/accountRoadmapCoachMe.spec.ts            17   ~12s
#   Account Roadmap answers  tests/accountRoadmapCoachMeAnswers.spec.ts      8   ~6.5m
#                                                                  total    62
#
# The "prompts" features check TEXT ONLY and click nothing, so they trigger no
# AI run (41 cases, ~40s combined). The "answers" features each trigger real AI
# runs (36 in total, ~20 minutes), which is why they are separate specs.
#
#   npm run test:coach-me:all         # the three prompts specs (41 cases)
#   npm run test:coach-me:answers     # the three answers specs (36 AI runs)
#   npm run test:coach-me:everything  # all six, one login
#
# ----------------------------------------------------------------------------
# Preconditions shared by EVERY scenario
#  - The session is authenticated ONCE per run and reused
#    (tests/support/fixtures.ts + support/session.ts), so no scenario logs in or
#    out. Credentials are only needed when the saved session has expired.
#  - The base URL is the staging tenant (https://stage-aicoach.insight.com).
#  - The first-run "Welcome to AI Coach" personalisation modal is dismissed
#    before any interaction, as it overlays the page and intercepts clicks.
#  - The account view intermittently mounts an empty page body (hydration/data
#    race); the automation reloads until the header renders.
#  - All scenarios run against customer "Ballyvesey Industries Ltd"
#    (GGP ID 0009626222).
#
# ----------------------------------------------------------------------------
# Cross-cutting behaviour, verified against staging
#
#  1. THREE Coach Me variants exist and every one differs:
#
#       Section          Modal title                  Prompts  Context banner  Buttons
#       Opportunities    "AI Coach — <opportunity>"         8  yes             1 per card
#       Expansion Plan   "Expansion Coach — <plan>"         4  no              1 per card (5)
#       Account Roadmap  "Account Roadmap Coach"            8  no              1 for the tab
#
#     Account Roadmap is the only title with no trailing subject. The three sets
#     share no prompt text, so a negative check asserting one set against
#     another modal fails on text even where the counts now coincide
#     (Opportunities and Account Roadmap are both 8).
#
#  1a. THE OPPORTUNITIES PROMPT SET WAS REPLACED WHOLESALE in Aug 2026: 7
#      prompts became 8, and every one was reworded (nothing carried over).
#      The suite caught it as a hard failure, which is what it is for. At the
#      same time the tab strip gained an "Opportunities (new)" tab, so a feature
#      rollout looks likely and this set may move again. The old set is recorded
#      in a comment on CoachMeModalPage.SUGGESTED_QUESTIONS.
#      Because "Opportunities" and "Opportunities (new)" both start with the
#      same words and accessible-name matching is substring-based, the tab
#      locator must match EXACTLY or every tab click hits a strict-mode
#      violation.
#
#  2. CLICKING A PROMPT DOES NOT ASK IT. It only fills the "Ask a custom
#     question" input, which is what enables the "Ask" button. The question is
#     sent by pressing Ask. (Verified by clicking a prompt and polling for 4
#     minutes: the conversation never changed, only Ask became enabled.)
#
#  3. The answer is NOT streamed — it appears in one block. "Ask" returns to
#     DISABLED once submitted, because submitting clears the input, so Ask is
#     NOT a completion signal; the assistant message is.
#
#  4. CONVERSATIONS PERSIST per opportunity / expansion plan / section.
#     Reopening a Coach Me modal restores whatever was last asked, so a run that
#     died mid-question leaves that subject dirty for every later run. The suites
#     therefore CLEAR the conversation rather than asserting it starts empty.
#
#  5. The modal has no role="dialog", so the automation locates it through the
#     app's data-sentry-component hooks instead of ARIA roles.
#
#  6. The Suggested Questions panel collapses to zero width rather than
#     unmounting, and its children keep a layout box, so "hidden" is asserted on
#     the panel container, not on the individual prompt buttons.
# ============================================================================


# ----------------------------------------------------------------------------
# tests/coachMeOpportunities.spec.ts — 16 cases, ~20s. Prompt text only; nothing is clicked.
# ----------------------------------------------------------------------------
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
    And it should offer a control to close the panel

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
    When I close the Suggested Questions panel
    Then the Suggested Questions panel should no longer be shown
    When I reopen it via the "Suggested Questions" toggle
    Then all 8 prompts should be displayed again, verbatim and in order

  Scenario: Display the same prompts after the modal is closed and reopened
    When I close the modal
    And I click "Coach Me" on the "Foundation Frontier Assessment" opportunity again
    Then all 8 prompts should be displayed again, verbatim and in order

  # Notes:
  #  - The cases run serially against ONE modal opened by the first scenario, so
  #    the two state-changing scenarios are deliberately last.
  #  - The prompts are the generic opportunity-coaching set: the same for every
  #    opportunity, not customer-specific. Add a customer/opportunity to the
  #    spec's constants to extend coverage.


# ----------------------------------------------------------------------------
# tests/coachMeOpportunitiesAnswers.spec.ts — 8 cases (8 AI runs), ~5m.
# ----------------------------------------------------------------------------
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
  #  - Answers are non-deterministic prose, so only properties that must hold
  #    for ANY valid answer are asserted. The answer text is attached to the run
  #    for human review, and grounding signals are logged, not asserted.
  #  - This suite does NOT clear the chat after each answer (unlike the two
  #    below); it clears BEFORE each question instead.
  #  - Observed behaviour against the NEW 8-prompt set (7 passed, 1 failed):
  #      1 client outcomes         ~19s   ~3.6k chars  names the customer
  #      2 why recommended         ~22s   ~5.3k chars  names the customer
  #      3 pitch as continuation   ~25s   ~5.8k chars  names the customer
  #      4 intro email             ~15s   ~1.1k chars  names the customer
  #      5 objections              ~24s   ~5.7k chars  names the customer
  #      6 blue sheet              ~35s  ~10.2k chars  names the customer
  #      7 engage with Microsoft   ~12s   ~0.1k chars  FAILS - see below
  #      8 Microsoft funding       ~12s   ~0.3k chars  terse but valid
  #
  #  - KNOWN ISSUE, prompt 7 ("How should I engage with Microsoft for this
  #    offer?"). The app answers:
  #        "Guidance for engaging with Microsoft for this offer is not yet
  #         available. The required Advisory Motion training content has not
  #         been loaded."
  #    That is a CONTENT GAP on staging, not a test defect, so the assertion is
  #    NOT weakened to accommodate it - the phrasing is in FAILURE_MARKERS so
  #    the failure names its cause rather than only tripping the length floor.
  #    The case is marked test.fixme so the nightly is not red every night for
  #    a gap the suite cannot fix; it reports as SKIPPED and starts guarding
  #    this prompt again as soon as the content is loaded. Remove the .fixme
  #    line in coachMeOpportunitiesAnswers.spec.ts then.
  #
  #  - Prompt 8 is terse (~279 chars) but a legitimate status answer about the
  #    Partner Funding team, so it clears the 200-character floor honestly.
  #  - "Answer mentions the customer" is NOT asserted: it holds for 6 of 8
  #    prompts (7 and 8 answer generically) and would false-fail on those.


# ----------------------------------------------------------------------------
# tests/expansionPlanCoachMe.spec.ts — 8 cases, ~13s. Prompt text only.
# ----------------------------------------------------------------------------
Feature: Coach Me - Expansion Plan suggested question prompts
  As an authenticated AI Coach user
  I want every expansion plan's Coach Me button to offer its coaching questions
  So that I can start a coaching session for any recommended expansion

  Background:
    Given I have an authenticated AI Coach session
    And I open the account page for customer "Ballyvesey Industries Ltd" with GGP ID "0009626222"
    And I open the "Expansion Plan" tab

  Scenario: List expansion plans, each with a title, description and Coach Me button
    Then between 1 and 5 expansion plans should be listed
    And every plan should show a title and a description
    And every plan should show an enabled "Coach Me" button
    And the number of "Coach Me" buttons should equal the number of plans
    And no HTTP 4xx or 5xx errors should have occurred while the tab loaded

  Scenario: Every Coach Me button should open an Expansion Coach modal offering the four suggested questions
    Given at least one expansion plan is listed
    When I click "Coach Me" on each expansion plan in turn
    Then each modal title should read "Expansion Coach — <that plan's title>"
    And each modal should show the "Suggested Questions" header
    And each modal should offer exactly these prompts, in order:
      | # | prompt                                                                |
      | 1 | Why is this expansion recommended for this client?                    |
      | 2 | How should I pitch this to my client?                                 |
      | 3 | How should I write an email to introduce this expansion to my client? |
      | 4 | What objections might the client raise and how best should I respond? |
    And each modal should close again between plans

  Scenario Outline: Display the expansion prompt "<prompt>" for the first plan
    Given the Expansion Coach modal is open for the first expansion plan
    Then the prompt "<prompt>" should be displayed
    And the prompt "<prompt>" should be enabled

    Examples:
      | prompt                                                                |
      | Why is this expansion recommended for this client?                    |
      | How should I pitch this to my client?                                 |
      | How should I write an email to introduce this expansion to my client? |
      | What objections might the client raise and how best should I respond? |

  Scenario: Display exactly four prompts, none blank or duplicated
    Given the Expansion Coach modal is open for the first expansion plan
    Then exactly 4 suggested question prompts should be displayed
    And no prompt should be blank
    And no prompt should appear twice

  Scenario: Offer a custom question box alongside the suggested prompts
    Given the Expansion Coach modal is open for the first expansion plan
    Then the "Ask a custom question:" input should be visible
    And the "Ask" button should be disabled while the input is empty

  # Notes:
  #  - The Expansion Plan tab loads asynchronously (skeleton, then the list), so
  #    the automation waits for the plan cards before interacting.
  #  - Plans are AI-generated and carry a "Last updated" date, so their titles
  #    and count change over time. The cards are discovered at RUNTIME and no
  #    plan title is ever hard-coded; the "each plan in turn" scenario asserts a
  #    plan exists first, so it cannot pass by simply looping zero times.
  #  - Verified against all 5 plans currently listed: every one offers the
  #    identical 4-prompt set, and each closes on a single click of the X.
  #  - Plan cards are GRANDCHILDREN of ExpansionPlanList (an intro paragraph and
  #    a wrapper div sit in between), so the card locator is ":scope > div > div".


# ----------------------------------------------------------------------------
# tests/expansionPlanCoachMeAnswers.spec.ts — 5 cases (20 AI runs), ~8.7m.
# One case per Coach Me button; each asks all four questions.
# ----------------------------------------------------------------------------
Feature: Coach Me - Expansion Plan answers
  As an authenticated AI Coach user
  I want every expansion plan's suggested questions to return usable answers
  So that I can act on the Expansion Coach output for any recommended expansion

  Background:
    Given I have an authenticated AI Coach session
    And I open the account page for customer "Ballyvesey Industries Ltd" with GGP ID "0009626222"
    And I open the "Expansion Plan" tab
    And any Coach Me modal left open by a previous case is closed first

  Scenario Outline: Run all four suggested questions for expansion plan <plan>
    Given expansion plan <plan> is listed
    When I click its "Coach Me" button
    Then the modal title should read "Expansion Coach — <that plan's title>"
    And the conversation should be empty, clearing any leftover one first

    # The four steps below repeat for each of the four suggested questions,
    # asked one at a time with the conversation reset in between.
    When I click the suggested question
    Then the custom question input should contain that question verbatim
    And the "Ask" button should become enabled
    When I press the "Ask" button
    Then the question should be echoed into the conversation verbatim
    And the custom question input should be cleared
    And exactly one assistant answer should be returned
    And the answer should be longer than 200 characters
    And the answer should not contain a failure marker
    When I wait 3 seconds
    And I press "Clear chat"
    Then the conversation should be empty again

    And the modal should close once all four questions are done
    And no HTTP 4xx or 5xx errors should have occurred during the run

    Examples:
      | plan |
      | 1    |
      | 2    |
      | 3    |
      | 4    |
      | 5    |

  # Notes:
  #  - Plan titles are read at runtime; only the plan COUNT is fixed
  #    (EXPECTED_PLAN_COUNT = 5). A case fails with an explicit "update
  #    EXPECTED_PLAN_COUNT" message if the account regenerates a different
  #    number, and the prompts spec guards the count independently.
  #  - Each question appears as its own step in the HTML report, so a failure
  #    names the question without hard-coding plan titles in test names.
  #  - Runs in default (not serial) mode with a self-healing setup that closes
  #    any modal left open, so one failing plan cannot hide the other four.
  #  - Observed on a full run (all 5 plans, 20 AI runs passing):
  #      Q1 why recommended  16-19s  2.7-3.6k chars
  #      Q2 how to pitch     17-21s  2.8-4.2k chars
  #      Q3 intro email      18-23s  3.7-4.0k chars
  #      Q4 objections       28-30s  7.3-8.8k chars
  #  - REGRESSION GUARD: the first full run failed on plan 2 because the suite
  #    assumed an empty conversation. Conversations persist (see cross-cutting
  #    note 4), so a failed run left plan 2 dirty and every later run failed at
  #    the same point. Clearing instead of asserting makes the suite re-runnable.


# ----------------------------------------------------------------------------
# tests/accountRoadmapCoachMe.spec.ts — 17 cases, ~12s. Prompt text only.
# ----------------------------------------------------------------------------
Feature: Coach Me - Account Roadmap suggested question prompts
  As an authenticated AI Coach user
  I want the Account Roadmap Coach to offer its coaching questions
  So that I can prepare a roadmap conversation without writing a prompt myself

  Background:
    Given I have an authenticated AI Coach session
    And I open the account page for customer "Ballyvesey Industries Ltd" with GGP ID "0009626222"
    And I open the "Account Roadmap" tab

  Scenario: Show the Account Roadmap tab with a single Coach Me entry point
    Then the "Account Roadmap" heading should be visible
    And the intro should read "Review the context below, then use Coach Me to prepare your pitch"
    And exactly 4 context accordion sections should be shown
    And the sections "Client Context", "Insight and Client Relationship", "Customer Personas" and "Technology Landscape" should be listed
    And exactly one enabled "Coach Me" button should be shown for the whole tab
    And no HTTP 4xx or 5xx errors should have occurred while the tab loaded

  Scenario: Open the "Account Roadmap Coach" modal from the Coach Me button
    When I click the "Coach Me" button
    Then the modal should open
    And the modal title should read "Account Roadmap Coach"

  Scenario: Display the Suggested Questions panel with its header
    Then the "Suggested Questions" panel should be visible
    And it should show the "Suggested Questions" header
    And it should offer a control to close the panel

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

  Scenario Outline: Display the roadmap prompt "<prompt>"
    Then the prompt "<prompt>" should be displayed
    And the prompt "<prompt>" should be enabled

    Examples:
      | prompt                                                                               |
      | Can you draft a Pursuit Plan for this account based on the context above?            |
      | Can you draft Deal Plan discovery questions for my first customer conversation?      |
      | What are the biggest issues or pain points I should be probing for with this client? |
      | What discovery questions should I ask in the first client conversation?              |
      | How should I structure the first discovery meeting?                                  |
      | How do I translate what I heard in discovery into actionable recommendations?        |
      | What's a good structure for presenting the roadmap back to the client?               |
      | How do I handle it when the client pushes back on a recommendation?                  |

  Scenario: Render no empty and no duplicate prompts
    Then no suggested question prompt should be blank
    And no suggested question prompt should appear twice

  Scenario: Offer a custom question box alongside the suggested prompts
    Then the "Ask a custom question:" input should be visible
    And the "Ask" button should be disabled while the input is empty

  Scenario: Hide the prompts when the panel is collapsed and restore them when reopened
    When I close the Suggested Questions panel
    Then the Suggested Questions panel should no longer be shown
    When I reopen it via the "Suggested Questions" toggle
    Then all 8 prompts should be displayed again, verbatim and in order

  Scenario: Display the same prompts after the modal is closed and reopened
    When I close the modal
    And I click "Coach Me" again
    Then all 8 prompts should be displayed again, verbatim and in order

  # Notes:
  #  - The tab has ONE Coach Me button for the whole tab (below the four context
  #    accordions), not one per card as on Expansion Plan.
  #  - The Suggested Questions panel SCROLLS: prompts 6-8 sit outside the
  #    viewport but are still rendered, which is what visibility asserts
  #    (Playwright visibility means "has a non-empty box", not "in viewport").
  #  - The cases run serially against ONE modal, so the two state-changing
  #    scenarios are deliberately last.


# ----------------------------------------------------------------------------
# tests/accountRoadmapCoachMeAnswers.spec.ts — 8 cases (8 AI runs), ~6.5m.
# One case per suggested question.
# ----------------------------------------------------------------------------
Feature: Coach Me - Account Roadmap answers
  As an authenticated AI Coach user
  I want every Account Roadmap suggested question to return a usable answer
  So that I can prepare a roadmap conversation from the coach output

  Background:
    Given I have an authenticated AI Coach session
    And I open the account page for customer "Ballyvesey Industries Ltd" with GGP ID "0009626222"
    And I open the "Account Roadmap" tab
    And the "Account Roadmap Coach" modal is open
    And the conversation is empty, clearing any leftover one first

  Scenario Outline: Run the suggested question "<prompt>" and check its answer
    When I click the prompt "<prompt>"
    Then the custom question input should contain that prompt verbatim
    And the "Ask" button should become enabled
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
      | prompt                                                                               |
      | Can you draft a Pursuit Plan for this account based on the context above?            |
      | Can you draft Deal Plan discovery questions for my first customer conversation?      |
      | What are the biggest issues or pain points I should be probing for with this client? |
      | What discovery questions should I ask in the first client conversation?              |
      | How should I structure the first discovery meeting?                                  |
      | How do I translate what I heard in discovery into actionable recommendations?        |
      | What's a good structure for presenting the roadmap back to the client?               |
      | How do I handle it when the client pushes back on a recommendation?                  |

  # Notes:
  #  - Because the tab has one Coach Me button and a FIXED prompt set, each
  #    question gets its own named test case — unlike the Expansion Plan
  #    answers, where AI-generated plan titles force runtime discovery.
  #  - Runs in default (not serial) mode with a self-healing setup that reopens
  #    the modal and clears any leftover conversation, so one failing question
  #    cannot hide the other seven and any subset can be run standalone.
  #  - Observed on a full run (all 8 passing):
  #      Q1 pursuit plan          ~49s  ~12.6k chars
  #      Q2 deal plan discovery   ~33s   ~7.4k chars
  #      Q3 issues / pain points  ~33s   ~6.8k chars
  #      Q4 discovery questions   ~34s   ~6.5k chars
  #      Q5 structure meeting     ~44s   ~8.2k chars
  #      Q6 discovery -> actions  ~54s   ~8.4k chars
  #      Q7 present roadmap back  ~38s   ~8.1k chars
  #      Q8 handle pushback       ~41s   ~8.2k chars
  #    Every question returns substantial content — unlike the Opportunities
  #    set, where prompt 7 currently fails on a staging content gap.
  #  - Roadmap answers are the LONGEST and SLOWEST of the three sections
  #    (6.5-12.6k chars, 33-54s vs 2.7-8.8k and 16-30s for Expansion Plan),
  #    consistent with the coach drawing on all four context accordions. Useful
  #    as a performance baseline if response times regress.
