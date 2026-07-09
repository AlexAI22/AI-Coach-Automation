import { Page, Locator, expect } from '@playwright/test';

/**
 * Customer Value Portal (https://.../customer-value-portal).
 *
 * Layout: a title/description header, a "Demo Mode" toggle and a currency
 * <select> (GBP/USD/EUR), a "Search customers by name" box, a customer table
 * (Customer / Channel / Annual Revenue / L12M ACR / Account Team columns) and
 * pagination controls with a "Showing X of Y customers" label.
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
    this.description = page.getByText('Manage and track your EMEA customer relationships').first();
    this.demoModeButton = page.getByRole('button', { name: 'Demo Mode' });
    this.currencySelect = page.locator('[data-sentry-component="CurrencySelect"] select');
    this.searchInput = page.getByPlaceholder('Search customers by name...');

    this.tableHeader = page.locator('[data-sentry-component="TableHeader"]');
    this.rows = page.locator('[data-sentry-component="TableBody"]');

    this.pagination = page.locator('[data-sentry-component="PaginationButtons"]');
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
    await this.page.goto('/customer-value-portal', { waitUntil: 'domcontentloaded' });
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
    const tryAgain = this.page.getByRole('button', { name: 'Try again' });

    for (let attempt = 0; attempt < 4; attempt++) {
      if (!(await this.isDemoModeOn())) {
        await this.demoModeButton.click();
      }
      if (await tryAgain.isVisible().catch(() => false)) {
        await tryAgain.click();
      }
      if (await this.rows.first().isVisible({ timeout: 8000 }).catch(() => false)) {
        return;
      }
    }
    // Final assertion surfaces a clear failure if the list still won't load.
    await expect(this.rows.first()).toBeVisible({ timeout: 15000 });
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
    await this.page.waitForURL(/\/customer-value-portal\/account/);
    return name;
  }

  /** The Annual Revenue cell within a given row. */
  annualRevenueOf(row: Locator): Locator {
    return row.locator('[data-sentry-component="AnnualRevenue"]');
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

  /** Type into the search box (client-side filter). Empty string clears it. */
  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
  }

  /** Select a display currency by its code (GBP/USD/EUR). */
  async selectCurrency(code: string): Promise<void> {
    await this.currencySelect.selectOption(code);
  }
}
