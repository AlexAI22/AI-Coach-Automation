import { Page, Locator, expect } from '@playwright/test';

/** Fields accepted by the draft-chat form (all agent-specific ones optional). */
export type DraftChatOptions = {
  chatName: string;
  /** Customer Profile: News Recency (days). */
  newsRecency?: number;
  /** RFx Responder: an option in the required "response structure" multi-select. */
  responseStructure?: string;
  /** Upsell & Cross Sell: path to a transcript file for the required upload. */
  transcriptFile?: string;
};

/**
 * Project view (agent selection) and the draft-chat form that opens when an
 * agent is chosen. Reached from the Sales Coach sidebar:
 *   Sales Coach → select project → pick an agent card → fill form → Create chat
 *
 * Selecting an agent navigates to /sales-coach/project/chat/draft?...&team=<Agent>
 * and renders the DraftChatForm. Submitting creates the chat and navigates to
 * /sales-coach/project/chat?...&chat_id=<id>, where the agent run then streams
 * its response.
 */
export class DraftChatPage {
  readonly page: Page;
  /** Chat name field in the draft-chat form */
  readonly chatNameInput: Locator;
  /** News Recency (days) field (a number spinbutton) */
  readonly newsRecencyInput: Locator;
  /** Prompt selector (carries a default prompt) */
  readonly promptSelector: Locator;
  /** Submit button */
  readonly createChatButton: Locator;
  /**
   * "Refine" button in the chat header — present once the chat has been created
   * and the agent run has produced a response.
   */
  readonly refineButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.chatNameInput = page.getByLabel(/chat name/i);
    this.newsRecencyInput = page.getByLabel(/news recency/i);
    this.promptSelector = page.locator('[data-sentry-component="PromptSelector"]');
    this.createChatButton = page.getByRole('button', { name: 'Create chat' });
    this.refineButton = page.getByRole('button', { name: 'Refine' });
  }

  /**
   * Agent card located by its title heading (e.g. "Customer Profile").
   * Filtering on the exact heading avoids matching other cards (including the
   * Legacy agents) whose description merely mentions the same words.
   */
  agentCard(name: string): Locator {
    return this.page
      .locator('[data-sentry-component="AgentCard"]')
      .filter({ has: this.page.getByRole('heading', { name, exact: true }) });
  }

  /** Opens the draft-chat form for the named agent. */
  async openAgent(name: string): Promise<void> {
    await this.agentCard(name).click();
    await expect(this.page).toHaveURL(/\/sales-coach\/project\/chat\/draft/);
    await expect(this.chatNameInput).toBeVisible();
  }

  /**
   * Completes the required draft-chat fields. The prompt always carries a
   * default; the remaining fields are agent-specific:
   *  - `newsRecency`        — Customer Profile only (a number spinbutton).
   *  - `responseStructure`  — RFx Responder only (required multi-select).
   *  - `transcriptFile`     — Upsell & Cross Sell only (required file upload).
   */
  async fillDraftChat(opts: DraftChatOptions): Promise<void> {
    await this.chatNameInput.fill(opts.chatName);
    if (opts.newsRecency !== undefined) {
      await this.newsRecencyInput.fill(String(opts.newsRecency));
    }
    if (opts.responseStructure) {
      await this.selectResponseStructure(opts.responseStructure);
    }
    if (opts.transcriptFile) {
      await this.uploadTranscript(opts.transcriptFile);
    }
  }

  /**
   * Picks an option in the RFx Responder "Select the structure for your
   * response" multi-select. The listbox is a portal (options render at the end
   * of the document), so it is closed with Escape afterwards.
   */
  async selectResponseStructure(option: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Select options' }).click();
    await this.page.getByRole('option', { name: option, exact: true }).click();
    await this.page.keyboard.press('Escape');
  }

  /** Uploads a transcript file (Upsell & Cross Sell requires one). */
  async uploadTranscript(filePath: string): Promise<void> {
    await this.page.locator('input[type="file"]').setInputFiles(filePath);
  }

  /** Submits the draft-chat form. */
  async createChat(): Promise<void> {
    await this.createChatButton.click();
  }

  /**
   * Waits for the chat to be created. Submitting the draft form keeps the same
   * .../project/chat/draft URL but replaces the "Create chat" button with the
   * inline agent-progress steps (Setting up chat → … → Almost ready) while the
   * run executes, so the button disappearing is the "run started" signal.
   */
  async waitForChatCreated(): Promise<void> {
    await expect(this.createChatButton).toBeHidden({ timeout: 30000 });
  }

  /**
   * Waits for the agent run to finish. When the run completes the app navigates
   * from the draft form to the created chat (.../project/chat?...&chat_id=<id>)
   * and renders the response with a "Refine" action in the header. Takes
   * ~2 minutes in practice.
   */
  async waitForAgentRunToFinish(timeoutMs = 360000): Promise<void> {
    // Race the successful navigation against a run failure so a backend error
    // (e.g. a 504 while generating the response) fails fast with a clear
    // message instead of silently timing out.
    const errorBanner = this.page.getByText(/Failed to create response/i);
    const outcome = await Promise.race([
      this.page
        .waitForURL(/\/sales-coach\/project\/chat\?[^#]*chat_id=/, { timeout: timeoutMs })
        .then(() => 'created' as const),
      errorBanner
        .waitFor({ state: 'visible', timeout: timeoutMs })
        .then(() => 'failed' as const),
    ]);

    if (outcome === 'failed') {
      const message = (await errorBanner.textContent())?.trim() || 'unknown error';
      throw new Error(`Agent run failed before the chat was created: "${message}"`);
    }

    await expect(this.refineButton).toBeVisible({ timeout: 30000 });
  }

  /**
   * Full create-chat flow for an agent: open the agent card, complete the draft
   * form, submit, and wait for the chat to be created and the run to finish.
   *
   * Returns the chat name as actually stored — the Chat name field caps input
   * at 50 characters, so a long requested name (e.g. for "Upsell & Cross Sell")
   * is truncated. Callers should use the returned value to locate the chat.
   */
  async createChatForAgent(agentName: string, opts: DraftChatOptions): Promise<string> {
    await this.openAgent(agentName);
    await this.fillDraftChat(opts);
    const actualChatName = await this.chatNameInput.inputValue();
    await this.createChat();
    await this.waitForChatCreated();
    await this.waitForAgentRunToFinish();
    return actualChatName;
  }
}
