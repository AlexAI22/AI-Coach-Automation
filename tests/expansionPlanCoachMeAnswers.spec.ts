import { test, expect } from './support/fixtures';
import { CustomerAccountPage } from '../pages/CustomerAccountPage';
import { CoachMeModalPage } from '../pages/CoachMeModalPage';
import { watchHttpErrors } from './support/httpErrors';
import { hasCredentials } from '../support/credentials';

/**
 * Expansion Plan — running every suggested question against every Coach Me
 * button and checking the answer.
 *
 * One test case per expansion plan (per Coach Me button). Within a test, each of
 * the four suggested questions is asked in turn:
 *
 *   click the prompt (which only fills the input) -> press "Ask" -> wait for the
 *   answer -> check it -> wait 3s -> press "Clear chat"
 *
 * That is 4 real AI runs per plan and 20 across the suite, so a full pass takes
 * 15-25 minutes. Kept separate from expansionPlanCoachMe.spec.ts, which only
 * checks the prompt text and runs in ~13s.
 *
 * WHAT IS ASSERTED: the answers are non-deterministic generated prose, so the
 * assertions cover properties that must hold for ANY valid answer — the run
 * completes, the question is echoed back verbatim, exactly one answer is
 * produced, it is substantial, and it carries no failure marker. Each answer is
 * attached to the HTML report for human review.
 */

const CUSTOMER = { id: '0009626222', name: 'Ballyvesey Industries Ltd' };
const PROMPTS = CoachMeModalPage.EXPANSION_QUESTIONS;

/**
 * Number of expansion plans to generate test cases for. The plans are
 * AI-generated, so if the account regenerates a different number this constant
 * needs updating — each test fails with an explicit message saying so, and
 * expansionPlanCoachMe.spec.ts guards the count independently.
 */
const EXPECTED_PLAN_COUNT = 5;

/** A usable answer is well past this; catches empty/stub responses. */
const MIN_ANSWER_LENGTH = 200;

/** Requested settle time between an answer landing and clearing the chat. */
const SETTLE_AFTER_ANSWER_MS = 3000;

test.describe(`Expansion Plan Coach Me answers — ${CUSTOMER.name}`, () => {
  // Default (not serial): each plan is independent and reopens its own modal,
  // so one failing plan must not hide the other four.
  test.describe.configure({ mode: 'default' });

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

  // Self-healing: a test that failed mid-conversation would otherwise leave the
  // modal open and break every plan after it.
  test.beforeEach(async () => {
    test.skip(
      !hasCredentials(),
      'Credentials must be set (AICoach_MICROSOFT_EMAIL/AICoach_MICROSOFT_PASSWORD or EMAIL/PASSWORD)',
    );
    if (await coach.panel.isVisible().catch(() => false)) {
      await coach.close().catch(() => undefined);
    }
    await account.openExpansionPlanTab();
  });

  for (let planIndex = 0; planIndex < EXPECTED_PLAN_COUNT; planIndex++) {
    test(`expansion plan ${planIndex + 1}: every suggested question should return a usable answer`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(900000); // 4 AI runs, each observed at ~15-70s

      const httpErrors = watchHttpErrors(page);

      const listed = await account.expansionPlanCards.count();
      expect(
        planIndex,
        `Only ${listed} expansion plans are listed but this suite expects ${EXPECTED_PLAN_COUNT}. ` +
          'The plans are AI-generated — update EXPECTED_PLAN_COUNT if the account legitimately changed.',
      ).toBeLessThan(listed);

      const planTitle = (
        await account.expansionPlanCards.nth(planIndex).getByRole('heading').innerText()
      ).trim();
      testInfo.annotations.push({ type: 'expansion plan', description: planTitle });

      await account.openExpansionCoachMe(planIndex);
      await coach.waitForOpen();
      await expect(coach.title).toHaveText(`Expansion Coach — ${planTitle}`);

      // Conversations persist per plan, so a previous run that died mid-question
      // would otherwise leave this one dirty. Clear rather than assume.
      await coach.ensureConversationEmpty();

      for (const [promptIndex, promptText] of PROMPTS.entries()) {
        // A step per question so the report shows which one failed.
        await test.step(`Q${promptIndex + 1}: ${promptText}`, async () => {
          // Every question starts from an empty conversation, so each answer is
          // judged on its own rather than inheriting the previous one.
          await coach.ensureConversationEmpty();

          const started = Date.now();
          await coach.askSuggestedQuestion(promptText);

          // The question is echoed in verbatim and submitting empties the input.
          await expect(coach.userMessages).toHaveCount(1);
          await expect(coach.userMessages.first()).toHaveText(promptText);
          await expect(coach.questionField).toHaveValue('');

          const answer = await coach.waitForAnswer();
          const seconds = Math.round((Date.now() - started) / 1000);

          await testInfo.attach(`plan${planIndex + 1}-q${promptIndex + 1}`, {
            body: `${planTitle}\n\nQ: ${promptText}\n\n${answer}`,
            contentType: 'text/plain',
          });
          console.log(
            `[plan ${planIndex + 1} Q${promptIndex + 1}] ${seconds}s, ${answer.length} chars — ${promptText}\n` +
              `   ${answer.replace(/\s+/g, ' ').slice(0, 140)}...`,
          );

          await expect(coach.assistantMessages).toHaveCount(1);
          expect(answer.length, `Answer was too short to be usable: ${JSON.stringify(answer)}`)
            .toBeGreaterThan(MIN_ANSWER_LENGTH);
          expect(answer, 'Answer contains a failure marker').not.toMatch(
            CoachMeModalPage.FAILURE_MARKERS,
          );

          // Let the answer settle, then reset the conversation for the next one.
          await page.waitForTimeout(SETTLE_AFTER_ANSWER_MS);
          await coach.clearChat();
          await expect(coach.body).toContainText(CoachMeModalPage.EMPTY_STATE);
        });
      }

      await coach.close();

      expect(httpErrors, `Unexpected HTTP errors: ${JSON.stringify(httpErrors, null, 2)}`).toEqual(
        [],
      );
    });
  }
});
