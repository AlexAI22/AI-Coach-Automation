import { Page, Locator, expect } from '@playwright/test';

/**
 * "AI Coach" (Coach Me) modal, opened from an opportunity card's "Coach Me"
 * button on the customer account page.
 *
 * Layout (verified against staging):
 *   Positioner (fixed overlay)
 *     Panel
 *       Title                -> "AI Coach — <opportunity>" + "Close modal" X
 *       SuggestedPrepSteps   -> a "Suggested Questions" disclosure header (a
 *                               button carrying aria-expanded plus a chevron)
 *                               and one button per prompt
 *       ContextBanner        -> "Session ready · <customer>"
 *       Body                 -> the conversation area
 *       Footer / QuestionInput -> "Ask a custom question:" input + "Ask" button
 *
 * NOTE: the modal has no role="dialog", so everything is located through the
 * data-sentry-component hooks rather than ARIA roles.
 */
export class CoachMeModalPage {
  readonly page: Page;

  readonly positioner: Locator;
  readonly panel: Locator;
  readonly title: Locator;
  readonly closeModalButton: Locator;

  /** The "Suggested Questions" side panel. */
  readonly suggestedQuestions: Locator;
  /** The "Suggested Questions" header label inside that panel. */
  readonly suggestedQuestionsHeader: Locator;
  /**
   * The panel's own header row, which is a disclosure BUTTON: it carries
   * aria-expanded and a chevron, and its only text is the header label.
   */
  readonly suggestedQuestionsDisclosure: Locator;
  /**
   * Toggle next to the conversation area, which collapses and restores the
   * WHOLE panel. Its label flips with the panel state: "Hide" while open,
   * "Show" once collapsed (both rendered uppercase by CSS).
   *
   * The collapsed label used to be "Suggested Questions"; the app changed it to
   * "Show" in Aug 2026. A locator matching only the old pair finds nothing once
   * the panel is collapsed, so expandSuggestedQuestions() could never click
   * anything and the panel stayed shut.
   */
  readonly suggestedQuestionsToggle: Locator;

  /**
   * The suggested-question prompt buttons, in render order.
   *
   * TWO other buttons live in the panel and must stay out of this list:
   *   - the "Suggested Questions" disclosure header -> has aria-expanded
   *   - the collapse X                              -> has an aria-label
   *
   * Excluding aria-label alone used to be enough. The disclosure header has
   * neither an aria-label nor a data-sentry-component of its own, so once the
   * app made the header row a button it silently joined this list and every
   * toHaveText(EXPECTED_PROMPTS) failed with "Suggested Questions" prepended
   * to the received array. The prompt buttons carry neither attribute.
   */
  readonly prompts: Locator;

  readonly contextBanner: Locator;
  readonly body: Locator;
  readonly footer: Locator;
  readonly questionInput: Locator;
  readonly questionField: Locator;
  readonly askButton: Locator;

  /** Toolbar actions above the conversation. */
  readonly clearChatButton: Locator;
  readonly downloadConversationButton: Locator;

  /** Conversation turns. */
  readonly userMessages: Locator;
  readonly assistantMessages: Locator;

  /** Empty-state copy shown before anything has been asked. */
  static readonly EMPTY_STATE = 'Ask a question or choose a suggested prompt below to get started.';

  /**
   * Markers of a failed/degraded AI run. Kept deliberately specific: loose
   * words like "error" or "unable to" legitimately occur in coaching prose.
   */
  static readonly FAILURE_MARKERS =
    /something went wrong|an error occurred|failed to generate|please try again|service unavailable|rate limit|internal server error|is not yet available|has not been loaded/i;

  /**
   * The suggested-question prompts offered for an opportunity, in render order.
   * These are the opportunity coaching prompts — they are the same set for
   * every opportunity, not customer-specific.
   */
  static readonly SUGGESTED_QUESTIONS = [
    'What are the client outcomes / deliverables from this opportunity?',
    'Why is this opportunity recommended for this client?',
    // NOTE: a curly apostrophe (U+2019) in "we’ve" — not a straight quote.
    'How should I pitch this as a continuation of the roadmap we’ve developed for my client?',
    'How should I write an email to introduce this opportunity?',
    'What objections might the client raise and how should I respond?',
    'Can you help me draft a blue sheet for this opportunity?',
    'How should I engage with Microsoft for this offer?',
    'What do I need to do to get Microsoft funding for this opportunity?',
  ];

  /**
   * The PREVIOUS opportunity prompt set, replaced wholesale by the app in
   * Aug 2026 (7 prompts -> the 8 above; every one reworded). Kept only as a
   * record of what the suite used to assert — nothing references it.
   *
   *   Can you draft a Pursuit Plan for this opportunity?
   *   Can you draft Deal Plan discovery questions to qualify this opportunity?
   *   How should I position this opportunity in my next conversation?
   *   What objections should I expect and how do I handle them?
   *   What is the best way to move this to the next sales stage?
   *   How do I build urgency around this opportunity?
   *   What proof points or case studies should I bring up?
   */

  /**
   * The suggested questions offered by the "Expansion Coach" modal, opened from
   * a Coach Me button on the Expansion Plan tab, in render order. This is a
   * different (shorter) set than the opportunity prompts above, and is the same
   * for every expansion plan.
   */
  static readonly EXPANSION_QUESTIONS = [
    'Why is this expansion recommended for this client?',
    'How should I pitch this to my client?',
    'How should I write an email to introduce this expansion to my client?',
    'What objections might the client raise and how best should I respond?',
  ];

  /**
   * The suggested questions offered by the "Account Roadmap Coach" modal,
   * opened from the single Coach Me button on the Account Roadmap tab, in
   * render order. A third, longer set — the panel scrolls to fit them.
   */
  static readonly ROADMAP_QUESTIONS = [
    'Can you draft a Pursuit Plan for this account based on the context above?',
    'Can you draft Deal Plan discovery questions for my first customer conversation?',
    'What are the biggest issues or pain points I should be probing for with this client?',
    'What discovery questions should I ask in the first client conversation?',
    'How should I structure the first discovery meeting?',
    'How do I translate what I heard in discovery into actionable recommendations?',
    "What's a good structure for presenting the roadmap back to the client?",
    'How do I handle it when the client pushes back on a recommendation?',
  ];

  constructor(page: Page) {
    this.page = page;

    this.positioner = page.locator('[data-sentry-component="Positioner"]');
    this.panel = page.locator('[data-sentry-component="Panel"]');
    this.title = page.locator('[data-sentry-component="Title"]');
    this.closeModalButton = this.title.getByRole('button', { name: 'Close modal' });

    this.suggestedQuestions = page.locator('[data-sentry-component="SuggestedPrepSteps"]');
    // Matched case-insensitively: the DOM text is "Suggested Questions", shown
    // uppercase via CSS.
    this.suggestedQuestionsHeader = this.suggestedQuestions.getByText(/^suggested questions$/i);
    // Restricted to buttons OUTSIDE SuggestedPrepSteps: the panel's own
    // disclosure header also reads "Suggested Questions", so a Panel-wide text
    // match resolves to two elements and fails strict mode on click.
    this.suggestedQuestionsToggle = this.panel
      .locator('button:not([data-sentry-component="SuggestedPrepSteps"] *)')
      .filter({ hasText: /^\s*(hide|show)\s*$/i });

    this.suggestedQuestionsDisclosure = this.suggestedQuestions.locator('button[aria-expanded]');
    this.prompts = this.suggestedQuestions.locator('button:not([aria-expanded]):not([aria-label])');

    this.contextBanner = page.locator('[data-sentry-component="ContextBanner"]');
    this.body = page.locator('[data-sentry-component="Body"]');
    this.footer = page.locator('[data-sentry-component="Footer"]');
    this.questionInput = page.locator('[data-sentry-component="QuestionInput"]');
    this.questionField = this.questionInput.getByRole('textbox');
    this.askButton = this.questionInput.getByRole('button', { name: 'Ask' });

    this.clearChatButton = this.panel.getByRole('button', { name: /clear chat/i });
    this.downloadConversationButton = this.panel.getByRole('button', { name: /download conversation/i });

    this.userMessages = page.locator('[data-sentry-component="UserMessage"]');
    this.assistantMessages = page.locator('[data-sentry-component="AssistantMessage"]');
  }

  /** A single prompt button, located by its exact text. */
  prompt(text: string): Locator {
    return this.suggestedQuestions.getByRole('button', { name: text, exact: true });
  }

  /** The rendered prompt texts, in order. */
  async promptTexts(): Promise<string[]> {
    return (await this.prompts.allInnerTexts()).map((t) => t.trim());
  }

  /** Waits until the modal and its suggested-questions panel are rendered. */
  async waitForOpen(): Promise<void> {
    await expect(this.panel).toBeVisible({ timeout: 30000 });
    await expect(this.suggestedQuestions).toBeVisible({ timeout: 30000 });
  }

  /** Closes the modal via the header X and waits for it to disappear. */
  async close(): Promise<void> {
    await this.closeModalButton.click();
    await expect(this.panel).toBeHidden();
  }

  /**
   * Collapses the whole suggested-questions panel via the Hide toggle.
   *
   * This used to click a "Close suggested questions" X inside the panel. The
   * app removed that button in Aug 2026, so the Hide/Show toggle beside the
   * conversation is the only control left that collapses the panel.
   *
   * MEASURED: the panel collapses to ZERO WIDTH but keeps its height, so the
   * container reports hidden while its children still have a box and still
   * count as "visible" to Playwright. Assert on the container, never on the
   * individual prompt buttons.
   */
  async collapseSuggestedQuestions(): Promise<void> {
    await this.suggestedQuestionsToggle.click();
    await expect(this.suggestedQuestions).toBeHidden();
  }

  /** Re-opens the collapsed panel via the same toggle, now reading "Show". */
  async expandSuggestedQuestions(): Promise<void> {
    await this.suggestedQuestionsToggle.click();
    await expect(this.suggestedQuestions).toBeVisible();
  }

  /**
   * Collapses just the PROMPT LIST via the panel's disclosure header, leaving
   * the panel itself on screen: the prompt count drops to 0 and aria-expanded
   * flips to "false". Reversible by calling it again.
   */
  async togglePromptList(): Promise<void> {
    await this.suggestedQuestionsDisclosure.click();
  }

  /**
   * Submits a suggested question.
   *
   * Clicking a prompt does NOT ask it — it only populates the custom-question
   * input (which is what enables "Ask"). The question is sent by pressing Ask.
   */
  async askSuggestedQuestion(text: string): Promise<void> {
    await this.prompt(text).click();
    // The click's whole visible effect: the prompt lands in the input verbatim.
    await expect(this.questionField).toHaveValue(text);
    await expect(this.askButton).toBeEnabled();
    await this.askButton.click();
  }

  /**
   * Waits for the assistant's answer and returns its text.
   *
   * The answer is not streamed token-by-token — it appears in one go — but the
   * length is still polled to a standstill so a partial render cannot be
   * mistaken for a finished answer. "Ask" is NOT a completion signal: it goes
   * back to disabled because submitting clears the input.
   */
  async waitForAnswer(timeout = 420000): Promise<string> {
    const answer = this.assistantMessages.last();
    await answer.waitFor({ state: 'visible', timeout });

    let previous = -1;
    for (let stable = 0; stable < 3; ) {
      await this.page.waitForTimeout(2000);
      const length = (await answer.innerText()).length;
      stable = length === previous ? stable + 1 : 0;
      previous = length;
    }
    return (await answer.innerText()).trim();
  }

  /**
   * Guarantees an empty conversation, clearing one if it is already there.
   *
   * Conversations PERSIST per opportunity/expansion plan: reopening a Coach Me
   * modal restores whatever was last asked, so a run that failed mid-question
   * leaves that plan dirty for every later run. Asserting "starts empty" is
   * therefore wrong — the suite has to clear rather than assume.
   */
  async ensureConversationEmpty(): Promise<void> {
    const stale =
      (await this.userMessages.count()) > 0 || (await this.assistantMessages.count()) > 0;
    if (stale) {
      await this.clearChat();
    }
    await expect(this.body).toContainText(CoachMeModalPage.EMPTY_STATE);
  }

  /** Empties the conversation so the next question starts from a clean slate. */
  async clearChat(): Promise<void> {
    await this.clearChatButton.click();
    // Some builds ask for confirmation; accept it if a dialog appears.
    const confirm = this.page.getByRole('button', { name: /^(clear|confirm|yes)\b/i });
    if (await confirm.first().isVisible().catch(() => false)) {
      await confirm.first().click();
    }
    await expect(this.userMessages).toHaveCount(0, { timeout: 30000 });
    await expect(this.assistantMessages).toHaveCount(0, { timeout: 30000 });
  }
}
