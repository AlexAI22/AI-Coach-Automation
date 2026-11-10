import { test, expect } from './support/fixtures';
import { CustomerAccountPage } from '../pages/CustomerAccountPage';
import { CoachMeModalPage } from '../pages/CoachMeModalPage';
import { watchHttpErrors } from './support/httpErrors';
import { hasCredentials } from '../support/credentials';
import { askAndCheckAnswer, CREDENTIALS_REQUIRED } from './support/coachMeAnswers';

/**
 * Expansion Plan — Coach Me: run every suggested question of the first listed
 * expansion plan and check the agent's answer.
 *
 * All prompts run in ONE test (one browser session), a step per prompt. The
 * per-prompt flow and answer checks live in tests/support/coachMeAnswers.ts;
 * here they are all SOFT so every prompt runs and is reported.
 *
 * Only this one plan's Coach Me is exercised: the four prompts are identical
 * on every plan, and the prompt text for all plans is covered by the read-only
 * expansionPlanCoachMe.spec.ts. Plans are AI-generated and get regenerated
 * under new titles, so the first card is used and its title read at runtime.
 */

const CUSTOMER = { id: '0009623781', region: 'EMEA', name: 'Inflexion Buyout V Investments LP' };
const PROMPTS = CoachMeModalPage.EXPANSION_QUESTIONS;

/** What an on-topic answer to each prompt is expected to talk about. */
const EXPECTED_TOPIC: Record<string, RegExp> = {
  [PROMPTS[0]]: /recommend|because|priorit|fit|signal|spend/i,
  [PROMPTS[1]]: /pitch|position|value|messag/i,
  [PROMPTS[2]]: /subject|dear|hi\b|hello|regards/i,
  [PROMPTS[3]]: /objection|concern|respon/i,
};

test.describe(`Expansion Plan Coach Me answers — ${CUSTOMER.name}`, () => {
  /*
   * ONE test, ONE browser session: all four prompts run as steps inside a
   * single test. Playwright replaces the worker (and so relaunches the browser)
   * after every failed test, so one-test-per-prompt reopened the browser for
   * each prompt while the known 404 below is failing. Answer checks are SOFT so
   * a bad answer to one prompt is reported without stopping the next prompts.
   *
   * KNOWN PRODUCT ISSUE on staging (the test FAILS on purpose, as the standing
   * signal; it passes by itself once the backend is fixed):
   *  - each new Expansion Coach session (on open and after "Clear chat")
   *    requests GET /csm/coach-sessions/expansion_coach/<sessionId>/materials,
   *    which returns 404. The FFA coach's equivalent call succeeds, so an empty
   *    session should return an empty list, not 404.
   * The answers themselves pass every content check. Do not allow-list the 404.
   */
  test('every suggested question should return a usable answer', async ({ sharedPage: page }, testInfo) => {
    test.skip(!hasCredentials(), CREDENTIALS_REQUIRED);
    test.setTimeout(PROMPTS.length * 300000);

    const account = new CustomerAccountPage(page);
    const coach = new CoachMeModalPage(page);
    const httpErrors = watchHttpErrors(page);
    let planTitle = '';

    await test.step('open the plan\'s Coach Me', async () => {
      await account.goto(CUSTOMER.id, CUSTOMER.region);
      await account.openExpansionPlanTab();
      const card = account.expansionPlanCards.first();
      await expect(card, 'No expansion plans are listed').toBeVisible({ timeout: 30000 });
      planTitle = (await card.getByRole('heading').first().innerText()).trim();
      testInfo.annotations.push({ type: 'expansion plan', description: planTitle });
      await card.getByRole('button', { name: 'Coach Me', exact: true }).click();
      await coach.waitForOpen();
      await expect(coach.title).toHaveText(`Expansion Coach — ${planTitle}`);
    });

    for (const [index, promptText] of PROMPTS.entries()) {
      await test.step(`Q${index + 1}: ${promptText}`, async () => {
        await askAndCheckAnswer(page, coach, testInfo, {
          index,
          prompt: promptText,
          label: 'Expansion',
          customerName: CUSTOMER.name,
          topic: EXPECTED_TOPIC[promptText],
          attachmentContext: planTitle,
          allSoft: true,
        });
      });
    }

    await coach.close();

    expect(httpErrors, `Unexpected HTTP errors: ${JSON.stringify(httpErrors, null, 2)}`).toEqual([]);
  });
});
