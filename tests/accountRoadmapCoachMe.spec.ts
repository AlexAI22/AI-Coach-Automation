import { test, expect } from './support/fixtures';
import { CustomerAccountPage } from '../pages/CustomerAccountPage';
import { CoachMeModalPage } from '../pages/CoachMeModalPage';
import { watchHttpErrors } from './support/httpErrors';
import { hasCredentials } from '../support/credentials';

/**
 * Account Roadmap — Coach Me suggested question prompts.
 *
 * Flow under test: customer account page -> the Account Roadmap tab -> the
 * single "Coach Me" button below the context accordions -> the "Account Roadmap
 * Coach" modal -> its "Suggested Questions" panel.
 *
 * SCOPE: the tab's static copy (heading, intro, context accordions, Coach Me
 * call-to-action, Client Roadmap upload area) asserted verbatim, plus the
 * prompt TEXT of the modal. No prompt is clicked, so no AI run is triggered.
 *
 * This is the third Coach Me variant in the app and each one differs:
 *   Opportunities   "AI Coach — <opportunity>"        7 prompts, has a context banner
 *   Expansion Plan  "Expansion Coach — <plan>"        4 prompts, no context banner
 *   Account Roadmap "Account Roadmap Coach"           8 prompts, no context banner
 * Note this modal's title carries NO trailing subject at all.
 */

const CUSTOMER = { id: '0009623781', region: 'EMEA', name: 'Inflexion Buyout V Investments LP' };
const EXPECTED_PROMPTS = CoachMeModalPage.ROADMAP_QUESTIONS;
const MODAL_TITLE = 'Account Roadmap Coach';

/** Static (non-AI) copy of the Account Roadmap tab — asserted verbatim. */
const ROADMAP_TEXT = {
  heading: 'Account Roadmap',
  intro: 'Review the context below, then use Coach Me to prepare your pitch',
  introEmphasis: 'Coach Me',
  coachMeLead: 'Prep your roadmap conversation — what to cover, what to expect, and how to get buy-in',
  coachMeButton: 'Coach Me',
  clientRoadmapHeading: 'Client Roadmap',
  clientRoadmapDescription: "Upload the client's strategic roadmap to auto-generate opportunities.",
  dropzoneTitle: 'Drop roadmap file here or click to browse',
  dropzoneHint: 'Supports .xlsx',
  acceptedFileTypes: '.xlsx',
};

// The assertions are read-only, so they run serially against one modal opened
// in the first test rather than re-navigating for each.
test.describe(`Account Roadmap Coach Me prompts — ${CUSTOMER.name}`, () => {
  test.describe.configure({ mode: 'serial' });

  let account: CustomerAccountPage;
  let coach: CoachMeModalPage;

  test.beforeAll(async ({ sharedPage }) => {
    if (!hasCredentials()) return; // tests skip below
    test.setTimeout(180000);
    account = new CustomerAccountPage(sharedPage);
    coach = new CoachMeModalPage(sharedPage);
    await account.goto(CUSTOMER.id, CUSTOMER.region);
    await account.openAccountRoadmapTab();
  });

  test.beforeEach(() => {
    test.skip(
      !hasCredentials(),
      'Credentials must be set (AICoach_MICROSOFT_EMAIL/AICoach_MICROSOFT_PASSWORD or EMAIL/PASSWORD)',
    );
  });

  test('should show the Account Roadmap tab with a single Coach Me entry point', async ({ page }) => {
    const httpErrors = watchHttpErrors(page);

    await expect(account.accountRoadmap.getByRole('heading', { name: 'Account Roadmap' })).toBeVisible();
    await expect(account.accountRoadmap.getByText(ROADMAP_TEXT.intro, { exact: true })).toBeVisible();

    // The four context accordions the coach draws on.
    await expect(account.roadmapSections).toHaveCount(CustomerAccountPage.ROADMAP_SECTIONS.length);
    for (const section of CustomerAccountPage.ROADMAP_SECTIONS) {
      await expect(account.roadmapSection(section)).toBeVisible();
    }

    // Exactly one Coach Me for the whole tab (unlike Expansion Plan's one per card).
    await expect(account.accountRoadmapCoachMeButton).toHaveCount(1);
    await expect(account.accountRoadmapCoachMeButton).toBeEnabled();

    expect(httpErrors, `Unexpected HTTP errors: ${JSON.stringify(httpErrors, null, 2)}`).toEqual([]);
  });

  test('should display the heading and intro text verbatim', async () => {
    const roadmap = account.accountRoadmap;
    await expect(roadmap.getByRole('heading', { level: 1 })).toHaveText(ROADMAP_TEXT.heading);
    const intro = roadmap.getByText(ROADMAP_TEXT.intro, { exact: true });
    await expect(intro).toHaveText(ROADMAP_TEXT.intro);
    // "Coach Me" is emphasised inside the sentence.
    await expect(intro.locator('span', { hasText: ROADMAP_TEXT.introEmphasis })).toHaveText(
      ROADMAP_TEXT.introEmphasis,
    );
  });

  test('should list the context accordions verbatim, in order, all collapsed', async () => {
    const headers = account.roadmapSections.getByRole('button');
    await expect(headers).toHaveText(CustomerAccountPage.ROADMAP_SECTIONS);
    for (const section of CustomerAccountPage.ROADMAP_SECTIONS) {
      await test.step(section, async () => {
        const header = account.roadmapSection(section).getByRole('button').first();
        await expect(header).toBeEnabled();
        // Collapsed: the section is just its header, no expanded body.
        await expect(account.roadmapSection(section).locator(':scope > *')).toHaveCount(1);
      });
    }
  });

  test('should display the Coach Me call-to-action text verbatim', async () => {
    const roadmap = account.accountRoadmap;
    // The lead text has a <br>; innerText turns it into whitespace, which
    // toHaveText normalises to a single space.
    await expect(roadmap.locator('p', { hasText: 'Prep your roadmap conversation' })).toHaveText(
      ROADMAP_TEXT.coachMeLead,
      { useInnerText: true },
    );
    await expect(account.accountRoadmapCoachMeButton).toHaveText(ROADMAP_TEXT.coachMeButton);
    await expect(account.accountRoadmapCoachMeButton).toBeEnabled();
  });

  test('should display the Client Roadmap upload area text verbatim', async () => {
    const roadmap = account.accountRoadmap;
    await expect(roadmap.getByRole('heading', { level: 2, name: ROADMAP_TEXT.clientRoadmapHeading, exact: true }))
      .toBeVisible();
    await expect(roadmap.getByText(ROADMAP_TEXT.clientRoadmapDescription, { exact: true })).toBeVisible();

    const dropzone = roadmap.getByRole('button', { name: new RegExp(`^${ROADMAP_TEXT.dropzoneTitle}`) });
    await expect(dropzone).toHaveCount(1);
    await expect(dropzone.getByText(ROADMAP_TEXT.dropzoneTitle, { exact: true })).toBeVisible();
    await expect(dropzone.getByText(ROADMAP_TEXT.dropzoneHint, { exact: true })).toBeVisible();
    // The hidden file input only accepts .xlsx.
    await expect(dropzone.locator('input[type="file"]')).toHaveAttribute('accept', ROADMAP_TEXT.acceptedFileTypes);
  });

  test(`should open the "${MODAL_TITLE}" modal from the Coach Me button`, async () => {
    await account.openRoadmapCoachMe();
    await coach.waitForOpen();

    // This modal is titled for the section, with no opportunity/plan suffix.
    await expect(coach.title).toHaveText(MODAL_TITLE);
  });

  test('should display the Suggested Questions panel with its header', async () => {
    await expect(coach.suggestedQuestions).toBeVisible();
    await expect(coach.suggestedQuestionsHeader).toBeVisible();
    // The panel's collapse control: a disclosure header carrying aria-expanded.
    // It replaced the "Close suggested questions" X the app removed in Aug 2026.
    await expect(coach.suggestedQuestionsDisclosure).toBeVisible();
  });

  test(`should display exactly ${EXPECTED_PROMPTS.length} suggested question prompts`, async () => {
    await expect(coach.prompts).toHaveCount(EXPECTED_PROMPTS.length);
  });

  test('should display every suggested question prompt verbatim and in order', async () => {
    // toHaveText with an array asserts text, count AND order in one pass, so a
    // reworded, reordered, added or dropped prompt all fail here.
    await expect(coach.prompts).toHaveText(EXPECTED_PROMPTS);
  });

  // One case per prompt so a single reworded question is reported by name.
  for (const [index, promptText] of EXPECTED_PROMPTS.entries()) {
    test(`should display prompt ${index + 1}: "${promptText}"`, async () => {
      const prompt = coach.prompt(promptText);
      // The panel scrolls, so later prompts sit outside the viewport. They are
      // still rendered (non-empty box), which is what toBeVisible checks.
      await expect(prompt).toBeVisible();
      await expect(prompt).toBeEnabled();
    });
  }

  test('should render no empty and no duplicate prompts', async () => {
    const texts = await coach.promptTexts();
    expect(texts.filter((t) => t.length === 0)).toEqual([]);
    expect(new Set(texts).size, `Duplicate prompts: ${JSON.stringify(texts)}`).toBe(texts.length);
  });

  test('should offer a custom question box alongside the suggested prompts', async () => {
    await expect(coach.questionInput).toBeVisible();
    await expect(coach.questionField).toBeVisible();
    await expect(coach.askButton).toBeDisabled();
  });

  // State-changing cases last so they cannot disturb the assertions above.
  test('should hide the prompts when the panel is collapsed and restore them when reopened', async () => {
    await coach.collapseSuggestedQuestions();
    await coach.expandSuggestedQuestions();
    await expect(coach.prompts).toHaveText(EXPECTED_PROMPTS);
  });

  test('should display the same prompts after the modal is closed and reopened', async () => {
    await coach.close();
    await account.openRoadmapCoachMe();
    await coach.waitForOpen();
    await expect(coach.prompts).toHaveText(EXPECTED_PROMPTS);
  });
});
