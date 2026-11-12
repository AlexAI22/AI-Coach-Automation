import { test, expect } from './support/fixtures';
import { CustomerAccountPage } from '../pages/CustomerAccountPage';
import { CoachMeModalPage } from '../pages/CoachMeModalPage';
import { watchHttpErrors } from './support/httpErrors';
import { hasCredentials } from '../support/credentials';
import { askAndCheckAnswer, CREDENTIALS_REQUIRED } from './support/coachMeAnswers';

/**
 * Account Roadmap — Coach Me: run every suggested question and check the
 * agent's answer.
 *
 * All prompts run in ONE test (one browser session), a step per prompt.
 * Playwright replaces the worker (and relaunches the browser) after every failed
 * test, so one-test-per-prompt reopened the browser whenever a prompt failed.
 *
 * The per-prompt flow and answer checks live in tests/support/coachMeAnswers.ts;
 * here they are all SOFT so every prompt runs and is reported.
 *
 * 8 real AI runs; a full pass takes a few minutes. Kept separate from the
 * read-only accountRoadmapCoachMe.spec.ts.
 */

const CUSTOMER = { id: '0009623781', region: 'EMEA', name: 'Inflexion Buyout V Investments LP' };
const PROMPTS = CoachMeModalPage.ROADMAP_QUESTIONS;
const MODAL_TITLE = 'Account Roadmap Coach';

/** What an on-topic answer to each prompt is expected to talk about. */
const EXPECTED_TOPIC: Record<string, RegExp> = {
  [PROMPTS[0]]: /pursuit plan|objective|stakeholder|next step/i,
  [PROMPTS[1]]: /\?/, // a list of discovery questions
  [PROMPTS[2]]: /pain point|issue|challenge|risk/i,
  [PROMPTS[3]]: /\?/, // a list of discovery questions
  [PROMPTS[4]]: /agenda|structure|minutes|open|close|next step/i,
  [PROMPTS[5]]: /recommendation/i,
  [PROMPTS[6]]: /roadmap|structure|phase|agenda/i,
  [PROMPTS[7]]: /push ?back|objection|concern|acknowledge/i,
};

// @ai: triggers real AI runs, so CI keeps it out of the per-push smoke.
test.describe(`Account Roadmap Coach answers — ${CUSTOMER.name}`, { tag: '@ai' }, () => {
  test('every suggested question should return a usable answer', async ({ sharedPage: page }, testInfo) => {
    test.skip(!hasCredentials(), CREDENTIALS_REQUIRED);
    test.setTimeout(PROMPTS.length * 300000);

    const account = new CustomerAccountPage(page);
    const coach = new CoachMeModalPage(page);
    const httpErrors = watchHttpErrors(page);

    await test.step('open the Account Roadmap Coach Me', async () => {
      await account.goto(CUSTOMER.id, CUSTOMER.region);
      await account.openAccountRoadmapTab();
      await account.openRoadmapCoachMe();
      await coach.waitForOpen();
      await expect(coach.title).toHaveText(MODAL_TITLE);
      await expect(coach.prompts).toHaveText(PROMPTS);
    });

    for (const [index, promptText] of PROMPTS.entries()) {
      await test.step(`Q${index + 1}: ${promptText}`, async () => {
        await askAndCheckAnswer(page, coach, testInfo, {
          index,
          prompt: promptText,
          label: 'Roadmap',
          customerName: CUSTOMER.name,
          topic: EXPECTED_TOPIC[promptText],
          allSoft: true,
        });
      });
    }

    await coach.close();

    expect(httpErrors, `Unexpected HTTP errors: ${JSON.stringify(httpErrors, null, 2)}`).toEqual([]);
  });
});
