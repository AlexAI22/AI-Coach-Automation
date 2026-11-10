import type { Page, TestInfo } from '@playwright/test';
import { expect } from './fixtures';
import { CoachMeModalPage } from '../../pages/CoachMeModalPage';

/**
 * Shared flow and checks for the Coach Me ANSWER suites (FFA, Expansion Plan,
 * Account Roadmap, Opportunities): ask one suggested question, wait for the
 * answer, check it, then clear the chat for the next prompt.
 *
 * Answers are non-deterministic prose, so the checks cover properties every
 * valid answer must have (completes, question echoed verbatim, exactly one
 * answer, substantial length, no failure marker). Content-gap, placeholder and
 * topic checks are always SOFT so they flag issues without masking the rest.
 * The full answer is attached to the HTML report.
 */

/** A usable coaching answer is well past this; catches empty/stub responses. */
export const MIN_ANSWER_LENGTH = 200;

/** Settle time between an answer landing and clearing the chat. */
export const SETTLE_AFTER_ANSWER_MS = 3000;

/**
 * Content gaps the generic FAILURE_MARKERS miss. Observed on staging: the FFA
 * outcomes/deliverables prompt declines because "The matched Service Catalogue
 * entry is not loaded" (passes the length/marker checks).
 */
export const CONTENT_GAP = /service catalogue entry (is )?not loaded|no matched service catalogue entry/i;

/**
 * Unfilled placeholders in user-facing copy (e.g. "please reach out to TBC").
 * Square-bracket slots like "[Contact name]" are excluded — email drafts use
 * them by design.
 */
export const UNFILLED_PLACEHOLDER = /\b(TBC|TBD|TODO|lorem ipsum)\b/;

export const CREDENTIALS_REQUIRED =
  'Credentials must be set (AICoach_MICROSOFT_EMAIL/AICoach_MICROSOFT_PASSWORD or EMAIL/PASSWORD)';

export type AskAndCheckOptions = {
  /** Zero-based prompt index; reported as Q1, Q2, ... */
  index: number;
  prompt: string;
  /** Log prefix identifying the suite, e.g. "FFA". */
  label: string;
  /** Customer name; the log notes whether the answer mentions its first word. */
  customerName: string;
  /** What an on-topic answer must mention (soft check). Omit to skip. */
  topic?: RegExp;
  /** Extra context written above the answer in the report attachment. */
  attachmentContext?: string;
  /**
   * true: every check after the question is echoed is soft, so one bad answer
   * does not stop the remaining prompts of a single-test suite. false: the core
   * answer checks are hard (one test per prompt).
   */
  allSoft: boolean;
};

/** Asks one suggested question, checks the answer, and clears the chat. Returns the answer. */
export async function askAndCheckAnswer(
  page: Page,
  coach: CoachMeModalPage,
  testInfo: TestInfo,
  opts: AskAndCheckOptions,
): Promise<string> {
  const { index, prompt, label, customerName, topic, attachmentContext, allSoft } = opts;
  const q = `Q${index + 1}`;
  const check = allSoft ? expect.soft : expect;

  // Conversations persist per opportunity/plan/section, so clear rather than assume.
  await coach.ensureConversationEmpty();

  const started = Date.now();
  await coach.askSuggestedQuestion(prompt);

  await expect(coach.userMessages).toHaveCount(1);
  await check(coach.userMessages.first()).toHaveText(prompt);
  await check(coach.questionField).toHaveValue('');

  const answer = await coach.waitForAnswer();
  const seconds = Math.round((Date.now() - started) / 1000);

  await testInfo.attach(`answer-${index + 1}`, {
    body: [attachmentContext, `Q: ${prompt}`, answer].filter(Boolean).join('\n\n'),
    contentType: 'text/plain',
  });
  const mentionsCustomer = new RegExp(customerName.split(' ')[0], 'i').test(answer);
  console.log(
    `[${label} prompt ${index + 1}] ${seconds}s, ${answer.length} chars, mentions customer: ${mentionsCustomer}\n` +
      `   ${answer.replace(/\s+/g, ' ').slice(0, 160)}...`,
  );

  await check(coach.assistantMessages).toHaveCount(1);
  check(answer.length, `${q}: answer was too short to be usable: ${JSON.stringify(answer)}`)
    .toBeGreaterThan(MIN_ANSWER_LENGTH);
  check(answer, `${q}: answer contains a failure marker`).not.toMatch(CoachMeModalPage.FAILURE_MARKERS);
  expect.soft(answer, `${q}: answer reports missing source content`).not.toMatch(CONTENT_GAP);
  expect.soft(answer, `${q}: answer contains an unfilled placeholder`).not.toMatch(UNFILLED_PLACEHOLDER);
  if (topic) {
    expect.soft(answer, `${q}: answer looks off-topic for "${prompt}"`).toMatch(topic);
  }

  await page.waitForTimeout(SETTLE_AFTER_ANSWER_MS);
  await coach.clearChat();
  await expect(coach.body).toContainText(CoachMeModalPage.EMPTY_STATE);

  return answer;
}
