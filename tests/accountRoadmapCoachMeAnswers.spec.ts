import { test, expect } from './support/fixtures';
import { CustomerAccountPage } from '../pages/CustomerAccountPage';
import { CoachMeModalPage } from '../pages/CoachMeModalPage';
import { watchHttpErrors } from './support/httpErrors';
import { hasCredentials } from '../support/credentials';

/**
 * Account Roadmap — running every suggested question and checking its answer.
 *
 * One test case per suggested question. The Account Roadmap tab has a single
 * Coach Me button, and the prompts are a fixed set, so each question gets its
 * own named test rather than being a step inside one big test.
 *
 * Per question: click the prompt (which only fills the input) -> press "Ask" ->
 * wait for the answer -> check it -> wait 3s -> press "Clear chat".
 *
 * That is 8 real AI runs, so a full pass takes roughly 5-8 minutes. Kept
 * separate from accountRoadmapCoachMe.spec.ts, which only checks the prompt
 * text and runs in ~12s.
 *
 * WHAT IS ASSERTED: the answers are non-deterministic generated prose, so the
 * assertions cover properties that must hold for ANY valid answer — the run
 * completes, the question is echoed back verbatim, exactly one answer is
 * produced, it is substantial, and it carries no failure marker. Each answer is
 * attached to the HTML report for human review.
 */

const CUSTOMER = { id: '0009626222', name: 'Ballyvesey Industries Ltd' };
const PROMPTS = CoachMeModalPage.ROADMAP_QUESTIONS;
const MODAL_TITLE = 'Account Roadmap Coach';

/** A usable answer is well past this; catches empty/stub responses. */
const MIN_ANSWER_LENGTH = 200;

/** Requested settle time between an answer landing and clearing the chat. */
const SETTLE_AFTER_ANSWER_MS = 3000;

test.describe(`Account Roadmap Coach answers — ${CUSTOMER.name}`, () => {
  // Default (not serial): each question is independent, so one failure must not
  // hide the remaining questions.
  test.describe.configure({ mode: 'default' });

  let account: CustomerAccountPage;
  let coach: CoachMeModalPage;

  test.beforeAll(async ({ sharedPage }) => {
    if (!hasCredentials()) return; // tests skip below
    test.setTimeout(180000);
    account = new CustomerAccountPage(sharedPage);
    coach = new CoachMeModalPage(sharedPage);
    await account.goto(CUSTOMER.id);
    await account.openAccountRoadmapTab();
    await account.openRoadmapCoachMe();
    await coach.waitForOpen();
    await expect(coach.title).toHaveText(MODAL_TITLE);
  });

  // Self-healing: a question that failed mid-run would otherwise leave the modal
  // closed or the conversation dirty and break every question after it.
  test.beforeEach(async () => {
    test.skip(
      !hasCredentials(),
      'Credentials must be set (AICoach_MICROSOFT_EMAIL/AICoach_MICROSOFT_PASSWORD or EMAIL/PASSWORD)',
    );

    if (!(await coach.panel.isVisible().catch(() => false))) {
      await account.openAccountRoadmapTab();
      await account.openRoadmapCoachMe();
      await coach.waitForOpen();
    }
    // Conversations persist per section, so a previous run that died mid-answer
    // would leave this one dirty. Clear rather than assume.
    await coach.ensureConversationEmpty();
  });

  for (const [index, promptText] of PROMPTS.entries()) {
    test(`prompt ${index + 1} should return a usable answer: "${promptText}"`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(600000); // a single answer has been observed at ~15-70s

      const httpErrors = watchHttpErrors(page);

      const started = Date.now();
      await coach.askSuggestedQuestion(promptText);

      // The question is echoed in verbatim and submitting empties the input.
      await expect(coach.userMessages).toHaveCount(1);
      await expect(coach.userMessages.first()).toHaveText(promptText);
      await expect(coach.questionField).toHaveValue('');

      const answer = await coach.waitForAnswer();
      const seconds = Math.round((Date.now() - started) / 1000);

      // Keep the full answer with the run for human review.
      await testInfo.attach(`roadmap-q${index + 1}`, {
        body: `Q: ${promptText}\n\n${answer}`,
        contentType: 'text/plain',
      });
      console.log(
        `[roadmap Q${index + 1}] ${seconds}s, ${answer.length} chars — ${promptText}\n` +
          `   ${answer.replace(/\s+/g, ' ').slice(0, 140)}...`,
      );

      // Exactly one answer for one question — no duplicated or dropped turn.
      await expect(coach.assistantMessages).toHaveCount(1);
      expect(answer.length, `Answer was too short to be usable: ${JSON.stringify(answer)}`)
        .toBeGreaterThan(MIN_ANSWER_LENGTH);
      expect(answer, 'Answer contains a failure marker').not.toMatch(
        CoachMeModalPage.FAILURE_MARKERS,
      );

      // Let the answer settle, then reset the conversation for the next question.
      await page.waitForTimeout(SETTLE_AFTER_ANSWER_MS);
      await coach.clearChat();
      await expect(coach.body).toContainText(CoachMeModalPage.EMPTY_STATE);

      expect(httpErrors, `Unexpected HTTP errors: ${JSON.stringify(httpErrors, null, 2)}`).toEqual(
        [],
      );
    });
  }
});
