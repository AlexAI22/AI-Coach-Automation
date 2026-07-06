import { Page, Locator, expect } from '@playwright/test';

/**
 * Authenticated AI Coach app shell, focused on the Sales Coach page
 * (the default landing route after login: /sales-coach).
 */
export class SalesCoachPage {
  readonly page: Page;
  /**
   * Insight logo in the top-left of the authenticated app shell.
   * Targets the dark-mode variant (Logo.tsx): alt="Insight logo" with the
   * dark-mode PNG. It carries `class="hidden dark:block"`, so it is present in
   * the DOM but only display-visible under a dark color scheme.
   */
  readonly insightLogo: Locator;
  /**
   * First-run "Welcome to AI Coach" personalisation onboarding modal shown
   * after login. Heading is level 2; the landing page has a separate
   * "Welcome to Sales Coach" heading, so this one is distinct.
   */
  readonly welcomeDialogHeading: Locator;
  /** Intro paragraph of the personalisation modal. */
  readonly welcomeDialogBody: Locator;
  /** "Skip for now" dismiss button on the personalisation modal. */
  readonly closeWelcomeButton: Locator;
  /** Left-nav link to the Sales Coach page. */
  readonly navLink: Locator;
  /**
   * Sales Coach page-header title. Scoped to the page-header (there is also a
   * "Sales Coach" <h1> in the sidebar), so this uniquely identifies the header.
   */
  readonly heading: Locator;
  /** Empty-state landing shown on Sales Coach (WelcomeLanding component). */
  readonly welcomeLanding: Locator;
  /** "Get Started" CTA inside the Create New Project card. */
  readonly getStartedLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.insightLogo = page.locator('img[alt="Insight logo"][src*="dark_mode"]');
    this.welcomeDialogHeading = page.getByRole('heading', { name: 'Welcome to AI Coach', exact: true });
    this.welcomeDialogBody = page.getByText('personalise your experience. It only takes a minute');
    this.closeWelcomeButton = page.getByRole('button', { name: 'Skip for now' });
    this.navLink = page.getByRole('link', { name: 'Sales Coach', exact: true });
    this.heading = page.getByTestId('page-header-title');
    this.welcomeLanding = page.locator('[data-sentry-component="WelcomeLanding"]');
    this.getStartedLink = page.getByRole('link', { name: 'Get Started' });
  }

  /**
   * Closes the first-run "Welcome to AI Coach" personalisation modal. The modal
   * renders shortly after navigation and overlays the app (intercepting clicks),
   * so it must be dismissed before interacting with the page. If it never
   * appears this session, do nothing.
   */
  async dismissWelcomeDialog(): Promise<void> {
    try {
      await this.welcomeDialogHeading.waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      return; // modal did not appear this session
    }
    // Prefer the explicit "Skip for now" action; fall back to the "Close modal" X.
    if (await this.closeWelcomeButton.isVisible().catch(() => false)) {
      await this.closeWelcomeButton.click();
    } else {
      await this.page.getByRole('button', { name: 'Close modal' }).click();
    }
    await expect(this.welcomeDialogHeading).toBeHidden();
  }

  /** Navigates to the Sales Coach page via the left-nav link. */
  async open(): Promise<void> {
    await this.navLink.click();
  }

  /** Asserts the Sales Coach page is loaded. */
  async isLoaded(): Promise<void> {
    await expect(this.page).toHaveURL(/\/sales-coach/);
    await expect(this.heading).toBeVisible();
  }

  /** Sidebar link for a project, located by its name. */
  projectLink(name: string): Locator {
    return this.page.getByRole('link', { name: new RegExp(name, 'i') });
  }

  /** Opens a project from the sidebar and waits for the project view to load. */
  async selectProject(name: string): Promise<void> {
    await this.projectLink(name).click();
    await expect(this.page).toHaveURL(/\/sales-coach\/project/);
  }

  /** Sidebar folder (ProjectListItem) for a project, located by name. */
  projectFolder(name: string): Locator {
    return this.page
      .locator('[data-sentry-component="ProjectListItem"]')
      .filter({ hasText: name });
  }

  /** A chat link nested inside a project's sidebar folder (folder must be expanded). */
  chatInProject(projectName: string, chatName: string): Locator {
    return this.projectFolder(projectName).getByRole('link', { name: chatName });
  }
}
