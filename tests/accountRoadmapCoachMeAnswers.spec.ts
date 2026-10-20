import { test, expect } from './support/fixtures';
import { CustomerAccountPage } from '../pages/CustomerAccountPage';
import { CoachMeModalPage } from '../pages/CoachMeModalPage';
import { watchHttpErrors } from './support/httpErrors';
import { hasCredentials } from '../support/credentials';

/**
 * Account Roadmap — Coach Me: run every suggested question and check the
 * agent's answer.
 *
 * All prompts run in ONE test (one browser session), a step per prompt.
 * Playwright replaces the worker (and relaunches the browser) after every failed
 * test, so one-test-per-prompt reopened the browser whenever a prompt failed.
 *
 * Flow per prompt: click the suggested question (fills the input), press "Ask",
 * wait for the answer to finish rendering, check it, then "Clear chat" so the
 * next prompt starts from an empty conversation.
 *
 * Answers are non-deterministic prose, so the checks cover properties every
 * valid answer must have (completes, question echoed verbatim, exactly one
 * answer, substantial length, no failure marker) plus content-gap, placeholder
 * and topic checks. Answer checks are SOFT so every prompt runs and is
 * reported. The full answer is attached to the HTML report.
 *
 * 8 real AI runs; a full pass takes a few minutes. Kept separate from the
 * read-only accountRoadmapCoachMe.spec.ts.
 */

const CUSTOMER = { id: '0009623781', region: 'EMEA', name: 'Inflexion Buyout V Investments LP' };
const PROMPTS = CoachMeModalPage.ROADMAP_QUESTIONS;
const MODAL_TITLE = 'Account Roadmap Coach';

/** A usable coaching answer is well past this; catches empty/stub responses. */
const MIN_ANSWER_LENGTH = 200;

/** Settle time between an answer landing and clearing the chat. */
const SETTLE_AFTER_ANSWER_MS = 3000;

/** Content gaps the generic FAILURE_MARKERS miss. */
const CONTENT_GAP = /service catalogue entry (is )?not loaded|no matched service catalogue entry/i;

/** Unfilled placeholders. "[Contact name]"-style slots are allowed in drafts. */
const UNFILLED_PLACEHOLDER = /\b(TBC|TBD|TODO|lorem ipsum)\b/;

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

test.describe(`Account Roadmap Coach answers — ${CUSTOMER.name}`, () => {
  test('every suggested question should return a usable answer', async ({ sharedPage: page }, testInfo) => {
    test.skip(
      !hasCredentials(),
      'Credentials must be set (AICoach_MICROSOFT_EMAIL/AICoach_MICROSOFT_PASSWORD or EMAIL/PASSWORD)',
    );
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
        // Conversations persist per section, so clear rather than assume.
        await coach.ensureConversationEmpty();

        const started = Date.now();
        await coach.askSuggestedQuestion(promptText);

        await expect(coach.userMessages).toHaveCount(1);
        await expect.soft(coach.userMessages.first()).toHaveText(promptText);
        await expect.soft(coach.questionField).toHaveValue('');

        const answer = await coach.waitForAnswer();
        const seconds = Math.round((Date.now() - started) / 1000);

        await testInfo.attach(`roadmap-q${index + 1}`, {
          body: `Q: ${promptText}\n\n${answer}`,
          contentType: 'text/plain',
        });
        const mentionsCustomer = /inflexion/i.test(answer);
        console.log(
          `[Roadmap prompt ${index + 1}] ${seconds}s, ${answer.length} chars, mentions customer: ${mentionsCustomer}\n` +
            `   ${answer.replace(/\s+/g, ' ').slice(0, 160)}...`,
        );

        const q = `Q${index + 1}`;
        await expect.soft(coach.assistantMessages).toHaveCount(1);
        expect.soft(answer.length, `${q}: answer was too short to be usable: ${JSON.stringify(answer)}`)
          .toBeGreaterThan(MIN_ANSWER_LENGTH);
        expect.soft(answer, `${q}: answer contains a failure marker`).not.toMatch(CoachMeModalPage.FAILURE_MARKERS);
        expect.soft(answer, `${q}: answer reports missing source content`).not.toMatch(CONTENT_GAP);
        expect.soft(answer, `${q}: answer contains an unfilled placeholder`).not.toMatch(UNFILLED_PLACEHOLDER);
        expect.soft(answer, `${q}: answer looks off-topic for "${promptText}"`).toMatch(EXPECTED_TOPIC[promptText]);

        await page.waitForTimeout(SETTLE_AFTER_ANSWER_MS);
        await coach.clearChat();
        await expect(coach.body).toContainText(CoachMeModalPage.EMPTY_STATE);
      });
    }

    await coach.close();

    expect(httpErrors, `Unexpected HTTP errors: ${JSON.stringify(httpErrors, null, 2)}`).toEqual([]);
  });
});
