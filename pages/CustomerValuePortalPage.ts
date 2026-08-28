import { Page, Locator, expect } from '@playwright/test';
import { CUSTOMER_ACCOUNT_PATH, CUSTOMER_VALUE_PORTAL_PATH } from '../support/routes';

/**
 * Customer Value Portal (https://.../customer-value-portal).
 *
 * Layout: a title/description header, a "Demo Mode" toggle and a currency
 * <select> (GBP/USD/EUR), a "Search customers by name" box, a customer table
 * (Customer / Channel / MS L12M Licensing Revenue / MS L12M ACR /
 * L12M Invoiced Total / Account Team columns) and pagination controls with a
 * "Showing X of Y customers" label.
 *
 * Locators lean on the app's stable `data-sentry-component` hooks, matching the
 * rest of the page objects in this suite.
 */
export class CustomerValuePortalPage {
  readonly page: Page;

  readonly root: Locator;
  readonly heading: Locator;
  readonly description: Locator;
  readonly demoModeButton: Locator;
  readonly currencySelect: Locator;
  readonly searchInput: Locator;

  readonly tableHeader: Locator;
  readonly rows: Locator;
  readonly skeletonRows: Locator;

  readonly pagination: Locator;
  readonly showingLabel: Locator;
  readonly firstPageButton: Locator;
  readonly prevPageButton: Locator;
  readonly nextPageButton: Locator;
  readonly lastPageButton: Locator;
  readonly currentPageButton: Locator;

  /** First-run "Welcome to AI Coach" personalisation modal (app-wide). */
  readonly welcomeDialogHeading: Locator;

  /** Currency code -> symbol shown in the revenue cells. */
  static readonly CURRENCY_SYMBOL: Record<string, string> = {
    GBP: '£',
    USD: '$',
    EUR: '€',
  };

  constructor(page: Page) {
    this.page = page;
    this.root = page.locator('[data-sentry-component="CustomerValuePortal"]');
    this.heading = page.getByRole('heading', { name: 'Microsoft Customer Insights', level: 1 });
    // The subtitle is rendered twice (responsive layouts); scope to the first.
    // Matched by pattern because the qualifier has already changed once
    // ("your EMEA customer relationships" -> "your Microsoft customer
    // relationships"); the surrounding sentence is the stable part.
    this.description = page.getByText(/Manage and track your .*customer relationships/i).first();
    this.demoModeButton = page.getByRole('button', { name: 'Demo Mode' });
    this.currencySelect = page.locator('[data-sentry-component="CurrencySelect"] select');
    // Located via the search component rather than its placeholder: the copy has
    // already changed once ("Search customers by name..." -> "Search by
    // customer's sold-to, RP, GP, or GGP name or ID number") and contains a
    // curly apostrophe, so matching on it is needlessly brittle.
    //
    // RENAMED (Aug 2026): the component is "SearchBar", it was "Search". Matched
    // by PREFIX so both spellings resolve — the rename does not 404 or otherwise
    // announce itself, it just makes the box unfindable and every search test
    // hang on fill() until the test timeout.
    this.searchInput = page.locator('[data-sentry-component^="Search"] input');

    this.tableHeader = page.locator('[data-sentry-component="TableHeader"]');
    this.rows = page.locator('[data-sentry-component="TableBody"]');
    // Loading placeholders. They occupy the table while a list/search request
    // is in flight, and they are ALSO the empty state when the account has no
    // customers — so "rows === 0" alone never distinguishes "still loading"
    // from "nothing matched". Assert on this too when that difference matters.
    this.skeletonRows = page.locator('[data-sentry-component="SkeletonRow"]');

    // RENAMED (Aug 2026): "Pagination", was "PaginationButtons". Prefix-matched
    // for the same reason as the search box above; it still holds the
    // "Showing X of Y customers" label and the four page buttons.
    this.pagination = page.locator('[data-sentry-component^="Pagination"]');
    this.showingLabel = this.pagination.getByText(/Showing\s+\d+\s+of\s+\d+/);
    this.firstPageButton = this.pagination.getByRole('button', { name: 'First page' });
    this.prevPageButton = this.pagination.getByRole('button', { name: 'Previous page' });
    this.nextPageButton = this.pagination.getByRole('button', { name: 'Next page' });
    this.lastPageButton = this.pagination.getByRole('button', { name: 'Last page' });
    this.currentPageButton = this.pagination.locator('button[aria-current="page"]');

    this.welcomeDialogHeading = page.getByRole('heading', { name: 'Welcome to AI Coach', exact: true });
  }

  /** Navigate to the Customer Value Portal. */
  async goto(): Promise<void> {
    await this.page.goto(CUSTOMER_VALUE_PORTAL_PATH, { waitUntil: 'domcontentloaded' });
  }

  /**
   * Dismiss the first-run "Welcome to AI Coach" personalisation modal. It
   * renders a short moment after navigation and overlays the app (intercepting
   * clicks), so wait briefly; if it never appears, do nothing.
   */
  async dismissWelcomeDialog(): Promise<void> {
    try {
      await this.welcomeDialogHeading.waitFor({ state: 'visible', timeout: 8000 });
    } catch {
      return; // modal did not appear
    }
    const skip = this.page.getByRole('button', { name: 'Skip for now' });
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
    } else {
      await this.page.getByRole('button', { name: 'Close modal' }).click();
    }
    await expect(this.welcomeDialogHeading).toBeHidden();
  }

  /**
   * Whether Demo Mode is currently enabled. The active button carries the
   * app's "hunger" accent classes; inactive it does not.
   */
  async isDemoModeOn(): Promise<boolean> {
    const cls = (await this.demoModeButton.getAttribute('class')) ?? '';
    return /(^|\s)(bg-hunger\/10|text-hunger)(\s|$)/.test(cls);
  }

  /**
   * Get the portal into a state with customer rows visible: dismiss the
   * first-run welcome modal, enable Demo Mode if it is off (a fresh account has
   * no real customers; Demo Mode injects the sample data set), and recover from
   * the occasional "We couldn't load the customer list" backend error by
   * clicking the app's own "Try again" button. Retries a few times because the
   * staging list endpoint is intermittently flaky.
   */
  async ensureCustomersLoaded(): Promise<void> {
    await this.dismissWelcomeDialog();

    // Wait until the portal is actually interactive before reading or clicking
    // anything. goto() only waits for domcontentloaded, and Demo Mode PERSISTS
    // across navigation — so reading the toggle mid-hydration can report the
    // server-rendered (inactive) class while the real state is on. Clicking on
    // that misread switches Demo Mode OFF and the list then never loads. This
    // was the intermittent "TableBody not found" failure.
    await this.demoModeButton.waitFor({ state: 'visible', timeout: 30000 });
    await this.tableHeader.waitFor({ state: 'visible', timeout: 30000 });

    const tryAgain = this.page.getByRole('button', { name: 'Try again' });

    // NOTE: do NOT treat SkeletonRow as "loading, leave the toggle alone". Those
    // placeholders are ALSO the empty state when there are no customers, so
    // skipping the toggle while they are on screen means Demo Mode never gets
    // enabled and the list can never populate.
    for (let attempt = 0; attempt < 5; attempt++) {
      // Cheap check first: the rows are frequently already there.
      if (await this.rows.first().isVisible({ timeout: 1000 }).catch(() => false)) {
        return;
      }

      if (await tryAgain.isVisible().catch(() => false)) {
        await tryAgain.click();
      } else if (!(await this.isDemoModeOn())) {
        // Fresh account: Demo Mode injects the sample customer set.
        await this.demoModeButton.click();
      } else if (attempt > 0) {
        // Reports on but nothing arrived — bounce it to force a refetch.
        await this.demoModeButton.click();
        await this.demoModeButton.click();
      }

      // MEASURED: rows land ~6-8s after Demo Mode is enabled. The old 8s wait
      // sat exactly on that boundary, so a slower runner tipped it into failure.
      if (await this.rows.first().isVisible({ timeout: 25000 }).catch(() => false)) {
        return;
      }
    }
    // Final assertion surfaces a clear failure if the list still won't load.
    await expect(this.rows.first()).toBeVisible({ timeout: 30000 });
  }

  /**
   * Get the portal into its REAL (non-demo) state.
   *
   * The search endpoint queries the account's real customers; the Demo Mode
   * sample set is a separate, client-side list that search does not touch, so a
   * query typed with Demo Mode ON appears to do nothing. Tests that exercise
   * search therefore turn it off first.
   *
   * The hydration guard is the same one ensureCustomersLoaded() uses and
   * matters for the same reason: reading the toggle mid-hydration can report
   * the server-rendered (inactive) class while the real state is on, and acting
   * on that misread flips Demo Mode the wrong way.
   */
  async ensureDemoModeOff(): Promise<void> {
    await this.dismissWelcomeDialog();
    await this.demoModeButton.waitFor({ state: 'visible', timeout: 60000 });
    await this.tableHeader.waitFor({ state: 'visible', timeout: 30000 });

    if (await this.isDemoModeOn()) {
      await this.demoModeButton.click();
      await expect
        .poll(() => this.isDemoModeOn(), { timeout: 15000 })
        .toBe(false);
    }

    // Gate on the "Showing X of Y" label before handing back. It renders only
    // once the list endpoint has answered, so waiting for it is what proves the
    // page is hydrated — and a query typed into the (controlled) search input
    // before that is silently dropped, which shows up later as a search that
    // returned nothing rather than as an error here.
    await expect(this.showingLabel).toBeVisible({ timeout: 60000 });
  }

  /** The customer-name element within a given row. */
  nameOf(row: Locator): Locator {
    return row.locator('[data-sentry-component="Customer"] p').first();
  }

  /**
   * Click a customer row to open its account detail page. Returns the clicked
   * customer's name so the caller can assert it on the destination page.
   */
  async openCustomer(index = 0): Promise<string> {
    const row = this.rows.nth(index);
    const name = ((await this.nameOf(row).textContent()) ?? '').trim();
    await row.click();
    await this.page.waitForURL(new RegExp(CUSTOMER_ACCOUNT_PATH));
    return name;
  }

  /**
   * The first monetary cell within a given row. The table now renders three
   * currency columns per row (MS L12M Licensing Revenue, MS L12M ACR,
   * L12M Invoiced Total), each a `CurrencyColumn` component; the first is the
   * MS L12M Licensing Revenue value. Used to assert currency formatting and
   * that the displayed symbol tracks the currency selector.
   */
  revenueCellOf(row: Locator): Locator {
    return row.locator('[data-sentry-component="CurrencyColumn"]').first();
  }

  /** Trimmed name text of the first customer row (waits for it to render). */
  async firstCustomerName(): Promise<string> {
    await expect(this.rows.first()).toBeVisible({ timeout: 20000 });
    return ((await this.nameOf(this.rows.first()).textContent()) ?? '').trim();
  }

  /** Parse "Showing X of Y customers" into its two numbers. */
  async showing(): Promise<{ shown: number; total: number }> {
    const text = (await this.showingLabel.textContent()) ?? '';
    const m = text.match(/Showing\s+(\d+)\s+of\s+(\d+)/);
    return { shown: Number(m?.[1] ?? NaN), total: Number(m?.[2] ?? NaN) };
  }

  /**
   * Type into the search box. Empty string clears it.
   *
   * The value is read back because this is a controlled React input on a page
   * that hydrates late: a fill() that lands too early is wiped by the re-render
   * and the query never reaches the endpoint, which then looks like "the search
   * matched nothing" several assertions later.
   */
  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await expect(this.searchInput).toHaveValue(query);
  }

  /**
   * Select a display currency by its code (GBP/USD/EUR) and wait for the
   * customer list to come back.
   *
   * MEASURED against staging: changing the currency REFETCHES the list. The
   * rows are swapped for SkeletonRow placeholders — so `rows` is genuinely 0 —
   * for one to three seconds, and then re-render carrying the new symbol.
   * Anything that asserts on a row straight after selecting is asserting on a
   * detached element, and on the intermittently flaky list endpoint the refetch
   * sometimes does not come back at all. That is how "should change the
   * displayed currency symbol" failed with "element(s) not found" after a full
   * 20 seconds of retrying.
   *
   * The recovery re-picks the currency because ensureCustomersLoaded() can
   * bounce Demo Mode, which resets the selection.
   */
  async selectCurrency(code: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      // selectOption can itself lose the element to a refetch already in
      // flight; that is a retry, not a failure.
      const picked = await this.currencySelect
        .selectOption(code)
        .then(() => true, () => false);

      if (picked) {
        const listReturned = await this.rows
          .first()
          .waitFor({ state: 'visible', timeout: 30000 })
          .then(() => true, () => false);
        if (listReturned) return;
      }

      await this.ensureCustomersLoaded();
    }

    await expect(
      this.rows.first(),
      `The customer list never came back after selecting ${code}. Changing the ` +
        'currency refetches the list, so this means the refetch returned nothing ' +
        'three times in a row.',
    ).toBeVisible({ timeout: 20000 });
  }
}
