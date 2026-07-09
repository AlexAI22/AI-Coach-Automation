import { test, expect } from '@playwright/test';
import { CustomerValuePortalPage } from '../pages/CustomerValuePortalPage';
import { CustomerAccountPage } from '../pages/CustomerAccountPage';
import { AUTH_FILE } from '../global-setup';
import { watchHttpErrors } from './support/httpErrors';

/**
 * Customer Value Portal (https://.../customer-value-portal).
 *
 * Uses the reused authenticated session established once in global-setup.ts
 * (storageState). Tracing stays off because a reused session's requests/snapshots
 * can carry account context.
 */
test.use({
  trace: 'off',
  storageState: AUTH_FILE,
});

test.describe('Customer Value Portal (reused session)', () => {
  test.describe.configure({ mode: 'default' });

  let cvp: CustomerValuePortalPage;

  test.beforeEach(async ({ page }) => {
    test.skip(
      !process.env.EMAIL || !process.env.PASSWORD,
      'EMAIL and PASSWORD must be set (via the environment)',
    );
    cvp = new CustomerValuePortalPage(page);
    await cvp.goto();
  });

  test('should load the portal with title, search and currency controls', async ({ page }) => {
    const httpErrors = watchHttpErrors(page);

    await expect(page).toHaveURL(/\/customer-value-portal/);
    await expect(cvp.heading).toBeVisible();
    await expect(cvp.description).toBeVisible();
    await expect(cvp.searchInput).toBeVisible();
    await expect(cvp.demoModeButton).toBeVisible();

    // Currency selector exposes exactly the three supported currencies.
    await expect(cvp.currencySelect).toBeVisible();
    await expect(cvp.currencySelect.locator('option')).toHaveText([/GBP/, /USD/, /EUR/]);

    expect(httpErrors, `Unexpected HTTP errors: ${JSON.stringify(httpErrors, null, 2)}`).toEqual([]);
  });

  test('should render the customer table with all column headers', async () => {
    await expect(cvp.tableHeader).toBeVisible({ timeout: 20000 });
    for (const col of ['Customer', 'Channel', 'Annual Revenue', 'L12M ACR', 'Account Team']) {
      await expect(cvp.tableHeader).toContainText(col);
    }
  });

  test('should list customers and match the "Showing X of Y" count', async () => {
    await cvp.ensureCustomersLoaded();

    const rowCount = await cvp.rows.count();
    expect(rowCount).toBeGreaterThan(0);

    // The "Showing X of Y customers" label reflects the rendered rows.
    const { shown, total } = await cvp.showing();
    expect(shown).toBe(rowCount);
    expect(total).toBeGreaterThanOrEqual(shown);

    // Every row has a customer name, a "Customer ID:" line and an Annual Revenue
    // value formatted as a currency amount.
    for (let i = 0; i < rowCount; i++) {
      const row = cvp.rows.nth(i);
      await expect(cvp.nameOf(row)).not.toBeEmpty();
      await expect(row).toContainText(/Customer ID:\s*\d+/);
      await expect(cvp.annualRevenueOf(row)).toContainText(/[£$€]/);
    }
  });

  test('should accept text in the customer search box', async () => {
    await cvp.ensureCustomersLoaded();

    // The control is present and editable (value reflects typed input).
    const name = await cvp.firstCustomerName();
    const token = name.split(/\s+/)[0];
    await cvp.search(token);
    await expect(cvp.searchInput).toHaveValue(token);

    await cvp.search('');
    await expect(cvp.searchInput).toHaveValue('');
  });

  // KNOWN ISSUE: the search box does not filter the customer list on staging.
  // Verified manually against the Demo Mode data set (the only data available on
  // a fresh account): typing a matching name, a substring, or a non-matching
  // string all leave every row visible. Kept as fixme so it starts running (and
  // guarding the behaviour) once search is wired up. Remove `.fixme` then.
  test.fixme('should filter the customer list by name via search', async () => {
    await cvp.ensureCustomersLoaded();
    const total = await cvp.rows.count();

    const fullName = await cvp.firstCustomerName();
    const token = fullName.split(/\s+/)[0];

    // Matching query narrows the list to rows containing the query.
    await cvp.search(token);
    await expect(cvp.rows.filter({ hasText: fullName })).toHaveCount(1);
    const filtered = await cvp.rows.count();
    expect(filtered).toBeLessThanOrEqual(total);
    for (let i = 0; i < filtered; i++) {
      await expect(cvp.nameOf(cvp.rows.nth(i))).toContainText(new RegExp(token, 'i'));
    }

    // A non-matching query yields no rows; clearing restores the full list.
    await cvp.search('zzzz-no-such-customer-zzzz');
    await expect(cvp.rows).toHaveCount(0);
    await cvp.search('');
    await expect(cvp.rows).toHaveCount(total);
  });

  test('should change the displayed currency symbol', async () => {
    await cvp.ensureCustomersLoaded();

    const firstRevenue = cvp.annualRevenueOf(cvp.rows.first());
    await expect(firstRevenue).toBeVisible({ timeout: 20000 });

    for (const code of ['USD', 'GBP', 'EUR']) {
      await cvp.selectCurrency(code);
      const symbol = CustomerValuePortalPage.CURRENCY_SYMBOL[code];
      await expect(firstRevenue).toContainText(symbol);
    }
  });

  test('should expose pagination controls with the first page active', async () => {
    await cvp.ensureCustomersLoaded();

    await expect(cvp.pagination).toBeVisible({ timeout: 20000 });
    await expect(cvp.showingLabel).toBeVisible();

    // On the first page, "First" and "Previous" are always disabled and the
    // active page button is marked current.
    await expect(cvp.firstPageButton).toBeDisabled();
    await expect(cvp.prevPageButton).toBeDisabled();
    await expect(cvp.currentPageButton).toHaveText('1');

    // If everything fits on one page, "Next"/"Last" are disabled too.
    const { shown, total } = await cvp.showing();
    if (shown >= total) {
      await expect(cvp.nextPageButton).toBeDisabled();
      await expect(cvp.lastPageButton).toBeDisabled();
    }
  });
});

// Navigation from the customer list is validated in its own (small) block so
// the content tests below can navigate directly to the account page — this
// avoids repeatedly hitting the flaky customer-list endpoint from every test.
test.describe('Customer Value Portal — Account navigation (reused session)', () => {
  test.describe.configure({ mode: 'default' });

  let cvp: CustomerValuePortalPage;
  let account: CustomerAccountPage;

  test.beforeEach(async ({ page }) => {
    test.skip(
      !process.env.EMAIL || !process.env.PASSWORD,
      'EMAIL and PASSWORD must be set (via the environment)',
    );
    cvp = new CustomerValuePortalPage(page);
    account = new CustomerAccountPage(page);
    await cvp.goto();
    await cvp.ensureCustomersLoaded();
  });

  test('should open the account page when a customer row is clicked', async ({ page }) => {
    const name = await cvp.openCustomer(0);
    await expect(page).toHaveURL(/\/customer-value-portal\/account\?id=\d+/);
    await expect(account.heading).toHaveText(name);
    await expect(account.customerId).toContainText(/ID:\s*\d+/);
    await expect(account.customersLink).toHaveAttribute('href', '/customer-value-portal');
  });

  test('should navigate back to the portal via the breadcrumb', async ({ page }) => {
    await cvp.openCustomer(0);
    await account.customersLink.click();
    await expect(page).toHaveURL(/\/customer-value-portal(\?|$)/);
    await expect(cvp.heading).toBeVisible();
  });
});

// Demo customers whose account pages the detail suite runs against. Add more
// { id, name } entries to extend coverage.
const ACCOUNTS = [
  { id: '0009623781', name: 'Inflexion Buyout V Investments LP' },
];

// The detail assertions are read-only, so for each customer they run serially
// against a single page loaded once in beforeAll. This avoids re-navigating
// (and re-triggering the intermittent empty-<main> render) for every test, and
// is far gentler on the staging backend.
for (const customer of ACCOUNTS) {
  test.describe(`Customer Value Portal — Account detail: ${customer.name}`, () => {
    test.describe.configure({ mode: 'serial' });

    let context: import('@playwright/test').BrowserContext | undefined;
    let account: CustomerAccountPage;

    test.beforeAll(async ({ browser }) => {
      if (!process.env.EMAIL || !process.env.PASSWORD) return; // tests skip below
      test.setTimeout(120000); // account view can need several reloads to mount
      context = await browser.newContext({ storageState: AUTH_FILE });
      const page = await context.newPage();
      account = new CustomerAccountPage(page);
      await account.goto(customer.id);
    });

    test.afterAll(async () => {
      await context?.close();
    });

    test.beforeEach(() => {
      test.skip(
        !process.env.EMAIL || !process.env.PASSWORD,
        'EMAIL and PASSWORD must be set (via the environment)',
      );
    });

    test('should show the account header with the customer name and ID', async () => {
      await expect(account.page).toHaveURL(new RegExp(`/customer-value-portal/account\\?id=${customer.id}`));
      await expect(account.heading).toHaveText(customer.name);
      await expect(account.customerId).toContainText(/ID:\s*\d+/);
      await expect(account.customersLink).toHaveAttribute('href', '/customer-value-portal');
    });

    test('should render the four KPI cards with their titles', async () => {
      await expect(account.kpiCards).toHaveCount(4);
      for (const title of CustomerAccountPage.KPI_TITLES) {
        await expect(account.kpiCard(title)).toBeVisible();
      }
    });

    test('should render the Sales Channel Overview table', async () => {
      await expect(account.salesChannelSection).toBeVisible({ timeout: 20000 });
      for (const col of ['Sales Channel', 'ACR', 'Licensing Rev', 'Next Renewal Date', 'Majority Seat Renewal']) {
        await expect(account.salesChannelTable).toContainText(col);
      }
      // At least one channel row is listed, and the collapse toggle is available.
      await expect(account.salesChannelTable.locator('tbody tr').first()).toBeVisible();
      await expect(account.salesChannelToggle).toBeVisible();
    });

    test('should show the Insight Account Team members with roles', async () => {
      await expect(account.accountTeamCard).toBeVisible({ timeout: 20000 });
      await expect(account.accountTeamCard).toContainText('Insight Account Team');
      // At least one team member with a recognised role is listed.
      await expect(account.accountTeamCard).toContainText(/Account Owner|Customer Success Manager/);
    });

    test('should render the account tab strip with Opportunities active by default', async () => {
      for (const name of CustomerAccountPage.TAB_NAMES) {
        await expect(account.tab(name)).toBeVisible();
      }
      expect(await account.isTabActive('Opportunities')).toBe(true);
    });

    test('Opportunities tab should list opportunities with a Coach Me action', async () => {
      await account.openTab('Opportunities');
      await expect(account.opportunities).toBeVisible({ timeout: 20000 });

      const count = await account.opportunityCards.count();
      expect(count).toBeGreaterThan(0);

      for (let i = 0; i < count; i++) {
        const card = account.opportunityCards.nth(i);
        await expect(card.getByRole('heading')).toBeVisible();
        await expect(card.locator('p')).not.toBeEmpty();
        await expect(card.getByRole('button', { name: 'Coach Me' })).toBeVisible();
      }
    });

    test('Expansion Plan tab should show expansion recommendations', async () => {
      await account.openTab('Expansion Plan');
      // The panel loads a skeleton first, then the list — either confirms the
      // tab switched. Then wait for the loaded list and check its items.
      await expect(account.expansionPlanArea.first()).toBeVisible({ timeout: 20000 });
      await expect(account.expansionPlanList).toBeVisible({ timeout: 30000 });

      const items = account.expansionPlanList.locator(':scope > div');
      expect(await items.count()).toBeGreaterThan(0);
      await expect(account.expansionPlanList.getByRole('heading').first()).toBeVisible();
      await expect(account.expansionPlanList.getByRole('button', { name: 'Coach Me' }).first()).toBeVisible();
    });

    test('Account Roadmap tab should show the roadmap sections', async () => {
      await account.openTab('Account Roadmap');
      await expect(account.accountRoadmap).toBeVisible({ timeout: 20000 });
      await expect(account.accountRoadmap.getByRole('heading', { name: 'Account Roadmap' })).toBeVisible();
      await expect(account.accountRoadmap.getByRole('button', { name: 'Upload Materials' })).toBeVisible();

      // All four context accordion sections are present.
      await expect(account.roadmapSections).toHaveCount(CustomerAccountPage.ROADMAP_SECTIONS.length);
      for (const section of CustomerAccountPage.ROADMAP_SECTIONS) {
        await expect(account.roadmapSection(section)).toBeVisible();
        await expect(account.roadmapSection(section).getByText(section, { exact: true })).toBeVisible();
      }

      await expect(account.accountRoadmap.getByRole('button', { name: 'Coach Me' })).toBeVisible();
    });

    test('Account Roadmap sections should expand when opened', async () => {
      await account.openTab('Account Roadmap');
      await expect(account.accountRoadmap).toBeVisible({ timeout: 20000 });

      // Each section is collapsed initially and reveals its content on click.
      for (const section of CustomerAccountPage.ROADMAP_SECTIONS) {
        await account.expandRoadmapSection(section);
      }
    });

    test('Microsoft Deep Dive tab should show the estate sections', async () => {
      await account.openTab('Microsoft Deep Dive');
      await expect(account.deepDiveTenant).toBeVisible({ timeout: 20000 });
      // The Deep Dive is organised into fixed estate sections.
      for (const section of [
        'Estate footprint',
        'Top insights',
        'End-user products',
        'Azure services consumption',
        'On-prem & hybrid',
        'Eligible funded workshops',
      ]) {
        await expect(account.page.getByRole('heading', { name: section })).toBeVisible();
      }
    });

    test('should change the selected account currency', async () => {
      // Monetary values on this page are frequently "N/A"/"No agreement data"
      // for the demo customer, so we assert the currency selector itself
      // updates rather than a converted amount (which may not be present).
      await expect(account.currencySelect).toBeVisible({ timeout: 20000 });

      for (const code of ['USD', 'GBP', 'EUR']) {
        await account.selectCurrency(code);
        await expect(account.currencySelect).toHaveValue(code);
      }
    });
  });
}
