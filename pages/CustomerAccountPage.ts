import { Page, Locator, expect } from '@playwright/test';

/**
 * Customer account detail page
 * (https://.../customer-value-portal/account?ggp_id=<id>).
 *
 * Reached by clicking a customer row on the Customer Value Portal. Layout: a
 * breadcrumb + title header with a currency <select>, four KPI cards, a
 * collapsible "Sales Channel Overview" table, "Insight Account Team" and "Key
 * Customer Contacts" cards, and a tab strip (Opportunities / Expansion Plan /
 * Account Roadmap / Microsoft Deep Dive) whose Opportunities tab lists
 * opportunity cards with a "Coach Me" action.
 */
export class CustomerAccountPage {
  readonly page: Page;

  readonly root: Locator;
  readonly accountTitle: Locator;
  readonly customersLink: Locator;
  readonly heading: Locator;
  readonly customerId: Locator;
  readonly currencySelect: Locator;

  readonly kpiCards: Locator;

  readonly salesChannelSection: Locator;
  readonly salesChannelToggle: Locator;
  readonly salesChannelTable: Locator;

  readonly teamCards: Locator;
  readonly accountTeamCard: Locator;
  readonly keyContactsCard: Locator;

  readonly tabs: Locator;
  readonly opportunities: Locator;
  readonly opportunityCards: Locator;
  readonly coachMeButtons: Locator;

  // Per-tab panel content.
  readonly expansionPlanList: Locator;
  readonly expansionPlanArea: Locator;
  readonly accountRoadmap: Locator;
  readonly roadmapSections: Locator;
  readonly deepDiveTenant: Locator;

  /** The Account Roadmap accordion section titles, in render order. */
  static readonly ROADMAP_SECTIONS = [
    'Client Context',
    'Insight and Client Relationship',
    'Customer Personas',
    'Technology Landscape',
  ];

  /** The four KPI card titles, in render order. */
  static readonly KPI_TITLES = [
    'Total L12M ACR',
    'Annual Microsoft Licensing Revenue',
    'L12M Booked Insight-Delivered Services Revenue',
    'Renewal Dates',
  ];

  /** The tab strip labels, in render order. */
  static readonly TAB_NAMES = [
    'Opportunities',
    'Expansion Plan',
    'Account Roadmap',
    'Microsoft Deep Dive',
  ];

  /** Currency code -> symbol shown in the value cells. */
  static readonly CURRENCY_SYMBOL: Record<string, string> = {
    GBP: '£',
    USD: '$',
    EUR: '€',
  };

  constructor(page: Page) {
    this.page = page;
    this.root = page.locator('[data-sentry-component="AccountPage"]');
    this.accountTitle = page.locator('[data-sentry-component="AccountTitle"]');
    this.customersLink = this.accountTitle.getByRole('link', { name: 'Customers' });
    this.heading = this.accountTitle.getByRole('heading', { level: 1 });
    // The id label is "Customer ID:" or "GGP ID:" depending on how the page
    // was reached, so match either.
    this.customerId = this.accountTitle.getByText(/ID:\s*\d+/);
    this.currencySelect = page.locator('[data-sentry-component="CurrencySelect"] select');

    this.kpiCards = page.locator('[data-sentry-component="KpiCard"]');

    this.salesChannelSection = page.locator('[data-sentry-component="SalesChannelOverview"]');
    this.salesChannelToggle = this.salesChannelSection.getByRole('button', { name: 'Sales Channel Overview' });
    this.salesChannelTable = this.salesChannelSection.locator('table');

    this.teamCards = page.locator('[data-sentry-component="TeamCard"]');
    this.accountTeamCard = this.teamCards.filter({ hasText: 'Insight Account Team' });
    this.keyContactsCard = this.teamCards.filter({ hasText: 'Key Customer Contacts' });

    this.tabs = page.locator('[data-sentry-component="Tabs"]');
    this.opportunities = page.locator('[data-sentry-component="Opportunities"]');
    // Each opportunity is a direct child card of the Opportunities container.
    this.opportunityCards = this.opportunities.locator(':scope > div');
    this.coachMeButtons = this.opportunities.getByRole('button', { name: 'Coach Me' });

    this.expansionPlanList = page.locator('[data-sentry-component="ExpansionPlanList"]');
    // Loading (skeleton) or loaded list — either proves the panel switched.
    this.expansionPlanArea = page.locator('[data-sentry-component^="ExpansionPlan"]');
    this.accountRoadmap = page.locator('[data-sentry-component="AccountRoadmap"]');
    this.roadmapSections = this.accountRoadmap.locator('[data-sentry-component="AccordionSection"]');
    this.deepDiveTenant = page.locator('[data-sentry-component="TenantDropdown"]');
  }

  /** An Account Roadmap accordion section located by its title. */
  roadmapSection(title: string): Locator {
    return this.roadmapSections.filter({ hasText: title });
  }

  /**
   * Expand an Account Roadmap accordion section and wait until it opens (its
   * height grows well beyond the collapsed header).
   */
  async expandRoadmapSection(title: string): Promise<void> {
    const section = this.roadmapSection(title);
    const collapsed = (await section.boundingBox())?.height ?? 0;
    await section.getByRole('button').first().click();
    // Even a near-empty ("No data available") section grows past its collapsed
    // header height, so assert growth rather than an absolute size.
    await expect
      .poll(async () => (await section.boundingBox())?.height ?? 0, { timeout: 10000 })
      .toBeGreaterThan(collapsed + 20);
  }

  /** Click a tab and wait until it becomes the active tab. */
  async openTab(name: string): Promise<void> {
    await this.tab(name).click();
    await expect
      .poll(async () => this.isTabActive(name), { timeout: 10000 })
      .toBe(true);
  }

  /**
   * Navigate directly to a customer's account page. The app addresses accounts
   * by `id` + `id_type=SourceGGP` (not `ggp_id`). Defaults to the stable demo
   * customer (Inflexion Buyout V Investments LP).
   */
  async goto(id = '0009623781'): Promise<void> {
    const url = `/customer-value-portal/account?id=${id}&id_type=SourceGGP`;
    // The account view intermittently mounts an empty <main> (hydration/data
    // race), so reload until the header renders. A short pause between reloads
    // eases the intermittent staging throttling.
    for (let attempt = 0; attempt < 6; attempt++) {
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      await this.dismissWelcomeDialog();
      if (await this.heading.isVisible({ timeout: 8000 }).catch(() => false)) {
        return;
      }
      await this.page.waitForTimeout(1000);
    }
    await this.heading.waitFor({ state: 'visible', timeout: 15000 });
  }

  /** Dismiss the first-run "Welcome to AI Coach" modal if it appears. */
  async dismissWelcomeDialog(): Promise<void> {
    const welcome = this.page.getByRole('heading', { name: 'Welcome to AI Coach', exact: true });
    try {
      await welcome.waitFor({ state: 'visible', timeout: 8000 });
    } catch {
      return;
    }
    const skip = this.page.getByRole('button', { name: 'Skip for now' });
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
    } else {
      await this.page.getByRole('button', { name: 'Close modal' }).click();
    }
    await welcome.waitFor({ state: 'hidden' });
  }

  /** A KPI card located by its title text. */
  kpiCard(title: string): Locator {
    return this.kpiCards.filter({ hasText: title });
  }

  /** A tab button located by its label. */
  tab(name: string): Locator {
    return this.tabs.getByRole('button', { name });
  }

  /** Whether the given tab button is the active one (rose underline accent). */
  async isTabActive(name: string): Promise<boolean> {
    const cls = (await this.tab(name).getAttribute('class')) ?? '';
    return /border-rose-600/.test(cls);
  }

  /** Select a display currency by its code (GBP/USD/EUR). */
  async selectCurrency(code: string): Promise<void> {
    await this.currencySelect.selectOption(code);
  }
}
