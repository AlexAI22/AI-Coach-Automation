import { test, expect } from './support/fixtures';
import { CustomerAccountPage } from '../pages/CustomerAccountPage';
import { CoachMeModalPage } from '../pages/CoachMeModalPage';
import { watchHttpErrors } from './support/httpErrors';
import { hasCredentials } from '../support/credentials';

/**
 * Expansion Plan — Coach Me suggested question prompts.
 *
 * Flow under test: customer account page -> the Expansion Plan tab -> each
 * expansion plan's "Coach Me" button -> the "Expansion Coach" modal -> its
 * "Suggested Questions" panel.
 *
 * SCOPE: the prompt TEXT only — that every Coach Me button in the section
 * offers the expected suggested questions. No prompt is clicked, so no AI run
 * is triggered.
 *
 * The plans themselves are AI-generated and carry a "Last updated" date, so
 * their titles and count change over time. The suite therefore discovers the
 * cards at runtime and asserts only the stable contract: whatever plans are
 * listed, each one's Coach Me opens an Expansion Coach modal offering exactly
 * these four questions.
 */

const CUSTOMER = { id: '0009626222', name: 'Ballyvesey Industries Ltd' };
const EXPECTED_PROMPTS = CoachMeModalPage.EXPANSION_QUESTIONS;

/** The panel copy documents "3-5 strategic growth actions" per account. */
const PLAN_COUNT_RANGE = { min: 1, max: 5 };

test.describe(`Expansion Plan Coach Me prompts — ${CUSTOMER.name}`, () => {
  test.describe.configure({ mode: 'serial' });

  let account: CustomerAccountPage;
  let coach: CoachMeModalPage;

  test.beforeAll(async ({ sharedPage }) => {
    if (!hasCredentials()) return; // tests skip below
    test.setTimeout(180000);
    account = new CustomerAccountPage(sharedPage);
    coach = new CoachMeModalPage(sharedPage);
    await account.goto(CUSTOMER.id);
    await account.openExpansionPlanTab();
  });

  test.beforeEach(() => {
    test.skip(
      !hasCredentials(),
      'Credentials must be set (AICoach_MICROSOFT_EMAIL/AICoach_MICROSOFT_PASSWORD or EMAIL/PASSWORD)',
    );
  });

  test('should list expansion plans, each with a title, description and Coach Me button', async ({ page }) => {
    const httpErrors = watchHttpErrors(page);

    const count = await account.expansionPlanCards.count();
    expect(count, 'No expansion plans were listed').toBeGreaterThanOrEqual(PLAN_COUNT_RANGE.min);
    expect(count, 'More expansion plans than the documented 3-5').toBeLessThanOrEqual(PLAN_COUNT_RANGE.max);

    // Every card must be actionable, otherwise the prompt checks below would
    // silently cover fewer plans than exist.
    await expect(account.expansionPlanList.getByRole('button', { name: 'Coach Me' })).toHaveCount(count);

    for (let i = 0; i < count; i++) {
      const card = account.expansionPlanCards.nth(i);
      await expect(card.getByRole('heading')).toBeVisible();
      await expect(card.locator('p')).not.toBeEmpty();
      await expect(card.getByRole('button', { name: 'Coach Me' })).toBeEnabled();
    }

    expect(httpErrors, `Unexpected HTTP errors: ${JSON.stringify(httpErrors, null, 2)}`).toEqual([]);
  });

  test('every Coach Me button should open an Expansion Coach modal offering the four suggested questions', async () => {
    test.setTimeout(180000);

    const count = await account.expansionPlanCards.count();
    // Without this the loop below would pass by simply never running.
    expect(count, 'No expansion plans found, so no Coach Me button was checked').toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const planTitle = (await account.expansionPlanCards.nth(i).getByRole('heading').innerText()).trim();

      // A step per plan so the report names which plan failed, while the card
      // list itself stays discovered at runtime.
      await test.step(`plan ${i + 1}: ${planTitle}`, async () => {
        await account.openExpansionCoachMe(i);
        await coach.waitForOpen();

        // The modal is titled for the plan it was opened from.
        await expect(coach.title).toHaveText(`Expansion Coach — ${planTitle}`);
        await expect(coach.suggestedQuestionsHeader).toBeVisible();

        // Text, count and order in one assertion.
        await expect(coach.prompts).toHaveText(EXPECTED_PROMPTS);

        await coach.close();
      });
    }
  });

  // Per-prompt cases against the first plan, so a single reworded question is
  // reported by name rather than as one failing list assertion.
  test.describe('first expansion plan', () => {
    test.describe.configure({ mode: 'serial' });

    test.beforeAll(async ({ sharedPage }) => {
      if (!hasCredentials()) return;
      const acct = new CustomerAccountPage(sharedPage);
      const modal = new CoachMeModalPage(sharedPage);
      if (await modal.panel.isVisible().catch(() => false)) {
        await modal.close();
      }
      await acct.openExpansionCoachMe(0);
      await modal.waitForOpen();
    });

    for (const [index, promptText] of EXPECTED_PROMPTS.entries()) {
      test(`should display prompt ${index + 1}: "${promptText}"`, async () => {
        const prompt = coach.prompt(promptText);
        await expect(prompt).toBeVisible();
        await expect(prompt).toBeEnabled();
      });
    }

    test(`should display exactly ${EXPECTED_PROMPTS.length} prompts, none blank or duplicated`, async () => {
      await expect(coach.prompts).toHaveCount(EXPECTED_PROMPTS.length);

      const texts = await coach.promptTexts();
      expect(texts.filter((t) => t.length === 0)).toEqual([]);
      expect(new Set(texts).size, `Duplicate prompts: ${JSON.stringify(texts)}`).toBe(texts.length);
    });

    test('should offer a custom question box alongside the suggested prompts', async () => {
      await expect(coach.questionInput).toBeVisible();
      await expect(coach.questionField).toBeVisible();
      await expect(coach.askButton).toBeDisabled();
    });
  });
});
