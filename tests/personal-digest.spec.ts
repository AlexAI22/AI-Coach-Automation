import { test, expect } from '@playwright/test';
import { PersonalDigestPage } from '../pages/PersonalDigestPage';
import { AUTH_FILE } from '../global-setup';
import { watchHttpErrors } from './support/httpErrors';

/**
 * Personal Digest → Daily Digest (https://.../personal-digest/daily-digest).
 *
 * Uses the reused authenticated session established once in global-setup.ts
 * (storageState). Tracing stays off because a reused session's requests/snapshots
 * can carry account context.
 *
 * Clipboard permissions are granted so the "Copy talking point" action can be
 * verified against the clipboard.
 */
test.use({
  trace: 'off',
  storageState: AUTH_FILE,
  permissions: ['clipboard-read', 'clipboard-write'],
});

test.describe('Personal Digest — Daily Digest (reused session)', () => {
  test.describe.configure({ mode: 'default' });

  let digest: PersonalDigestPage;

  test.beforeEach(async ({ page }) => {
    test.skip(
      !process.env.EMAIL || !process.env.PASSWORD,
      'EMAIL and PASSWORD must be set (via the environment)',
    );
    digest = new PersonalDigestPage(page);
    await digest.goto();
  });

  test('should load the Daily Digest page with header and tabs', async ({ page }) => {
    const httpErrors = watchHttpErrors(page);

    await expect(page).toHaveURL(/\/personal-digest\/daily-digest/);
    await expect(digest.heading).toBeVisible();
    await expect(digest.description).toBeVisible();

    // Both tabs are present and point at the right routes.
    await expect(digest.dailyDigestTab).toHaveAttribute('href', '/personal-digest/daily-digest');
    await expect(digest.marketTrendsTab).toHaveAttribute('href', '/personal-digest/market-trends');

    // The About info control is available.
    await expect(digest.aboutButton).toBeVisible();

    // No app HTTP 4xx/5xx while the page loads.
    expect(httpErrors, `Unexpected HTTP errors: ${JSON.stringify(httpErrors, null, 2)}`).toEqual([]);
  });

  test('should show the KPI summary cards', async () => {
    // KPI cards come from a separate data source that can lag the digest
    // content, so allow extra time.
    await expect(digest.kpiCard).toBeVisible({ timeout: 30000 });
    await expect(digest.kpiCard).toContainText('Active Accounts');
    await expect(digest.kpiCard).toContainText('Tracked Industries');
    // Each KPI shows a numeric value.
    await expect(digest.kpiCard).toContainText(/\d+/);
  });

  test('should render Featured News with a consistent article count and valid links', async () => {
    // News/Talking-Points sections load asynchronously after the shell.
    await expect(digest.newsSection).toBeVisible({ timeout: 20000 });
    await expect(digest.newsSection.getByText('Featured News')).toBeVisible();

    const items = digest.newsItems;
    const count = await items.count();
    expect(count).toBeGreaterThan(0);

    // The "N articles" counter matches the number of rendered items.
    expect(await digest.articleCount()).toBe(count);

    // Exactly one item is flagged as the TOP STORY.
    await expect(digest.topStoryBadge).toHaveCount(1);

    // Every news item has a relevance badge and a title link that opens the
    // source in a new tab.
    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      await expect(item.locator('[data-sentry-component="relevanceBadge"]')).toBeVisible();
      const link = item.getByRole('link').first();
      await expect(link).toHaveAttribute('href', /^https?:\/\//);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', /noopener/);
    }
  });

  test('should render Suggested Talking Points ranked with copy buttons', async () => {
    // The Talking Points section loads asynchronously (after Featured News).
    await expect(digest.talkingPointsSection).toBeVisible({ timeout: 20000 });
    await expect(digest.talkingPointsSection.getByText('Suggested Talking Points')).toBeVisible();

    const items = digest.talkingPointItems;
    const count = await items.count();
    expect(count).toBeGreaterThan(0);

    // Each item is ranked (#1, #2, …), has a title, a body, and a copy button.
    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      await expect(item.getByText(`#${i + 1}`, { exact: true })).toBeVisible();
      await expect(item.getByRole('heading')).toBeVisible();
      await expect(item.locator('p')).toBeVisible();
      await expect(item.getByRole('button', { name: 'Copy talking point' })).toBeVisible();
    }
  });

  test('should copy a talking point to the clipboard', async ({ page }) => {
    await digest.dismissWelcomeDialog();

    const firstPoint = digest.talkingPointItems.first();
    await expect(firstPoint).toBeVisible();
    await firstPoint.getByRole('button', { name: 'Copy talking point' }).click();

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard.trim().length).toBeGreaterThan(0);
  });

  test('should navigate to Market Trends and back to Daily Digest', async ({ page }) => {
    await digest.dismissWelcomeDialog();

    await digest.marketTrendsTab.click();
    await expect(page).toHaveURL(/\/personal-digest\/market-trends/);
    // Same Personal Digest layout/header persists across tabs.
    await expect(digest.heading).toBeVisible();

    await digest.dailyDigestTab.click();
    await expect(page).toHaveURL(/\/personal-digest\/daily-digest/);
    await expect(digest.newsSection).toBeVisible();
  });

  test('should refresh the digest without HTTP errors', async ({ page }) => {
    test.setTimeout(220000); // regenerating the digest can take a while
    const httpErrors = watchHttpErrors(page);

    await digest.dismissWelcomeDialog();
    await expect(digest.refreshButton).toBeEnabled();
    await digest.refreshButton.click();

    // The button disables while the digest regenerates (best-effort), then
    // becomes enabled again when it completes.
    await expect(digest.refreshButton).toBeDisabled({ timeout: 10000 }).catch(() => {});
    await expect(digest.refreshButton).toBeEnabled({ timeout: 180000 });

    // Content is still present after the refresh.
    await expect(digest.newsSection).toBeVisible();
    await expect(digest.newsItems.first()).toBeVisible();

    expect(httpErrors, `Unexpected HTTP errors: ${JSON.stringify(httpErrors, null, 2)}`).toEqual([]);
  });
});
