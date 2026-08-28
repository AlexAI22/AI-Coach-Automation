import { test, expect } from './support/fixtures';
import { CustomerAccountPage } from '../pages/CustomerAccountPage';
import { CoachMeModalPage } from '../pages/CoachMeModalPage';
import { watchHttpErrors } from './support/httpErrors';
import { hasCredentials } from '../support/credentials';

/**
 * Coach Me — suggested question prompts.
 *
 * Flow under test: Customer Value Portal -> customer account page -> the
 * Opportunities tab -> an opportunity's "Coach Me" button -> the AI Coach modal
 * -> its "Suggested Questions" panel.
 *
 * SCOPE: the prompts themselves — that the panel offers exactly the expected
 * questions, verbatim and in order. No prompt is clicked, so no AI run is
 * triggered and the suite stays fast and side-effect free.
 *
 * Runs in the single shared browser window from tests/support/fixtures.ts,
 * which is logged in once per run.
 */

const CUSTOMER = { id: '0009626222', name: 'Ballyvesey Industries Ltd' };
const OPPORTUNITY = 'Foundation Frontier Assessment';
const EXPECTED_PROMPTS = CoachMeModalPage.SUGGESTED_QUESTIONS;

// The assertions are read-only, so they run serially against one modal opened
// in the first test — re-opening it per test would mean re-navigating to the
// account page (which needs several reloads on staging) seven more times.
test.describe(`Coach Me prompts — ${CUSTOMER.name} / ${OPPORTUNITY}`, () => {
  test.describe.configure({ mode: 'serial' });

  let account: CustomerAccountPage;
  let coach: CoachMeModalPage;

  // `sharedPage` is the run's single window (worker-scoped, so usable from
  // beforeAll) — no extra context/window is opened for this block.
  test.beforeAll(async ({ sharedPage }) => {
    if (!hasCredentials()) return; // tests skip below
    test.setTimeout(120000); // the account view can need several reloads to mount
    account = new CustomerAccountPage(sharedPage);
    coach = new CoachMeModalPage(sharedPage);
    await account.goto(CUSTOMER.id);
    await account.openTab('Opportunities');
  });

  test.beforeEach(() => {
    test.skip(
      !hasCredentials(),
      'Credentials must be set (AICoach_MICROSOFT_EMAIL/AICoach_MICROSOFT_PASSWORD or EMAIL/PASSWORD)',
    );
  });

  test('should open the AI Coach modal from the opportunity\'s Coach Me button', async ({ page }) => {
    const httpErrors = watchHttpErrors(page);

    // Precondition: the opportunity is listed with its Coach Me action.
    const card = account.opportunityCard(OPPORTUNITY);
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect(card.getByRole('button', { name: 'Coach Me' })).toBeVisible();

    await account.openCoachMe(OPPORTUNITY);
    await coach.waitForOpen();

    // The modal is titled for the opportunity it was opened from and is scoped
    // to the right customer.
    await expect(coach.title).toHaveText(`AI Coach — ${OPPORTUNITY}`);
    await expect(coach.contextBanner).toContainText(CUSTOMER.name);

    expect(httpErrors, `Unexpected HTTP errors: ${JSON.stringify(httpErrors, null, 2)}`).toEqual([]);
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

  // One case per prompt so a single reworded question is reported by name
  // rather than as one failing list assertion.
  for (const [index, promptText] of EXPECTED_PROMPTS.entries()) {
    test(`should display prompt ${index + 1}: "${promptText}"`, async () => {
      const prompt = coach.prompt(promptText);
      await expect(prompt).toBeVisible();
      // Prompts are actionable, not just rendered.
      await expect(prompt).toBeEnabled();
    });
  }

  test('should render no empty and no duplicate prompts', async () => {
    const texts = await coach.promptTexts();
    expect(texts.filter((t) => t.length === 0)).toEqual([]);
    expect(new Set(texts).size, `Duplicate prompts: ${JSON.stringify(texts)}`).toBe(texts.length);
  });

  test('should offer a custom question box alongside the suggested prompts', async () => {
    // The suggested prompts are a shortcut, not the only way in: the free-text
    // box is present, and Ask stays disabled until something is typed.
    await expect(coach.questionInput).toBeVisible();
    await expect(coach.questionField).toBeVisible();
    await expect(coach.askButton).toBeDisabled();
  });

  // State-changing cases last: in serial mode they must not disturb the
  // assertions above.
  test('should hide the prompts when the panel is collapsed and restore them when reopened', async () => {
    await coach.collapseSuggestedQuestions();
    await coach.expandSuggestedQuestions();
    await expect(coach.prompts).toHaveText(EXPECTED_PROMPTS);
  });

  test('should display the same prompts after the modal is closed and reopened', async () => {
    await coach.close();
    await account.openCoachMe(OPPORTUNITY);
    await coach.waitForOpen();
    await expect(coach.prompts).toHaveText(EXPECTED_PROMPTS);
  });
});
