import { test, expect } from './support/fixtures';
import { CustomerAccountPage } from '../pages/CustomerAccountPage';
import { CoachMeModalPage } from '../pages/CoachMeModalPage';
import { watchHttpErrors } from './support/httpErrors';
import { hasCredentials } from '../support/credentials';

/**
 * Coach Me — FFA: run every suggested question and check the agent's answer.
 *
 * Flow per prompt: click the suggested question (fills the input), press "Ask",
 * wait for the answer to finish rendering, check it, then "Clear chat" so the
 * next prompt starts from an empty conversation.
 *
 * Separate from coachMeFFA.spec.ts on purpose: that suite is read-only and runs
 * in seconds; this one triggers eight real AI runs (~2-3 min each).
 *
 * Answers are non-deterministic prose, so the hard assertions cover properties
 * every valid answer must have (completes, question echoed verbatim, exactly
 * one answer, substantial length, no failure marker). Each prompt also has a
 * topic check as a SOFT assertion — it flags an off-topic answer without
 * masking the hard checks. The full answer is attached to the HTML report.
 */

const CUSTOMER = { id: '0009623781', region: 'EMEA', name: 'Inflexion Buyout V Investments LP' };
const OPPORTUNITY = 'Foundation Frontier Assessment';
const PROMPTS = CoachMeModalPage.SUGGESTED_QUESTIONS;

/** A usable coaching answer is well past this; catches empty/stub responses. */
const MIN_ANSWER_LENGTH = 200;

/** Settle time between an answer landing and clearing the chat. */
const SETTLE_AFTER_ANSWER_MS = 3000;

/**
 * Content gaps the generic FAILURE_MARKERS miss. Observed on staging:
 *  - prompt 1 declines to list outcomes/deliverables because "The matched
 *    Service Catalogue entry is not loaded" (passes length/marker checks).
 */
const CONTENT_GAP = /service catalogue entry (is )?not loaded|no matched service catalogue entry/i;

/**
 * Unfilled placeholders in user-facing copy. Observed on staging: prompt 8's
 * canned funding reply says "please reach out to TBC". Square-bracket slots
 * like "[Contact name]" are excluded — the email draft uses them by design.
 */
const UNFILLED_PLACEHOLDER = /\b(TBC|TBD|TODO|lorem ipsum)\b/;

/** What an on-topic answer to each prompt is expected to talk about. */
const EXPECTED_TOPIC: Record<string, RegExp> = {
  [PROMPTS[0]]: /outcome|deliverable/i,
  [PROMPTS[1]]: /recommend|because|priorit|fit/i,
  [PROMPTS[2]]: /roadmap/i,
  [PROMPTS[3]]: /subject|dear|hi\b|hello|regards/i,
  [PROMPTS[4]]: /objection|concern|respon/i,
  [PROMPTS[5]]: /blue sheet|single sales objective|buying influence/i,
  [PROMPTS[6]]: /microsoft/i,
  [PROMPTS[7]]: /fund/i,
};

test.describe(`Coach Me answers — FFA — ${CUSTOMER.name}`, () => {
  // Not serial: one failing prompt must not skip the prompts after it.
  test.describe.configure({ mode: 'default' });

  /*
   * KNOWN PRODUCT ISSUES on staging (these cases FAIL on purpose, as the
   * standing signal; they pass by themselves once the content is fixed):
   *  - prompt 1: Service Catalogue entry not loaded -> no outcomes/deliverables.
   *  - prompt 7: "Advisory Motion training content has not been loaded" (140 chars).
   *  - prompt 8: canned funding reply ends "please reach out to TBC".
   * Do not loosen the checks to make these pass.
   */

  let account: CustomerAccountPage;
  let coach: CoachMeModalPage;

  const openFfaCoachMe = async (): Promise<void> => {
    await account.openTab('FFA');
    const coachMeButton = account.ffaCard(OPPORTUNITY).getByRole('button', { name: 'Coach Me', exact: true });
    await expect(coachMeButton).toBeEnabled({ timeout: 20000 });
    await coachMeButton.click();
    await coach.waitForOpen();
  };

  test.beforeAll(async ({ sharedPage }) => {
    if (!hasCredentials()) return; // tests skip below
    test.setTimeout(180000);
    account = new CustomerAccountPage(sharedPage);
    coach = new CoachMeModalPage(sharedPage);
    await account.goto(CUSTOMER.id, CUSTOMER.region);
    await openFfaCoachMe();
  });

  // Self-healing: a prompt that failed mid-answer may leave the modal closed.
  test.beforeEach(async () => {
    test.skip(
      !hasCredentials(),
      'Credentials must be set (AICoach_MICROSOFT_EMAIL/AICoach_MICROSOFT_PASSWORD or EMAIL/PASSWORD)',
    );
    if (!(await coach.panel.isVisible().catch(() => false))) {
      await openFfaCoachMe();
    }
  });

  for (const [index, promptText] of PROMPTS.entries()) {
    test(`prompt ${index + 1} should return a usable answer: "${promptText}"`, async ({ page }, testInfo) => {
      test.setTimeout(600000);

      const httpErrors = watchHttpErrors(page);

      // Conversations persist per opportunity, so clear rather than assume.
      await coach.ensureConversationEmpty();

      const started = Date.now();
      await coach.askSuggestedQuestion(promptText);

      await expect(coach.userMessages).toHaveCount(1);
      await expect(coach.userMessages.first()).toHaveText(promptText);
      await expect(coach.questionField).toHaveValue('');

      const answer = await coach.waitForAnswer();
      const seconds = Math.round((Date.now() - started) / 1000);

      await testInfo.attach(`answer-${index + 1}`, { body: answer, contentType: 'text/plain' });
      const mentionsCustomer = /inflexion/i.test(answer);
      console.log(
        `[FFA prompt ${index + 1}] ${seconds}s, ${answer.length} chars, mentions customer: ${mentionsCustomer}\n` +
          `   ${answer.replace(/\s+/g, ' ').slice(0, 160)}...`,
      );

      await expect(coach.assistantMessages).toHaveCount(1);
      expect(answer.length, `Answer was too short to be usable: ${JSON.stringify(answer)}`)
        .toBeGreaterThan(MIN_ANSWER_LENGTH);
      expect(answer, 'Answer contains a failure marker').not.toMatch(CoachMeModalPage.FAILURE_MARKERS);
      // Soft so a known content gap doesn't hide the remaining checks.
      expect.soft(answer, 'Answer reports missing source content').not.toMatch(CONTENT_GAP);
      expect.soft(answer, 'Answer contains an unfilled placeholder').not.toMatch(UNFILLED_PLACEHOLDER);
      expect.soft(answer, `Answer looks off-topic for "${promptText}"`).toMatch(EXPECTED_TOPIC[promptText]);

      await page.waitForTimeout(SETTLE_AFTER_ANSWER_MS);
      await coach.clearChat();
      await expect(coach.body).toContainText(CoachMeModalPage.EMPTY_STATE);

      expect(httpErrors, `Unexpected HTTP errors: ${JSON.stringify(httpErrors, null, 2)}`).toEqual([]);
    });
  }
});
