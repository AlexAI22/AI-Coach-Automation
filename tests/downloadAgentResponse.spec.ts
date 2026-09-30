import fs from 'fs';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './support/fixtures';
import { SalesCoachPage } from '../pages/SalesCoachPage';
import { hasCredentials } from '../support/credentials';

/**
 * "Download response" control, exercised on EVERY agent chat of a project.
 *
 * Flow under test: log in -> Sales Coach -> the "Tesla - Q4 2026 Account Plan"
 * project -> each of its agent chats -> the header's "Download response" action
 * -> the backend must answer HTTP 200 and the browser must receive a real .docx.
 *
 * Read-only by design: it opens chats that already hold a finished response
 * instead of creating them, so no AI run is triggered and each case costs
 * seconds rather than the minutes a fresh agent run takes (sales-coach.spec.ts).
 *
 * The download is built in the browser from a blob, so the file alone cannot
 * tell you why an export broke — the status of the POST behind it can. Any
 * non-200 (500, 4xx, ...) fails the case immediately with that status in the
 * message, instead of waiting out a download event that is never coming.
 *
 * LOGIN: `page` comes from tests/support/fixtures.ts — the single browser window
 * the whole run shares, logged in ONCE (reusing playwright/.auth/user.json while
 * that saved session is still valid). The credentials must be set in the shell
 * that STARTS the run, or these tests skip:
 *   $env:AICoach_MICROSOFT_EMAIL / $env:AICoach_MICROSOFT_PASSWORD
 *
 * Point the suite at a different project with PROJECT_NAME.
 */
const PROJECT_NAME = process.env.PROJECT_NAME ?? 'Tesla - Q4 2026 Account Plan';

/** Every agent chat in the project, in sidebar order. */
const AGENT_CHATS = [
  'Customer Profile Tesla',
  'Deal Plan Tesla',
  'Account Plan Tesla',
  'Call Plan Tesla',
  'Pricing Strategy Tesla',
  'RFx Responder Tesla',
  'Upsell & Cross Sell Tesla',
];

/** The request the Download response button fires; its body becomes the blob. */
const DOWNLOAD_ENDPOINT = '/sc/download/';
const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// The response streams in on a slow staging backend, so the header actions can
// take well over a minute to render.
const RESPONSE_READY_TIMEOUT = 90000;
const DOWNLOAD_TIMEOUT = 60000;

test.describe(`Sales Coach — download agent response (${PROJECT_NAME})`, () => {
  // Default mode so one broken agent export does not skip the remaining ones —
  // the point of the suite is to report every agent's status in a single run.
  test.describe.configure({ mode: 'default' });

  let salesCoach: SalesCoachPage;
  let downloadButton: Locator;

  test.beforeEach(async ({ page }) => {
    test.skip(
      !hasCredentials(),
      'Credentials must be set (AICoach_MICROSOFT_EMAIL/AICoach_MICROSOFT_PASSWORD or EMAIL/PASSWORD)',
    );
    test.setTimeout(240000);

    salesCoach = new SalesCoachPage(page);
    // The control is icon-only, so it is found by aria-label. Not getByRole:
    // its tooltip wrapper <span> also carries role="button" with the same name.
    downloadButton = page.locator('button[aria-label="Download response"]');
  });

  /**
   * Opens a chat from the project's sidebar folder, re-entering the project
   * first when the folder is not already expanded (e.g. the first case of the
   * run, or after a previous case navigated away).
   */
  async function openChat(page: Page, chatName: string): Promise<void> {
    // `.first()` because the project page lists the same conversation
    // alongside the sidebar entry.
    const chat = salesCoach.chatInProject(PROJECT_NAME, chatName).first();
    if (!(await chat.isVisible().catch(() => false))) {
      await page.goto('/sales-coach', { waitUntil: 'domcontentloaded' });
      await salesCoach.dismissWelcomeDialog();
      await salesCoach.selectProject(PROJECT_NAME);
    }
    await expect(chat).toBeVisible({ timeout: 30000 });
    await chat.click();
    // The chat opens on its stored response, not on the draft form.
    await expect(page).toHaveURL(/\/sales-coach\/project\/chat\?[^#]*chat_id=/, { timeout: 30000 });
  }

  test(`should reach the ${PROJECT_NAME} project logged in, with all its agent chats`, async ({
    page,
  }) => {
    // Logged in already (the fixture authenticates the shared window once per
    // run), so the app shell renders instead of the PropelAuth login form.
    await page.goto('/sales-coach', { waitUntil: 'domcontentloaded' });
    await expect(salesCoach.insightLogo).toBeAttached({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Log in with email' })).toHaveCount(0);

    await salesCoach.dismissWelcomeDialog();
    await salesCoach.selectProject(PROJECT_NAME);

    for (const chatName of AGENT_CHATS) {
      await expect(
        salesCoach.chatInProject(PROJECT_NAME, chatName).first(),
        `"${chatName}" is missing from the ${PROJECT_NAME} sidebar folder`,
      ).toBeVisible({ timeout: 30000 });
    }
  });

  // One case per agent, so a single broken export is reported by agent name
  // rather than hidden behind one failing loop.
  for (const chatName of AGENT_CHATS) {
    test(`should download the ${chatName} response as a .docx (HTTP 200)`, async (
      { page },
      testInfo,
    ) => {
      await openChat(page, chatName);

      await expect(downloadButton).toBeVisible({ timeout: RESPONSE_READY_TIMEOUT });
      // Enabled only once there is a response to export (the app disables it otherwise).
      await expect(downloadButton).toBeEnabled();

      // Both waiters are armed BEFORE the click so neither can be missed. The
      // download is swallowed here and re-thrown below: on a failed export it
      // never fires, and the status assertion must be the one that reports it.
      const downloadResponse = page.waitForResponse(
        (res) => res.url().includes(DOWNLOAD_ENDPOINT) && res.request().method() === 'POST',
        { timeout: DOWNLOAD_TIMEOUT },
      );
      const downloadEvent = page
        .waitForEvent('download', { timeout: DOWNLOAD_TIMEOUT })
        .catch(() => null);

      // Clicking fires the export directly — no format picker or menu in between.
      await downloadButton.click();

      const response = await downloadResponse;
      // ANY non-success status fails the case here, with the status in the message.
      expect(
        response.status(),
        `POST ${DOWNLOAD_ENDPOINT} answered ${response.status()} ${response.statusText()} for "${chatName}" — the export failed server-side`,
      ).toBe(200);
      expect(response.headers()['content-type'], 'Export is not a Word document').toContain(
        DOCX_CONTENT_TYPE,
      );

      const download = await downloadEvent;
      if (!download) {
        throw new Error(
          `No file download was triggered for "${chatName}" even though ${DOWNLOAD_ENDPOINT} returned 200`,
        );
      }

      // A Word export named after the chat/response ids, e.g.
      // "43b32538-...-_d4151444-....docx".
      expect(download.suggestedFilename()).toMatch(/\.docx$/i);

      // Persist it next to the test's other artifacts so a failure is inspectable.
      const savedAs = testInfo.outputPath(download.suggestedFilename());
      await download.saveAs(savedAs);
      expect(await download.failure(), 'Download did not complete').toBeNull();

      const contents = fs.readFileSync(savedAs);
      expect(contents.byteLength, 'Downloaded document is empty').toBeGreaterThan(0);
      // .docx is an OOXML package — a ZIP, so it must start with the "PK" magic.
      // This catches an error page or JSON blob served under a .docx name.
      expect(contents.subarray(0, 2).toString('latin1'), 'Not a valid .docx (ZIP) file').toBe('PK');
    });
  }
});
