import { test, expect } from './support/fixtures';
import { CustomerAccountPage } from '../pages/CustomerAccountPage';
import { CoachMeModalPage } from '../pages/CoachMeModalPage';
import { watchHttpErrors } from './support/httpErrors';
import { hasCredentials } from '../support/credentials';

/**
 * Coach Me — FFA (Foundation Frontier Assessment).
 *
 * Flow under test: customer account page -> the "FFA" tab -> the Foundation
 * Frontier Assessment card's "Coach Me" button -> the AI Coach modal -> its
 * "Suggested Questions" panel.
 *
 * No prompt is clicked, so no AI run is triggered.
 */

const CUSTOMER = { id: '0009623781', region: 'EMEA', name: 'Inflexion Buyout V Investments LP' };
const OPPORTUNITY = 'Foundation Frontier Assessment';
const EXPECTED_PROMPTS = CoachMeModalPage.SUGGESTED_QUESTIONS;

// Read-only assertions run serially against one modal opened in the first test,
// so the account page is not re-navigated for every case.
test.describe(`Coach Me — FFA — ${CUSTOMER.name}`, () => {
  test.describe.configure({ mode: 'serial' });

  let account: CustomerAccountPage;
  let coach: CoachMeModalPage;

  const openFfaCoachMe = async (): Promise<void> => {
    const coachMeButton = account.ffaCard(OPPORTUNITY).getByRole('button', { name: 'Coach Me', exact: true });
    await expect(coachMeButton).toBeEnabled();
    await coachMeButton.click();
    await coach.waitForOpen();
  };

  test.beforeAll(async ({ sharedPage }) => {
    if (!hasCredentials()) return; // tests skip below
    test.setTimeout(120000); // the account view can need several reloads to mount
    account = new CustomerAccountPage(sharedPage);
    coach = new CoachMeModalPage(sharedPage);
    await account.goto(CUSTOMER.id, CUSTOMER.region);
  });

  test.beforeEach(() => {
    test.skip(
      !hasCredentials(),
      'Credentials must be set (AICoach_MICROSOFT_EMAIL/AICoach_MICROSOFT_PASSWORD or EMAIL/PASSWORD)',
    );
  });

  test('should open Coach Me for FFA from the customer account', async ({ page }) => {
    const httpErrors = watchHttpErrors(page);

    await account.openTab('FFA');
    const ffaCard = account.ffaCard(OPPORTUNITY);
    await expect(ffaCard).toBeVisible({ timeout: 20000 });

    await openFfaCoachMe();

    await expect(coach.title).toHaveText(`AI Coach — ${OPPORTUNITY}`);
    await expect(coach.contextBanner).toContainText(CUSTOMER.name);

    expect(httpErrors, `Unexpected HTTP errors: ${JSON.stringify(httpErrors, null, 2)}`).toEqual([]);
  });

  test('should display the Suggested Questions panel with its header', async () => {
    await expect(coach.suggestedQuestions).toBeVisible();
    await expect(coach.suggestedQuestionsHeader).toBeVisible();
    await expect(coach.suggestedQuestionsDisclosure).toHaveAttribute('aria-expanded', 'true');
  });

  test(`should display exactly ${EXPECTED_PROMPTS.length} suggested question prompts`, async () => {
    await expect(coach.prompts).toHaveCount(EXPECTED_PROMPTS.length);
  });

  test('should display every suggested question prompt verbatim and in order', async () => {
    // Array toHaveText asserts text, count and order in one pass.
    await expect(coach.prompts).toHaveText(EXPECTED_PROMPTS);
  });

  // One case per prompt so a single reworded question is reported by name.
  for (const [index, promptText] of EXPECTED_PROMPTS.entries()) {
    test(`should display prompt ${index + 1}: "${promptText}"`, async () => {
      const prompt = coach.prompt(promptText);
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

  test('should display every text in the modal header', async () => {
    await expect(coach.title).toHaveText(`AI Coach — ${OPPORTUNITY}`);
    await expect(coach.closeModalButton).toBeVisible();
    await expect(coach.suggestedQuestionsDisclosure).toHaveText(/^suggested questions$/i);
  });

  test('should display the conversation toolbar with its initial states', async () => {
    await expect(coach.suggestedQuestionsToggle).toHaveText('Hide');
    await expect(coach.suggestedQuestionsToggle).toBeEnabled();

    await expect(coach.clearChatButton).toHaveText('Clear chat');
    await expect(coach.clearChatButton).toBeEnabled();

    // Nothing is attached yet, so the attachments list is empty and disabled.
    await expect(coach.attachmentsButton).toHaveText('Attachments (0)');
    await expect(coach.attachmentsButton).toBeDisabled();

    await expect(coach.uploadMaterialsButton).toHaveText('Upload materials');
    await expect(coach.uploadMaterialsButton).toBeEnabled();

    // No conversation yet, so there is nothing to download.
    await expect(coach.downloadConversationButton).toHaveText('Download conversation');
    await expect(coach.downloadConversationButton).toBeDisabled();
  });

  test('should display the session context and the empty-conversation hint', async () => {
    await expect(coach.attachedLabel).toBeVisible();
    await expect(coach.contextBanner).toHaveText(`Session ready · ${CUSTOMER.name}`);
    await expect(coach.emptyState).toBeVisible();
    await expect(coach.userMessages).toHaveCount(0);
    await expect(coach.assistantMessages).toHaveCount(0);
  });

  test('should display the question box placeholder and the Ask button', async () => {
    await expect(coach.questionField).toHaveAttribute('placeholder', 'Ask a question...');
    await expect(coach.questionField).toHaveValue('');
    await expect(coach.askButton).toHaveText('Ask');
    await expect(coach.askButton).toBeDisabled();
  });

  // State-changing cases last so they don't disturb the assertions above.
  test('should hide the prompts when the panel is collapsed and restore them when reopened', async () => {
    await coach.collapseSuggestedQuestions();
    await coach.expandSuggestedQuestions();
    await expect(coach.prompts).toHaveText(EXPECTED_PROMPTS);
  });

  test('should display the same prompts after the modal is closed and reopened', async () => {
    await coach.close();
    await openFfaCoachMe();
    await expect(coach.prompts).toHaveText(EXPECTED_PROMPTS);
  });
});
