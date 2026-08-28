import { test, expect } from './support/fixtures';
import { CustomerAccountPage } from '../pages/CustomerAccountPage';
import { CoachMeModalPage } from '../pages/CoachMeModalPage';
import { watchHttpErrors } from './support/httpErrors';
import { hasCredentials } from '../support/credentials';

/**
 * Coach Me — running every suggested question and checking its answer.
 *
 * Flow per prompt: click the suggested question (which only fills the
 * custom-question input), press "Ask", wait for the assistant's answer, check
 * it, wait 3s, then press "Clear chat" so the next prompt starts from an empty
 * conversation.
 *
 * SEPARATE FROM coachMe.spec.ts ON PURPOSE. That suite only checks the prompts
 * are displayed and runs in ~20s; this one triggers eight real AI runs at
 * roughly 2-3 minutes each, so a full pass takes 20+ minutes. Keeping them apart
 * means the cheap checks stay cheap.
 *
 * WHAT IS ASSERTED: the answer is non-deterministic generated prose, so the
 * assertions cover properties that must hold for ANY valid answer — the run
 * completes, the question is echoed back verbatim, exactly one answer is
 * produced, it is substantial, and it carries no failure marker. The answer
 * text itself is attached to the HTML report for human review, and grounding
 * signals are logged rather than asserted.
 */

const CUSTOMER = { id: '0009626222', name: 'Ballyvesey Industries Ltd' };
const OPPORTUNITY = 'Foundation Frontier Assessment';
const PROMPTS = CoachMeModalPage.SUGGESTED_QUESTIONS;

/** A usable coaching answer is well past this; catches empty/stub responses. */
const MIN_ANSWER_LENGTH = 200;

/** Requested settle time between an answer landing and clearing the chat. */
const SETTLE_AFTER_ANSWER_MS = 3000;

test.describe(`Coach Me answers — ${CUSTOMER.name} / ${OPPORTUNITY}`, () => {
  // Default (not serial): each prompt is independent, so one failing prompt must
  // not hide the ones after it. Under serial, a single content gap on prompt 7
  // silently skipped prompt 8 entirely.
  test.describe.configure({ mode: 'default' });

  let account: CustomerAccountPage;
  let coach: CoachMeModalPage;

  test.beforeAll(async ({ sharedPage }) => {
    if (!hasCredentials()) return; // tests skip below
    test.setTimeout(180000);
    account = new CustomerAccountPage(sharedPage);
    coach = new CoachMeModalPage(sharedPage);
    await account.goto(CUSTOMER.id);
    await account.openTab('Opportunities');
    await account.openCoachMe(OPPORTUNITY);
    await coach.waitForOpen();
  });

  // Self-healing: a prompt that failed mid-answer would otherwise leave the
  // modal closed or the conversation dirty and break every prompt after it.
  test.beforeEach(async () => {
    test.skip(
      !hasCredentials(),
      'Credentials must be set (AICoach_MICROSOFT_EMAIL/AICoach_MICROSOFT_PASSWORD or EMAIL/PASSWORD)',
    );

    if (!(await coach.panel.isVisible().catch(() => false))) {
      await account.openTab('Opportunities');
      await account.openCoachMe(OPPORTUNITY);
      await coach.waitForOpen();
    }
  });

  /**
   * KNOWN PRODUCT ISSUE — prompt 7, "How should I engage with Microsoft for this
   * offer?". The app answers, in full:
   *
   *   "Guidance for engaging with Microsoft for this offer is not yet available.
   *    The required Advisory Motion training content has not been loaded."
   *
   * 140 characters, and it trips FAILURE_MARKERS. That is missing CONTENT on
   * staging, not a test defect, so this case RUNS and FAILS on purpose: the
   * assertions stay identical to every other prompt, and the failure is the
   * standing signal that the Advisory Motion content is not loaded. It will
   * pass by itself once the content lands — no edit needed here.
   *
   * Re-confirmed still failing after the content check on the day this was
   * written; do not "fix" it by lowering MIN_ANSWER_LENGTH or trimming
   * FAILURE_MARKERS, which would hide the gap instead of reporting it.
   */
  for (const [index, promptText] of PROMPTS.entries()) {
    test(`prompt ${index + 1} should return a usable answer: "${promptText}"`, async ({ page }, testInfo) => {
      test.setTimeout(600000); // a single answer has been observed to take ~2.5 min

      const httpErrors = watchHttpErrors(page);

      // Each prompt is judged on its own, so start from an empty conversation
      // rather than letting the previous answer sit in the context. Conversations
      // persist per opportunity, so this clears rather than assumes.
      await coach.ensureConversationEmpty();

      const started = Date.now();
      await coach.askSuggestedQuestion(promptText);

      // The question is echoed into the conversation exactly as offered, and
      // submitting empties the input.
      await expect(coach.userMessages).toHaveCount(1);
      await expect(coach.userMessages.first()).toHaveText(promptText);
      await expect(coach.questionField).toHaveValue('');

      const answer = await coach.waitForAnswer();
      const seconds = Math.round((Date.now() - started) / 1000);

      // Keep the full answer with the run for human review.
      await testInfo.attach(`answer-${index + 1}`, { body: answer, contentType: 'text/plain' });
      const mentionsCustomer = new RegExp(CUSTOMER.name.split(' ')[0], 'i').test(answer);
      console.log(
        `[prompt ${index + 1}] ${seconds}s, ${answer.length} chars, mentions customer: ${mentionsCustomer}\n` +
          `   ${answer.replace(/\s+/g, ' ').slice(0, 160)}...`,
      );

      // Exactly one answer for one question — no duplicated or dropped turn.
      await expect(coach.assistantMessages).toHaveCount(1);
      expect(answer.length, `Answer was too short to be usable: ${JSON.stringify(answer)}`)
        .toBeGreaterThan(MIN_ANSWER_LENGTH);
      expect(answer, 'Answer contains a failure marker').not.toMatch(CoachMeModalPage.FAILURE_MARKERS);

      // Let the answer settle, then reset the conversation for the next prompt.
      // "Clear chat" is an <a role="button"> in the coach toolbar rather than a
      // <button>, which is why the page object locates it by ROLE.
      await page.waitForTimeout(SETTLE_AFTER_ANSWER_MS);
      await coach.clearChat();
      await expect(coach.body).toContainText(CoachMeModalPage.EMPTY_STATE);

      expect(httpErrors, `Unexpected HTTP errors: ${JSON.stringify(httpErrors, null, 2)}`).toEqual([]);
    });
  }
});
