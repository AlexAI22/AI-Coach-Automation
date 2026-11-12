import { test, expect } from './support/fixtures';
import { CustomerAccountPage } from '../pages/CustomerAccountPage';
import { CoachMeModalPage } from '../pages/CoachMeModalPage';
import { watchHttpErrors } from './support/httpErrors';
import { hasCredentials } from '../support/credentials';
import { askAndCheckAnswer, CREDENTIALS_REQUIRED } from './support/coachMeAnswers';
import { expectFailureFromKnownIssue, KNOWN_ISSUES } from './support/knownIssues';

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

const CUSTOMER = { id: '0009626222', region: 'EMEA', name: 'Ballyvesey Industries Ltd' };
const OPPORTUNITY = 'Foundation Frontier Assessment';
const PROMPTS = CoachMeModalPage.SUGGESTED_QUESTIONS;

// DISABLED by default on request; opt in with `npm run test:opportunities:answers`
// (sets RUN_OPPORTUNITIES=1). @ai: every case triggers a real AI run.
test.describe(`Coach Me answers — ${CUSTOMER.name} / ${OPPORTUNITY}`, { tag: '@ai' }, () => {
  test.skip(!process.env.RUN_OPPORTUNITIES, 'Disabled by default; run with npm run test:opportunities:answers');
  // Default (not serial): each prompt is independent, so one failing prompt must
  // not hide the ones after it. Under serial, a single content gap on prompt 7
  // silently skipped prompt 8 entirely.
  test.describe.configure({ mode: 'default' });

  let account: CustomerAccountPage;
  let coach: CoachMeModalPage;

  // The Opportunities tab lost its Coach Me buttons (Nov 2026); the entry point is the FFA tab card.
  const openCoachMe = async (): Promise<void> => {
    await account.openTab('FFA');
    const button = account.ffaCard(OPPORTUNITY).getByRole('button', { name: 'Coach Me', exact: true });
    await expect(button).toBeEnabled({ timeout: 20000 });
    await button.click();
    await coach.waitForOpen();
  };

  test.beforeAll(async ({ sharedPage }) => {
    if (!hasCredentials()) return; // tests skip below
    test.setTimeout(180000);
    account = new CustomerAccountPage(sharedPage);
    coach = new CoachMeModalPage(sharedPage);
    await account.goto(CUSTOMER.id, CUSTOMER.region);
    await openCoachMe();
  });

  // Self-healing: a prompt that failed mid-answer would otherwise leave the
  // modal closed or the conversation dirty and break every prompt after it.
  test.beforeEach(async () => {
    test.skip(!hasCredentials(), CREDENTIALS_REQUIRED);

    if (!(await coach.panel.isVisible().catch(() => false))) {
      await openCoachMe();
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
   * staging, not a test defect, so the case runs with the same assertions as
   * every other prompt, but is marked EXPECTED TO FAIL (tests/support/knownIssues.ts).
   * Once the content lands it unexpectedly passes and turns red. Remove the
   * marker then.
   *
   * Do not "fix" it by lowering MIN_ANSWER_LENGTH or trimming FAILURE_MARKERS,
   * which would hide the gap instead of reporting it.
   */
  for (const [index, promptText] of PROMPTS.entries()) {
    test(`prompt ${index + 1} should return a usable answer: "${promptText}"`, async ({ page }, testInfo) => {
      test.setTimeout(600000); // a single answer has been observed to take ~2.5 min
      if (index + 1 === 7) expectFailureFromKnownIssue(KNOWN_ISSUES.advisoryMotionNotLoaded);

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

