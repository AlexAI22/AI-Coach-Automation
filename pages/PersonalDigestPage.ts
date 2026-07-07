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
    this.refreshButton = page.getByRole('button', { name: 'Refresh Digest' });

    this.kpiCard = page.locator('[data-sentry-component="KpiCard"]');
    this.newsSection = page.locator('[data-sentry-component="NewsSection"]');
    this.newsItems = page.locator('[data-sentry-component="RelevantNewsItem"]');
    this.featuredNewsCount = this.newsSection.getByText(/\d+\s+articles?/);
    this.topStoryBadge = page.getByText('TOP STORY', { exact: true });

    this.talkingPointsSection = page.locator('[data-sentry-component="TalkingPointsSection"]');
    this.talkingPointItems = page.locator('[data-sentry-component="TalkingPointItem"]');
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

  /** The number shown in the "N articles" Featured News counter. */
  async articleCount(): Promise<number> {
    const text = (await this.featuredNewsCount.textContent()) ?? '';
    return Number(text.match(/\d+/)?.[0] ?? 'NaN');
  }
}
