import { Page, Locator, expect } from '@playwright/test';

/**
 * "AI Coach" (Coach Me) modal, opened from an opportunity card's "Coach Me"
 * button on the customer account page.
 *
 * Layout (verified against staging):
 *   Positioner (fixed overlay)
 *     Panel
 *       Title                -> "AI Coach — <opportunity>" + "Close modal" X
 *       SuggestedPrepSteps   -> "Suggested Questions" header, a "Close suggested
 *                               questions" X, and one button per prompt
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
  /** The X that collapses the side panel. */
  readonly closeSuggestedQuestionsButton: Locator;
  /**
   * Toggle next to the conversation area. Its label flips with the panel
   * state: "Hide" while the panel is open, "Suggested Questions" once it is
   * collapsed (both rendered uppercase by CSS).
   */
  readonly suggestedQuestionsToggle: Locator;

  /**
   * The suggested-question prompt buttons, in render order. The only other
   * button in the panel is the collapse X, which carries an aria-label.
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
    /something went wrong|an error occurred|failed to generate|please try again|service unavailable|rate limit|internal server error/i;

  /**
   * The suggested-question prompts offered for an opportunity, in render order.
   * These are the opportunity coaching prompts — they are the same set for
   * every opportunity, not customer-specific.
   */
  static readonly SUGGESTED_QUESTIONS = [
    'Can you draft a Pursuit Plan for this opportunity?',
    'Can you draft Deal Plan discovery questions to qualify this opportunity?',
    'How should I position this opportunity in my next conversation?',
    'What objections should I expect and how do I handle them?',
    'What is the best way to move this to the next sales stage?',
    'How do I build urgency around this opportunity?',
    'What proof points or case studies should I bring up?',
  ];

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
    this.closeSuggestedQuestionsButton = this.suggestedQuestions.getByRole('button', {
      name: 'Close suggested questions',
    });
    this.suggestedQuestionsToggle = this.panel
      .locator('button')
      .filter({ hasText: /^\s*(hide|suggested questions)\s*$/i });

    this.prompts = this.suggestedQuestions.locator('button:not([aria-label])');

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
   * Collapses the suggested-questions panel via its X.
   *
   * The panel collapses to zero width (its children keep a box and so still
   * count as "visible" to Playwright), which is why callers should assert on
   * the panel container rather than on the individual prompt buttons.
   */
  async collapseSuggestedQuestions(): Promise<void> {
    await this.closeSuggestedQuestionsButton.click();
    await expect(this.suggestedQuestions).toBeHidden();
  }

  /** Re-opens the collapsed panel via the "Suggested Questions" toggle. */
  async expandSuggestedQuestions(): Promise<void> {
    await this.suggestedQuestionsToggle.click();
    await expect(this.suggestedQuestions).toBeVisible();
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
