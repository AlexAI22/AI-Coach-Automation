import { test, expect } from '@playwright/test';
import path from 'path';
import { SalesCoachPage } from '../pages/SalesCoachPage';
import { DraftChatPage, type DraftChatOptions } from '../pages/DraftChatPage';
import { AUTH_FILE } from '../global-setup';
import { watchHttpErrors } from './support/httpErrors';
import { hasCredentials } from '../support/credentials';

/**
 * Sales Coach flows against the real staging tenant.
 *
 * The session is established ONCE in global-setup.ts and reused here via
 * `storageState` — these tests do NOT log in (or out) per test; they start
 * already authenticated and navigate straight to the app.
 *
 * Tracing stays off: even a reused session's requests/snapshots can carry
 * account context, so no trace.zip / HTML-report artifact is produced here.
 */
test.use({ trace: 'off', storageState: AUTH_FILE });

test.describe('Sales Coach (reused session)', () => {
  // Default mode (not serial) so one failure does not skip the rest of the
  // group. Run with `--workers=1` to keep requests sequential against the slow,
  // shared-account staging backend.
  test.describe.configure({ mode: 'default' });

  let salesCoach: SalesCoachPage;

  test.beforeEach(async ({ page }) => {
    test.skip(
      !hasCredentials(),
      'Credentials must be set (AICoach_MICROSOFT_EMAIL/AICoach_MICROSOFT_PASSWORD or EMAIL/PASSWORD)',
    );
    salesCoach = new SalesCoachPage(page);
    // Reused auth session — land directly on Sales Coach, no login step.
    await page.goto('/sales-coach', { waitUntil: 'domcontentloaded' });
  });

  test('should reach the Sales Coach app without re-logging in', async ({ page }) => {
    await expect(page).toHaveURL(/\/sales-coach/, { timeout: 15000 });
    // Authenticated app shell renders the AI Coach logo (Logo.tsx).
    await expect(salesCoach.insightLogo).toBeAttached({ timeout: 15000 });
    // No login form is present in the authenticated app.
    await expect(page.getByRole('button', { name: 'Log in with email' })).toHaveCount(0);
  });

  test('should access the Sales Coach page', async () => {
    await salesCoach.dismissWelcomeDialog();
    await salesCoach.open();
    await salesCoach.isLoaded();
  });

  test('should show the Welcome to AI Coach personalisation modal and close it', async ({ page }) => {
    // The first-run personalisation onboarding modal appears with its heading.
    await expect(salesCoach.welcomeDialogHeading).toBeVisible({ timeout: 15000 });

    // Intro copy.
    await expect(salesCoach.welcomeDialogBody).toBeVisible();
    await expect(salesCoach.welcomeDialogBody).toContainText(
      'helps the AI give you better, more relevant insights',
    );

    // The onboarding steps are listed.
    for (const step of [
      'Role & practice area',
      'Territory & region',
      'Industry focus',
      'Strategic accounts',
      'Digest preferences',
      'Access & feature requests',
    ]) {
      await expect(page.getByText(step, { exact: true })).toBeVisible();
    }

    // Both the primary and skip actions are offered.
    await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Get Started' })).toBeVisible();

    // Close (Skip) the modal and confirm it is dismissed.
    await salesCoach.closeWelcomeButton.click();
    await expect(salesCoach.welcomeDialogHeading).toBeHidden();
  });

  test('should display the Sales Coach welcome landing content', async () => {
    // Dismiss the onboarding modal so the landing content is interactable.
    await salesCoach.dismissWelcomeDialog();
    await salesCoach.isLoaded();

    // The Sales Coach empty-state landing (WelcomeLanding component).
    const landing = salesCoach.welcomeLanding;
    await expect(landing).toBeVisible({ timeout: 15000 });

    // Header.
    await expect(landing.getByRole('heading', { name: 'Welcome to Sales Coach', exact: true })).toBeVisible();
    await expect(landing).toContainText('Your intelligent bid support assistant');

    // Create New Project card.
    await expect(landing.getByRole('heading', { name: 'Create New Project' })).toBeVisible();
    await expect(landing).toContainText('Start a new bid support project with AI assistance');
    await expect(salesCoach.getStartedLink).toBeVisible();
    await expect(salesCoach.getStartedLink).toHaveAttribute('href', '/sales-coach/project/draft');

    // Getting Started checklist.
    await expect(landing.getByRole('heading', { name: 'Getting Started' })).toBeVisible();
    await expect(landing).toContainText('Select a project from the sidebar to view project details');
    await expect(landing).toContainText('Start a new chat to interact with AI agents');
    await expect(landing).toContainText('Use the settings icon to configure agent parameters');
  });

  // A single agent-creation case. `fields` carries the agent-specific draft
  // form inputs (everything except the chat name).
  type AgentSpec = {
    name: string;
    description: string;
    legacy?: boolean;
    fields?: Omit<DraftChatOptions, 'chatName'>;
  };

  const TRANSCRIPT = path.resolve(__dirname, 'fixtures/transcript.txt');

  // Primary (structured-output) agents. Customer Profile also exposes News Recency.
  const agents: AgentSpec[] = [
    {
      name: 'Customer Profile',
      description:
        'Research agent designed to analyse customer profile, news, financials and SWOT analysis with talking points.',
      fields: { newsRecency: 7 },
    },
    {
      name: 'Deal Plan',
      description:
        'An intelligent agent to help you build a structured deal plan that outlines risks, mitigations, and recommended next steps.',
    },
    {
      name: 'Account Plan',
      description:
        'Intelligent agent to help you build a comprehensive account plan, uncovering growth opportunities and defining a strategy to deepen customer relationships.',
    },
    {
      name: 'Call Plan',
      description:
        'Intelligent agent to help you prepare for customer calls with a structured agenda, tailored talking points and clear objectives.',
    },
  ];

  // Legacy (plain-text) agents, carried over from a previous version. RFx
  // Responder requires a response structure; Upsell & Cross Sell requires a
  // transcript upload. "Research Agent" is Coming soon (disabled) and is
  // intentionally not covered. "BID Writer" has been removed from the app.
  const legacyAgents: AgentSpec[] = [
    {
      name: 'Pricing Strategy',
      description: 'Design custom pricing solutions aligned with your goals and customer needs',
      legacy: true,
    },
    {
      name: 'RFx Responder',
      description:
        'An intelligent assistant designed to streamline and enhance RFx creation through automation and contextual guidance.',
      legacy: true,
      fields: { responseStructure: 'Summary Only' },
    },
    {
      name: 'Upsell & Cross Sell',
      description:
        'Intelligent agent to help you match the requested service with upsell or crosssell opportunity from our portfolio.',
      legacy: true,
      fields: { transcriptFile: TRANSCRIPT },
    },
  ];

  // NOTE: these are MUTATING tests — each creates a real chat (and triggers a
  // full AI run, ~1-2 min) in the "Automation Project".
  for (const agent of [...agents, ...legacyAgents]) {
    test(`should create a ${agent.name} chat and find it in the Automation Project folder`, async ({
      page,
    }) => {
      test.setTimeout(480000); // some agent runs (e.g. Upsell & Cross Sell) take several minutes

      // Fail the test if the app returns ANY HTTP 4xx/5xx during the flow.
      const httpErrors = watchHttpErrors(page);

      await salesCoach.dismissWelcomeDialog();
      await salesCoach.selectProject('Automation Project');

      const draft = new DraftChatPage(page);

      // Verify the agent card and its description.
      const card = draft.agentCard(agent.name);
      await expect(card).toBeVisible({ timeout: 15000 });
      await expect(card).toContainText(agent.description);
      // Legacy agents are marked with a "Legacy" badge on their card.
      if (agent.legacy) {
        await expect(card.getByTestId('legacy-badge')).toBeVisible();
      }

      // Create the chat (Prompt has a default) and wait for every stage to
      // finish. A unique name identifies this run; the field caps at 50 chars,
      // so use the actually-stored name (possibly truncated) to locate it.
      const chatName = `${agent.name} — Automation Test ${Date.now()}`;
      const createdChatName = await draft.createChatForAgent(agent.name, {
        chatName,
        ...agent.fields,
      });

      // The created chat now lives inside the Automation Project sidebar folder
      // (created successfully).
      await page.goto('/sales-coach', { waitUntil: 'domcontentloaded' });
      await salesCoach.dismissWelcomeDialog();
      await salesCoach.selectProject('Automation Project');
      await expect(salesCoach.chatInProject('Automation Project', createdChatName)).toBeVisible({
        timeout: 30000,
      });

      // No HTTP 4xx/5xx errors should have occurred during the whole flow.
      expect(httpErrors, `Unexpected HTTP errors: ${JSON.stringify(httpErrors, null, 2)}`).toEqual(
        [],
      );
    });
  }
});
