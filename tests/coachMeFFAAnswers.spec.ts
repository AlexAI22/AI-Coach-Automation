import { test, expect } from './support/fixtures';
import { CustomerAccountPage } from '../pages/CustomerAccountPage';
import { CoachMeModalPage } from '../pages/CoachMeModalPage';
import { watchHttpErrors } from './support/httpErrors';
import { hasCredentials } from '../support/credentials';
import { askAndCheckAnswer, CREDENTIALS_REQUIRED } from './support/coachMeAnswers';
import { expectFailureFromKnownIssue, KNOWN_ISSUES, type KnownIssue } from './support/knownIssues';

/**
 * Coach Me — FFA: run every suggested question and check the agent's answer.
 *
 * Flow per prompt and the answer checks live in tests/support/coachMeAnswers.ts.
 * Here the core checks are HARD (one test per prompt); content-gap, placeholder
 * and topic checks are soft.
 *
 * Separate from coachMeFFA.spec.ts on purpose: that suite is read-only and runs
 * in seconds; this one triggers eight real AI runs (~2-3 min each).
 */

const CUSTOMER = { id: '0009623781', region: 'EMEA', name: 'Inflexion Buyout V Investments LP' };
const OPPORTUNITY = 'Foundation Frontier Assessment';
const PROMPTS = CoachMeModalPage.SUGGESTED_QUESTIONS;

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

/**
 * Prompts that fail because of a known staging PRODUCT issue, keyed by 1-based
 * prompt number. These cases are marked expected-to-fail (see
 * tests/support/knownIssues.ts), so they keep the run green and are not retried.
 * When the content is fixed, the case unexpectedly passes and turns red. Delete
 * its entry here then. Do not loosen the checks to make these pass.
 */
const KNOWN_ISSUE_BY_PROMPT: Partial<Record<number, KnownIssue>> = {
  1: KNOWN_ISSUES.serviceCatalogueNotLoaded, // no outcomes/deliverables (soft content-gap check)
  7: KNOWN_ISSUES.advisoryMotionNotLoaded, // ~140 chars: length floor + failure markers
  8: KNOWN_ISSUES.fundingReplyPlaceholder, // "please reach out to TBC" (soft placeholder check)
};

// @ai: every case triggers a real AI run, so CI keeps it out of the per-push smoke.
test.describe(`Coach Me answers — FFA — ${CUSTOMER.name}`, { tag: '@ai' }, () => {
  // Not serial: one failing prompt must not skip the prompts after it.
  test.describe.configure({ mode: 'default' });

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
    test.skip(!hasCredentials(), CREDENTIALS_REQUIRED);
    if (!(await coach.panel.isVisible().catch(() => false))) {
      await openFfaCoachMe();
    }
  });

  for (const [index, promptText] of PROMPTS.entries()) {
    test(`prompt ${index + 1} should return a usable answer: "${promptText}"`, async ({ page }, testInfo) => {
      test.setTimeout(600000);
      const knownIssue = KNOWN_ISSUE_BY_PROMPT[index + 1];
      if (knownIssue) expectFailureFromKnownIssue(knownIssue);

      const httpErrors = watchHttpErrors(page);

      await askAndCheckAnswer(page, coach, testInfo, {
        index,
        prompt: promptText,
        label: 'FFA',
        customerName: CUSTOMER.name,
        topic: EXPECTED_TOPIC[promptText],
        allSoft: false,
      });

      expect(httpErrors, `Unexpected HTTP errors: ${JSON.stringify(httpErrors, null, 2)}`).toEqual([]);
    });
  }
});
