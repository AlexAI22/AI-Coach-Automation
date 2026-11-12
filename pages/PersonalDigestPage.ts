import { Page, Locator, expect } from '@playwright/test';

/**
 * Personal Digest → Daily Digest page.
 *
 * Layout: a title/description header, an "About" info button, two tabs
 * (Daily Digest / Market Trends), KPI cards (Active Accounts, Tracked
 * Industries), a Refresh Digest button, a Featured News list and a Suggested
 * Talking Points list.
 */
export class PersonalDigestPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly description: Locator;
  readonly aboutButton: Locator;
  readonly dailyDigestTab: Locator;
  readonly marketTrendsTab: Locator;
  readonly refreshButton: Locator;

  readonly kpiCard: Locator;
  readonly newsSection: Locator;
  readonly newsItems: Locator;
  readonly featuredNewsCount: Locator;
  readonly topStoryBadge: Locator;

  readonly talkingPointsSection: Locator;
  readonly talkingPointItems: Locator;
  readonly copyButtons: Locator;

  /** First-run "Welcome to AI Coach" personalisation modal (app-wide). */
  readonly welcomeDialogHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Personal Digest', level: 1 });
    this.description = page.getByText('This digest surfaces curated research');
    this.aboutButton = page.getByRole('button', { name: 'About Personal Digest' });
    this.dailyDigestTab = page.getByRole('link', { name: 'Daily Digest' });
    this.marketTrendsTab = page.getByRole('link', { name: 'Market Trends' });
    // The button is RELABELLED while a refresh runs ("Refresh Digest" ->
    // "Refreshing…", disabled), so a name-only locator stops matching the
    // moment it is clicked. Match both labels so the same element is tracked
    // through the whole cycle.
    this.refreshButton = page.getByRole('button', { name: /^(Refresh Digest|Refreshing…)$/ });

    // `.last()` takes the innermost match, which is the strip holding both
    // KPIs rather than the page wrappers that also contain them.
    this.kpiCard = page
      .locator('div')
      .filter({ hasText: 'Active Accounts' })
      .filter({ hasText: 'Tracked Industries' })
      .last();
    // The section header alone also carries the title, so the section is
    // identified by the article list it wraps.
    this.newsSection = page
      .locator('div')
      .filter({ hasText: 'Featured News' })
      .filter({ has: page.getByText('TOP STORY', { exact: true }) })
      .last();
    this.newsItems = this.newsSection.locator(':scope > div').last().locator(':scope > div');
    this.featuredNewsCount = this.newsSection.getByText(/\d+\s+articles?/);
    this.topStoryBadge = page.getByText('TOP STORY', { exact: true });

    this.talkingPointsSection = page
      .locator('div')
      .filter({ hasText: 'Suggested Talking Points' })
      .filter({ has: page.getByRole('button', { name: 'Copy talking point' }) })
      .last();
    this.talkingPointItems = this.talkingPointsSection
      .locator(':scope > div')
      .last()
      .locator(':scope > div');
    this.copyButtons = page.getByRole('button', { name: 'Copy talking point' });

    this.welcomeDialogHeading = page.getByRole('heading', { name: 'Welcome to AI Coach', exact: true });
  }

  /** Navigate to the Daily Digest page. */
  async goto(): Promise<void> {
    await this.page.goto('/personal-digest/daily-digest', { waitUntil: 'domcontentloaded' });
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
   * Click "Refresh Digest" and wait for the regeneration to finish.
   *
   * MEASURED against staging (Nov 2026): the GET /sc/news_digest/refresh_news
   * request is held open for ~186s while the digest is regenerated, the
   * button reads "Refreshing…" (disabled) throughout, and it flips back to
   * "Refresh Digest" only once that request answers. The previous 180s wait
   * sat just under that, so the test failed every time. Waiting on the request
   * itself (rather than polling the button) also surfaces a backend error
   * as an HTTP status instead of a bare timeout.
   */
  async refreshDigest(timeout = 300000): Promise<void> {
    const refreshed = this.page.waitForResponse(
      (r) => r.url().includes('/sc/news_digest/refresh_news'),
      { timeout },
    );
    await this.refreshButton.click();
    const response = await refreshed;
    // A 504 here is a PRODUCT issue, not a test one: refresh_news is a single
    // synchronous request that runs for ~3-4 min, and when regeneration takes
    // longer than the gateway allows (~240s observed) the gateway cuts it off.
    expect(
      response.status(),
      `GET /sc/news_digest/refresh_news returned HTTP ${response.status()}` +
        (response.status() === 504
          ? ' (gateway timeout: the digest regeneration ran longer than the gateway allows)'
          : ''),
    ).toBeLessThan(400);
    await expect(this.refreshButton).toHaveText('Refresh Digest', { timeout: 30000 });
    await expect(this.refreshButton).toBeEnabled();
  }

  /** The number shown in the "N articles" Featured News counter. */
  async articleCount(): Promise<number> {
    const text = (await this.featuredNewsCount.textContent()) ?? '';
    return Number(text.match(/\d+/)?.[0] ?? 'NaN');
  }
}
