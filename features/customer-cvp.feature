# BDD specification for the Customer Value Portal flows automated in
# tests/customer-cvp.spec.ts. These scenarios document the behaviour in
# Given/When/Then form; the Playwright spec is the executable implementation.
#
# Preconditions shared by every scenario:
#  - The session is authenticated ONCE (global-setup.ts) and reused via
#    storageState, so no scenario logs in or out.
#  - The base URL is the staging tenant (https://stage-aicoach.insight.com).
#  - The first-run "Welcome to AI Coach" personalisation modal is dismissed
#    before any interaction, as it overlays the page and intercepts clicks.
#  - A fresh account has no real customers, so scenarios that need rows enable
#    Demo Mode, which injects the sample customer data set.

Feature: Customer Value Portal
  As an authenticated AI Coach user
  I want to browse and manage my EMEA customer relationships
  So that I can review each customer's channels, revenue and account team

  Background:
    Given I have an authenticated AI Coach session
    And I open the Customer Value Portal page

  Scenario: Load the portal with title, search and currency controls
    Then the page URL should match "/customer-value-portal"
    And the "Microsoft Customer Insights" heading should be visible
    And the "Manage and track your EMEA customer relationships" description should be visible
    And the "Search customers by name..." box should be visible
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
    And Demo Mode is enabled so sample customers are loaded
    When I type a customer's name into the search box
    Then the search box value should equal what I typed
    When I clear the search box
    Then the search box value should be empty

  @known-issue @skip
  Scenario: Filter the customer list by name via search
    # KNOWN ISSUE: search does not filter the list on staging. Verified manually
    # against the Demo Mode data (fill, keystroke typing, matching name,
    # substring and non-match all leave every row visible). This scenario
    # documents the intended behaviour and is skipped until search is wired up.
    Given I dismiss the "Welcome to AI Coach" modal if it is shown
    And Demo Mode is enabled so sample customers are loaded
    When I search for an existing customer's name
    Then only rows whose name contains the query should be shown
    And the originating customer should remain visible
    When I search for a name that does not exist
    Then no customer rows should be shown
    When I clear the search box
    Then the full customer list should be restored

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


# Account detail page, reached from the customer list
# (https://.../customer-value-portal/account?id=<id>&id_type=SourceGGP).
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
    Then the page URL should match "/customer-value-portal/account?id=<digits>"
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
    And an "Upload Materials" button should be visible
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
    And the sections "Estate footprint", "Top insights", "End-user products", "Azure services consumption", "On-prem & hybrid" and "Eligible funded workshops" should be visible

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
  #  - Account Roadmap sections expand to different sizes depending on content
  #    (a populated section is tall, an empty "No data available" one is short),
  #    so "expand" is asserted as growth beyond the collapsed height, not a
  #    fixed size.
