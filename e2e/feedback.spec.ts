import { test, expect } from './fixtures';
import { loginAs } from './helpers/loginAs';
import type { Page, Route } from '@playwright/test';

/**
 * Settings > Send Feedback — the honesty contract.
 *
 * WHY THIS SPEC EXISTS: the card shipped in Phase 7 firing
 * toast.success("your feedback was received") with NO network call at all, and
 * every gate was green while it did. Unit tests can't catch that class of bug —
 * only driving the form can. Each test below pins one branch of "the toast must
 * describe what actually happened".
 *
 * EVERY request is intercepted, so this spec NEVER writes to the real
 * public.feedback table. That matters: /api/feedback is deliberately a real
 * server route (absent from the MSW handlers), so an un-intercepted e2e run
 * would file a row in production on every execution.
 *
 * BONUS GUARD: page.route() intercepts at the browser network layer, which sits
 * AFTER the in-page MSW fetch patch. So the interception firing at all is proof
 * that MSW did not shadow /feedback. If someone ever adds a `/feedback` handler
 * to src/mocks/handlers.ts, these tests stop seeing requests and fail — which is
 * exactly the regression we want caught (see the route file's header).
 */

const QUEUE_KEY = 'gospel-central-feedback-queue';

async function fillFeedback(page: Page, subject = 'e2e subject', message = 'e2e message body') {
  await page.getByTestId('feedback-subject').fill(subject);
  await page.getByTestId('feedback-message').fill(message);
}

async function gotoSettings(page: Page) {
  await loginAs(page, 'admin');
  await page.goto('/settings');
  await expect(page.getByTestId('feedback-send')).toBeVisible();
  // Start every test from an empty outbox so a previous test's queued entry
  // can't replay into this one's assertions.
  await page.evaluate((k) => localStorage.removeItem(k), QUEUE_KEY);
}

/** Stub /api/feedback and count how many times the app actually called it. */
async function stubFeedback(
  page: Page,
  respond: (route: Route) => Promise<void>,
): Promise<() => number> {
  let calls = 0;
  await page.route('**/api/feedback', async (route) => {
    calls++;
    await respond(route);
  });
  return () => calls;
}

const ok = (body: Record<string, unknown>) => async (route: Route) =>
  route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(body) });

test.describe('Settings > Send Feedback — honesty contract', () => {
  test('actually issues a network request (the original bug: it issued none)', async ({ page }) => {
    await gotoSettings(page);
    const calls = await stubFeedback(
      page,
      ok({ id: 'f1', createdAt: '2026-07-18T00:00:00Z', stored: true, emailed: true }),
    );
    await fillFeedback(page);
    await page.getByTestId('feedback-send').click();
    await expect.poll(calls).toBe(1);
  });

  test('emailed → claims delivery, and clears the form', async ({ page }) => {
    await gotoSettings(page);
    await stubFeedback(
      page,
      ok({ id: 'f1', createdAt: '2026-07-18T00:00:00Z', stored: true, emailed: true }),
    );
    await fillFeedback(page);
    await page.getByTestId('feedback-send').click();

    await expect(page.getByText(/Sent — your feedback reached/i)).toBeVisible();
    await expect(page.getByTestId('feedback-subject')).toHaveValue('');
    await expect(page.getByTestId('feedback-message')).toHaveValue('');
  });

  test('stored but NOT emailed → says so instead of claiming it was sent', async ({ page }) => {
    await gotoSettings(page);
    await stubFeedback(
      page,
      ok({ id: 'f1', createdAt: '2026-07-18T00:00:00Z', stored: true, emailed: false }),
    );
    await fillFeedback(page);
    await page.getByTestId('feedback-send').click();

    await expect(page.getByText(/Saved —/i)).toBeVisible();
    await expect(page.getByText(/Sent — your feedback reached/i)).toHaveCount(0);
  });

  test('server error → admits failure, KEEPS the text, and queues it', async ({ page }) => {
    await gotoSettings(page);
    await stubFeedback(page, async (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Feedback delivery is not configured', code: 'UNKNOWN' }),
      }),
    );
    await fillFeedback(page, 'failure subject', 'failure message body');
    await page.getByTestId('feedback-send').click();

    await expect(page.getByText(/Couldn't send/i)).toBeVisible();
    // The whole point: losing what the user typed is its own bug.
    await expect(page.getByTestId('feedback-subject')).toHaveValue('failure subject');
    await expect(page.getByTestId('feedback-message')).toHaveValue('failure message body');

    const queued = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), QUEUE_KEY);
    expect(queued.entries).toHaveLength(1);
    expect(queued.entries[0].payload.subject).toBe('failure subject');
    expect(queued.entries[0].payload.clientRequestId).toBeTruthy();
  });

  test('transport failure (offline) → same honest failure path', async ({ page }) => {
    await gotoSettings(page);
    await stubFeedback(page, async (route) => route.abort('failed'));
    await fillFeedback(page, 'offline subject', 'offline message body');
    await page.getByTestId('feedback-send').click();

    await expect(page.getByText(/Couldn't send/i)).toBeVisible();
    await expect(page.getByTestId('feedback-subject')).toHaveValue('offline subject');
  });

  test('401 → stays on /settings with the text intact (no login bounce)', async ({ page }) => {
    await gotoSettings(page);
    await stubFeedback(page, async (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Unauthorized', code: 'UNAUTHORIZED' }),
      }),
    );
    await fillFeedback(page, 'session subject', 'session message body');
    await page.getByTestId('feedback-send').click();

    // Regression guard for feedbackApi's skipAuthRedirect: without it, the
    // global 401 handler in client.ts hard-navigates to /login and the typed
    // message is destroyed before the catch block can retain it.
    await expect(page.getByText(/session expired/i)).toBeVisible();
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByTestId('feedback-message')).toHaveValue('session message body');
  });

  test('queued entry replays on next mount and drains the outbox', async ({ page }) => {
    await gotoSettings(page);

    // First attempt fails → lands in the outbox.
    await page.route('**/api/feedback', (route) => route.abort('failed'));
    await fillFeedback(page, 'replay subject', 'replay message body');
    await page.getByTestId('feedback-send').click();
    await expect(page.getByText(/Couldn't send/i)).toBeVisible();

    // Network comes back, user revisits Settings.
    await page.unroute('**/api/feedback');
    const calls = await stubFeedback(
      page,
      ok({ id: 'f-replay', createdAt: '2026-07-18T00:00:00Z', stored: true, emailed: true }),
    );
    await page.goto('/settings');

    await expect.poll(calls).toBeGreaterThanOrEqual(1);
    await expect
      .poll(async () =>
        page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{"entries":[]}').entries.length, QUEUE_KEY),
      )
      .toBe(0);
  });

  test('Send is disabled until both fields have content', async ({ page }) => {
    await gotoSettings(page);
    const send = page.getByTestId('feedback-send');
    await expect(send).toBeDisabled();
    await page.getByTestId('feedback-subject').fill('only a subject');
    await expect(send).toBeDisabled();
    await page.getByTestId('feedback-message').fill('now a message');
    await expect(send).toBeEnabled();
  });
});
