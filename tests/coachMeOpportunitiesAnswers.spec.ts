import { test, expect } from './support/fixtures';
import { CustomerAccountPage } from '../pages/CustomerAccountPage';
import { CoachMeModalPage } from '../pages/CoachMeModalPage';
import { watchHttpErrors } from './support/httpErrors';
import { hasCredentials } from '../support/credentials';
import { askAndCheckAnswer, CREDENTIALS_REQUIRED } from './support/coachMeAnswers';

/**
 * Coach Me — running every suggested question and checking its answer.
 *
 * The per-prompt flow and answer checks live in tests/support/coachMeAnswers.ts.
 * Here the core checks are HARD (one test per prompt); content-gap and
 * placeholder checks are soft.
 *
 * SEPARATE FROM coachMeOpportunities.spec.ts ON PURPOSE. That suite only checks
 * the prompts are displayed and runs in ~20s; this one triggers eight real AI
 * runs at roughly 2-3 minutes each, so a full pass takes 20+ minutes. Keeping
 * them apart means the cheap checks stay cheap.
 */

const CUSTOMER = { id: '0009626222', name: 'Ballyvesey Industries Ltd' };
const OPPORTUNITY = 'Foundation Frontier Assessment';
const PROMPTS = CoachMeModalPage.SUGGESTED_QUESTIONS;

// DISABLED on request (it used to be commented out in full). Skipped rather than
// commented out so it keeps compiling against the page objects; remove `.skip`
// to re-enable.
test.describe.skip(`Coach Me answers — ${CUSTOMER.name} / ${OPPORTUNITY}`, () => {
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
    test.skip(!hasCredentials(), CREDENTIALS_REQUIRED);

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

      await askAndCheckAnswer(page, coach, testInfo, {
        index,
        prompt: promptText,
        label: 'Opportunities',
        customerName: CUSTOMER.name,
        allSoft: false,
      });

      expect(httpErrors, `Unexpected HTTP errors: ${JSON.stringify(httpErrors, null, 2)}`).toEqual([]);
    });
  }
});

