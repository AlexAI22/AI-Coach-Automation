import { test, expect } from './support/fixtures';
import { CustomerAccountPage } from '../pages/CustomerAccountPage';
import { CoachMeModalPage } from '../pages/CoachMeModalPage';
import { watchHttpErrors } from './support/httpErrors';
import { hasCredentials } from '../support/credentials';

/**
 * Expansion Plan — Coach Me: run every suggested question of the
 * "Copilot-Powered Productivity & AI Adoption Program" plan and check the
 * agent's answer.
 *
 * All prompts run in ONE test (one browser session), a step per prompt.
 *
 * Flow per prompt: click the suggested question (fills the input), press "Ask",
 * wait for the answer to finish rendering, check it, then "Clear chat" so the
 * next prompt starts from an empty conversation.
 *
 * Only this one plan's Coach Me is exercised: the four prompts are identical
 * on every plan, and the prompt text for all plans is covered by the read-only
 * expansionPlanCoachMe.spec.ts. The plan is located by its exact title; plans
 * are AI-generated, so if it is regenerated under a new name the suite fails
 * with a message saying to update PLAN_TITLE.
 *
 * Answers are non-deterministic prose, so the hard assertions cover properties
 * every valid answer must have (completes, question echoed verbatim, exactly
 * one answer, substantial length, no failure marker). Content-gap, placeholder
 * and topic checks are SOFT so they flag issues without masking the hard
 * checks. The full answer is attached to the HTML report.
 */

const CUSTOMER = { id: '0009623781', region: 'EMEA', name: 'Inflexion Buyout V Investments LP' };
const PLAN_TITLE = 'Copilot-Powered Productivity & AI Adoption Program';
const PROMPTS = CoachMeModalPage.EXPANSION_QUESTIONS;

/** A usable coaching answer is well past this; catches empty/stub responses. */
const MIN_ANSWER_LENGTH = 200;

/** Settle time between an answer landing and clearing the chat. */
const SETTLE_AFTER_ANSWER_MS = 3000;

/** Content gaps the generic FAILURE_MARKERS miss. */
const CONTENT_GAP = /service catalogue entry (is )?not loaded|no matched service catalogue entry/i;

/** Unfilled placeholders. "[Contact name]"-style slots are allowed in email drafts. */
const UNFILLED_PLACEHOLDER = /\b(TBC|TBD|TODO|lorem ipsum)\b/;

/** What an on-topic answer to each prompt is expected to talk about. */
const EXPECTED_TOPIC: Record<string, RegExp> = {
  [PROMPTS[0]]: /recommend|because|priorit|fit|signal|spend/i,
  [PROMPTS[1]]: /pitch|position|value|messag/i,
  [PROMPTS[2]]: /subject|dear|hi\b|hello|regards/i,
  [PROMPTS[3]]: /objection|concern|respon/i,
};

test.describe(`Expansion Plan Coach Me answers — ${PLAN_TITLE} — ${CUSTOMER.name}`, () => {
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
    test.skip(
      !hasCredentials(),
      'Credentials must be set (AICoach_MICROSOFT_EMAIL/AICoach_MICROSOFT_PASSWORD or EMAIL/PASSWORD)',
    );
    test.setTimeout(PROMPTS.length * 300000);
    testInfo.annotations.push({ type: 'expansion plan', description: PLAN_TITLE });

    const account = new CustomerAccountPage(page);
    const coach = new CoachMeModalPage(page);
    const httpErrors = watchHttpErrors(page);

    await test.step('open the plan\'s Coach Me', async () => {
      await account.goto(CUSTOMER.id, CUSTOMER.region);
      await account.openExpansionPlanTab();
      await expect(account.expansionPlanCards.first()).toBeVisible({ timeout: 30000 });
      const card = account.expansionPlanCard(PLAN_TITLE);
      await expect(
        card,
        `Expansion plan "${PLAN_TITLE}" is not listed. Plans are AI-generated — update PLAN_TITLE if it was regenerated.`,
      ).toHaveCount(1);
      await card.getByRole('button', { name: 'Coach Me', exact: true }).click();
      await coach.waitForOpen();
      await expect(coach.title).toHaveText(`Expansion Coach — ${PLAN_TITLE}`);
    });

    for (const [index, promptText] of PROMPTS.entries()) {
      await test.step(`Q${index + 1}: ${promptText}`, async () => {
        // Conversations persist per plan, so clear rather than assume.
        await coach.ensureConversationEmpty();

        const started = Date.now();
        await coach.askSuggestedQuestion(promptText);

        await expect(coach.userMessages).toHaveCount(1);
        await expect.soft(coach.userMessages.first()).toHaveText(promptText);
        await expect.soft(coach.questionField).toHaveValue('');

        const answer = await coach.waitForAnswer();
        const seconds = Math.round((Date.now() - started) / 1000);

        await testInfo.attach(`answer-${index + 1}`, {
          body: `${PLAN_TITLE}\n\nQ: ${promptText}\n\n${answer}`,
          contentType: 'text/plain',
        });
        const mentionsCustomer = /inflexion/i.test(answer);
        console.log(
          `[Expansion prompt ${index + 1}] ${seconds}s, ${answer.length} chars, mentions customer: ${mentionsCustomer}\n` +
            `   ${answer.replace(/\s+/g, ' ').slice(0, 160)}...`,
        );

        await expect.soft(coach.assistantMessages).toHaveCount(1);
        expect.soft(answer.length, `Q${index + 1}: answer was too short to be usable: ${JSON.stringify(answer)}`)
          .toBeGreaterThan(MIN_ANSWER_LENGTH);
        expect.soft(answer, `Q${index + 1}: answer contains a failure marker`).not.toMatch(CoachMeModalPage.FAILURE_MARKERS);
        expect.soft(answer, `Q${index + 1}: answer reports missing source content`).not.toMatch(CONTENT_GAP);
        expect.soft(answer, `Q${index + 1}: answer contains an unfilled placeholder`).not.toMatch(UNFILLED_PLACEHOLDER);
        expect.soft(answer, `Q${index + 1}: answer looks off-topic for "${promptText}"`).toMatch(EXPECTED_TOPIC[promptText]);

        await page.waitForTimeout(SETTLE_AFTER_ANSWER_MS);
        await coach.clearChat();
        await expect(coach.body).toContainText(CoachMeModalPage.EMPTY_STATE);
      });
    }

    await coach.close();

    expect(httpErrors, `Unexpected HTTP errors: ${JSON.stringify(httpErrors, null, 2)}`).toEqual([]);
  });
});
