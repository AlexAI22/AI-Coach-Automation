# BDD specification for the Customer Value Portal flows automated in
# tests/customer-cvp.spec.ts. These scenarios document the behaviour in
# Given/When/Then form; the Playwright spec is the executable implementation.
#
# Preconditions shared by every scenario:
#  - The session is authenticated ONCE per run and reused
#    (tests/support/fixtures.ts + support/session.ts), so no scenario logs in
#    or out. There is no global-setup any more: the login happens in the single
#    browser window the whole run shares.
#  - The base URL is the staging tenant (https://stage-aicoach.insight.com).
#  - The first-run "Welcome to AI Coach" personalisation modal is dismissed
#    before any interaction, as it overlays the page and intercepts clicks.
#  - A fresh account has no real customers, so scenarios that need rows enable
#    Demo Mode, which injects the sample customer data set.
#  - THE SEARCH SCENARIOS ARE THE EXCEPTION: they turn Demo Mode OFF. Search
#    queries the account's REAL customers, and the Demo Mode sample set is a
#    separate client-side list the endpoint knows nothing about, so a query
#    typed with Demo Mode on appears to do nothing at all. They run as a group
#    and switch Demo Mode back on afterwards, because it is shared by the run's
#    single window and every later scenario needs the sample customers.
#  - A ROW COUNT OF ZERO IS AMBIGUOUS. While a list or search request is in
#    flight the rows are replaced by SkeletonRow placeholders, a DIFFERENT
#    component, so "no rows" also means "still loading". Scenarios asserting an
#    empty result check the skeletons and the "Showing 0 of 0" label as well.
#  - Typing before the portal has hydrated is silently lost: the search box is a
#    controlled input, and a value set too early is wiped by the re-render and
#    never reaches the backend. The automation waits for the "Showing X of Y"
#    label, which renders only once the list endpoint has answered.

Feature: Customer Value Portal
  As an authenticated AI Coach user
  I want to browse and manage my Microsoft customer relationships
  So that I can review each customer's channels, revenue and account team

  Background:
    Given I have an authenticated AI Coach session
    And I open the Customer Value Portal page

  Scenario: Load the portal with title, search and currency controls
    Then the page URL should match "/customer-value-portal"
    And the "Microsoft Customer Insights" heading should be visible
    And the "Manage and track your Microsoft customer relationships" description should be visible
    And the customer search box should be visible
    And the "Demo Mode" button should be visible
    And the currency selector should offer "GBP", "USD" and "EUR"
    And no HTTP 4xx or 5xx errors should have occurred while the page loaded

  Scenario: Render the customer table with all column headers
    Then the customer table header should be visible
    And it should show the "Customer" column
    And it should show the "Channel" column
    And it should show the "MS L12M Licensing Revenue" column
    And it should show the "MS L12M ACR" column
    And it should show the "L12M Invoiced Total" column
    And it should show the "Account Team" column

  Scenario: List customers and match the "Showing X of Y" count
    Given I dismiss the "Welcome to AI Coach" modal if it is shown
    And Demo Mode is enabled so sample customers are loaded
    Then at least one customer row should be shown
    And the "Showing X of Y customers" label should equal the number of rows rendered
    And the total count should be greater than or equal to the number shown
    And every row should show a customer name
    And every row should show a "Customer ID:" value
    And every row should show a revenue value formatted with a currency symbol

  Scenario: Accept text in the customer search box
    Given I dismiss the "Welcome to AI Coach" modal if it is shown
    And Demo Mode is turned off so the real customer list is shown
    When I type "2E2" into the search box
    Then the search box value should read "2E2"
    When I clear the search box
    Then the search box value should be empty

  Scenario: Filter out non-matching customers via search
    # This scenario used to pass for the WRONG REASON. It waited for a row count
    # of zero, which is also what the refetch skeleton produces, so it would have
    # passed just as happily for a query that MATCHES a customer. It now proves
    # the list is genuinely empty - no rows, no skeletons, "Showing 0 of 0" - and
    # searches again afterwards so the empty result is shown to be the query
    # doing its job rather than a list that had stopped loading.
    Given I dismiss the "Welcome to AI Coach" modal if it is shown
    And Demo Mode is turned off so the real customer list is shown
    When I search for "2E2"
    Then exactly one customer row should be shown
    When I search for a name that does not exist
    Then the label should read "Showing 0 of 0 customers"
    And no customer rows should be shown
    And no loading skeletons should be left on screen
    When I search for "2E2" again
    Then exactly one customer row should be shown

  Scenario: Narrow the list to matching customers via search
    # WAS A KNOWN PRODUCT ISSUE, AND IS NOT ONE. This scenario spent a long time
    # failing on purpose, with a note saying search never narrowed the list.
    # Re-measured Aug 2026: search queries the account's REAL customers, while
    # the scenario was typing into a list showing the Demo Mode sample set - a
    # separate data set the endpoint knows nothing about - so the sample rows sat
    # there unchanged and looked like a broken filter. It was the wrong data
    # source, not a broken feature. With Demo Mode OFF it works as specified:
    #
    #   query                          rows  label
    #   (none)                            0  Showing 0 of 0 customers
    #   "2E2"                             1  Showing 1 of 1 customers
    #   "zzzz-no-such-customer-zzzz"      0  Showing 0 of 0 customers
    #
    # Note the real list is EMPTY until something is searched for, so there is no
    # unfiltered baseline to compare against.
    Given I dismiss the "Welcome to AI Coach" modal if it is shown
    And Demo Mode is turned off so the real customer list is shown
    When I search for "2E2"
    Then exactly one customer row should be shown
    And the customer name should read "2E2"
    And the row should show "Customer ID: 0009608659"
    And the label should read "Showing 1 of 1 customers"

  Scenario: Change the displayed currency symbol
    Given I dismiss the "Welcome to AI Coach" modal if it is shown
    And Demo Mode is enabled so sample customers are loaded
    When I select "USD" from the currency selector
    Then the revenue values should display the "$" symbol
    When I select "GBP" from the currency selector
    Then the revenue values should display the "£" symbol
    When I select "EUR" from the currency selector
    Then the revenue values should display the "€" symbol

  Scenario: Expose pagination controls with the first page active
    Given I dismiss the "Welcome to AI Coach" modal if it is shown
    And Demo Mode is enabled so sample customers are loaded
    Then the pagination controls should be visible
    And the "Showing X of Y customers" label should be visible
    And the "First page" button should be disabled
    And the "Previous page" button should be disabled
    And the current page button should read "1"
    And when all customers fit on one page the "Next page" and "Last page" buttons should be disabled

  # Notes:
  #  - Counts are asserted relationally (label == rendered rows) rather than
  #    hard-coded, because the customer set can change.
  #  - The customer table loads asynchronously, so the automated suite uses a
  #    raised (20s) web-first assertion timeout.
  #  - CHANGING THE CURRENCY REFETCHES THE LIST: the rows are swapped for
  #    skeletons for one to three seconds and then re-render carrying the new
  #    symbol, so the automation waits for the list to come back before
  #    asserting and recovers if the refetch returns nothing.
  #  - The search box and the pagination block are located through the app's
  #    component hooks, both renamed in Aug 2026 ("Search" to "SearchBar",
  #    "PaginationButtons" to "Pagination"). A rename does not announce itself -
  #    the locator simply matches nothing and the step waits out the full test
  #    timeout - so both are now matched by PREFIX.
  #  - An "Account Team" filter sits beside the search box. It is NOT covered.


# Account detail page, reached from the customer list
# (https://.../customer-value-portal/customer?id=<id>&id_type=SourceGGP).
#
# Additional preconditions:
#  - The account view intermittently mounts an empty page body (hydration/data
#    race); the automation reloads until the header renders.
#  - Monetary values are frequently "N/A" / "No agreement data available" for
#    demo customers, so currency scenarios assert the selector, not amounts.
#  - The detail scenarios are data-driven in the spec: they run against each
#    demo customer in turn (currently Inflexion Buyout V Investments LP). The
#    <customer> placeholder below stands for any of them.

Feature: Customer Value Portal - Account detail
  As an authenticated AI Coach user
  I want to open a customer's account page
  So that I can review its KPIs, sales channels, team and opportunity tabs

  Background:
    Given I have an authenticated AI Coach session

  Scenario: Open the account page when a customer row is clicked
    Given I open the Customer Value Portal with Demo Mode customers loaded
    When I click the first customer row
    Then the page URL should match "/customer-value-portal/customer?id=<digits>"
    And the account heading should show the clicked customer's name
    And the account should show a "GGP ID:" or "Customer ID:" value
    And the "Customers" breadcrumb should link to "/customer-value-portal"

  Scenario: Navigate back to the portal via the breadcrumb
    Given I open the Customer Value Portal with Demo Mode customers loaded
    And I click the first customer row
    When I click the "Customers" breadcrumb
    Then the page URL should match "/customer-value-portal"
    And the "Microsoft Customer Insights" heading should be visible

  Scenario Outline: Show the account header for <customer>
    Given I open the account page for "<customer>"
    Then the page URL should contain the customer id
    And the account heading should read "<customer>"
    And the account should show a "GGP ID:" or "Customer ID:" value
    And the "Customers" breadcrumb should link to "/customer-value-portal"

    Examples:
      | customer                          |
      | Inflexion Buyout V Investments LP |

  Scenario Outline: Render the four KPI cards for <customer>
    Given I open the account page for "<customer>"
    Then exactly 4 KPI cards should be shown
    And the KPI cards should include "Total L12M ACR"
    And the KPI cards should include "Annual Microsoft Licensing Revenue"
    And the KPI cards should include "L12M Booked Insight-Delivered Services Revenue"
    And the KPI cards should include "Renewal Dates"

    Examples:
      | customer                          |
      | Inflexion Buyout V Investments LP |

  Scenario Outline: Render the Sales Channel Overview for <customer>
    Given I open the account page for "<customer>"
    Then the Sales Channel Overview table should be visible
    And it should show the columns "Sales Channel", "ACR", "Licensing Rev", "Next Renewal Date" and "Majority Seat Renewal"
    And at least one sales channel row should be listed
    And the section collapse toggle should be available

    Examples:
      | customer                          |
      | Inflexion Buyout V Investments LP |

  Scenario Outline: Show the Insight Account Team for <customer>
    Given I open the account page for "<customer>"
    Then the "Insight Account Team" card should be visible
    And at least one member with a role of "Account Owner" or "Customer Success Manager" should be listed

    Examples:
      | customer                          |
      | Inflexion Buyout V Investments LP |

  Scenario Outline: Show the account tab strip for <customer>
    Given I open the account page for "<customer>"
    Then the tabs "Opportunities", "Expansion Plan", "Account Roadmap" and "Microsoft Deep Dive" should be visible
    And the "Opportunities" tab should be active by default

    Examples:
      | customer                          |
      | Inflexion Buyout V Investments LP |

  Scenario Outline: Opportunities tab lists opportunities for <customer>
    Given I open the account page for "<customer>"
    When I open the "Opportunities" tab
    Then at least one opportunity should be shown
    And each opportunity should have a title, a description and a "Coach Me" button

    Examples:
      | customer                          |
      | Inflexion Buyout V Investments LP |

  Scenario Outline: Expansion Plan tab shows recommendations for <customer>
    Given I open the account page for "<customer>"
    When I open the "Expansion Plan" tab
    Then the expansion plan panel should load (skeleton then list)
    And at least one expansion recommendation with a "Coach Me" button should be shown

    Examples:
      | customer                          |
      | Inflexion Buyout V Investments LP |

  Scenario Outline: Account Roadmap tab shows the roadmap sections for <customer>
    Given I open the account page for "<customer>"
    When I open the "Account Roadmap" tab
    Then the "Account Roadmap" heading should be visible
    And an "Upload Materials" button should be visible in the tab strip
    And exactly 4 context accordion sections should be shown
    And the sections "Client Context", "Insight and Client Relationship", "Customer Personas" and "Technology Landscape" should be listed
    And a "Coach Me" button should be visible

    Examples:
      | customer                          |
      | Inflexion Buyout V Investments LP |

  Scenario Outline: Account Roadmap context sections expand when opened for <customer>
    Given I open the account page for "<customer>"
    And I open the "Account Roadmap" tab
    When I open the "Client Context" section
    Then the "Client Context" section should expand to reveal its content
    When I open the "Insight and Client Relationship" section
    Then the "Insight and Client Relationship" section should expand to reveal its content
    When I open the "Customer Personas" section
    Then the "Customer Personas" section should expand to reveal its content
    When I open the "Technology Landscape" section
    Then the "Technology Landscape" section should expand to reveal its content

    Examples:
      | customer                          |
      | Inflexion Buyout V Investments LP |

  Scenario Outline: Microsoft Deep Dive tab shows the estate sections for <customer>
    Given I open the account page for "<customer>"
    When I open the "Microsoft Deep Dive" tab
    Then the tenant selector should be visible
    # "Top insights" is deliberately absent: it rendered earlier the same day and
    # then stopped, and a 25s recon found 0 occurrences anywhere on the tab while
    # the other five were stable. It is either removed or now conditional on the
    # customer having insights. WORTH CONFIRMING with the product team.
    And the sections "Estate footprint", "End-user products", "Azure services consumption", "On-prem & hybrid" and "Eligible funded workshops" should be visible

    Examples:
      | customer                          |
      | Inflexion Buyout V Investments LP |

  Scenario Outline: Change the selected account currency for <customer>
    Given I open the account page for "<customer>"
    When I select "USD" from the account currency selector
    Then the account currency selector should read "USD"
    When I select "GBP" from the account currency selector
    Then the account currency selector should read "GBP"
    When I select "EUR" from the account currency selector
    Then the account currency selector should read "EUR"

    Examples:
      | customer                          |
      | Inflexion Buyout V Investments LP |

  # Notes:
  #  - Tab content assertions target stable structural labels (section titles,
  #    buttons), not the AI-generated body text, which varies per customer/run.
  #  - Expansion Plan and Microsoft Deep Dive load asynchronously, so the
  #    automated suite waits with raised timeouts.
  #  - SELECTING AN ACCOUNT CURRENCY UNMOUNTS THE WHOLE ACCOUNT VIEW for one to
  #    three seconds - no AccountTitle, no KPI cards, an empty main - and it then
  #    remounts with the new currency applied. The automation waits out that
  #    remount and reopens the page if it comes back empty, so the step cannot
  #    fail against an element that is merely mid-remount.
  #  - Account Roadmap sections expand to different sizes depending on content
  #    (a populated section is tall, an empty "No data available" one is short),
  #    so "expand" is asserted as growth beyond the collapsed height, not a
  #    fixed size.
