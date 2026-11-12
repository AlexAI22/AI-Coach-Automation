import { test } from '@playwright/test';

/**
 * Known PRODUCT issues on staging that some tests reproduce.
 *
 * A test that hits one of these is marked EXPECTED TO FAIL instead of being left
 * red. That keeps the run green while the bug is open, so a NEW regression is not
 * lost among the standing failures, and it still reports the bug: the HTML
 * report shows a "known issue" annotation on the test. The day the product is
 * fixed, the test unexpectedly PASSES, which Playwright reports as a failure:
 * that is the cue to delete the entry here.
 *
 * Do not loosen a check to make a known issue pass. Mark it here instead.
 *
 * Expected failures are never retried, so they also no longer cost minutes of
 * AI runs per attempt on CI.
 *
 * `ticket`: set it to the bug's tracker key/URL once one is raised; it is shown
 * in the report next to the summary.
 */
export type KnownIssue = {
  summary: string;
  ticket?: string;
};

export const KNOWN_ISSUES = {
  serviceCatalogueNotLoaded: {
    summary:
      'FFA "outcomes and deliverables" answer declines: "The matched Service Catalogue entry is not loaded" (staging content gap).',
  },
  advisoryMotionNotLoaded: {
    summary:
      '"How should I engage with Microsoft for this offer?" answers only "Advisory Motion training content has not been loaded" (~140 chars).',
  },
  fundingReplyPlaceholder: {
    summary: 'Canned Microsoft funding reply ends "please reach out to TBC" (unfilled placeholder).',
  },
  expansionMaterials404: {
    summary:
      'Each new Expansion Coach session requests GET /csm/coach-sessions/expansion_coach/<sessionId>/materials, which returns 404 (the FFA equivalent succeeds).',
  },
} satisfies Record<string, KnownIssue>;

function describeIssue(issue: KnownIssue): string {
  return issue.ticket ? `${issue.ticket}: ${issue.summary}` : issue.summary;
}

/** Records the known issue on the current test's report entry. */
export function annotateKnownIssue(issue: KnownIssue): void {
  test.info().annotations.push({ type: 'known issue', description: describeIssue(issue) });
}

/**
 * Marks the WHOLE current test as expected to fail because of `issue`.
 *
 * Use it only when the issue is what the test checks. Any failure then counts
 * as expected, including an unrelated one, so for a test that checks several
 * things, use expectKnownIssueStillPresent() on the affected check instead.
 */
export function expectFailureFromKnownIssue(issue: KnownIssue): void {
  annotateKnownIssue(issue);
  test.fail(true, describeIssue(issue));
}

/**
 * Narrow alternative to expectFailureFromKnownIssue(), for tests that check
 * several things: only the known symptom is tolerated, and every other check
 * stays hard. Pass whether the symptom was observed. If it was, the issue is
 * annotated; if it was not, the test FAILS with a message saying the issue looks
 * fixed and its marker should be removed.
 */
export function expectKnownIssueStillPresent(issue: KnownIssue, observed: boolean): void {
  annotateKnownIssue(issue);
  if (!observed) {
    throw new Error(
      `Known issue no longer reproduces; it looks fixed. Remove its marker (tests/support/knownIssues.ts): ${describeIssue(issue)}`,
    );
  }
}
