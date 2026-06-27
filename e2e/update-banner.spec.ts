import { test, expect } from './fixtures';

/**
 * Tier-2 "update available" detector, end-to-end. We stub /version.json (the
 * banner fetches it on mount) so we don't need two real deploys. The banner
 * mounts globally in Providers, so /login (no auth) is enough to exercise it.
 *
 * page.route intercepts at the network layer — BELOW the app's in-page MSW
 * fetch wrapper, which passes /version.json through (it only handles /api) — so
 * the stub reliably wins.
 */
const FAKE_NEWER = {
  version: '99.0.0',
  commit: 'e2e0different0commit0000000000000000000000',
  shortCommit: 'e2e0dif',
  branch: 'main',
  buildTime: '2030-01-01T00:00:00.000Z',
};

test.describe('update-available banner (Tier 2)', () => {
  test('shows when the deployed commit differs, and Reload reloads the page', async ({ page }) => {
    await page.route('**/version.json*', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(FAKE_NEWER) }),
    );

    await page.goto('/login');

    await expect(page.getByText('A new version is available')).toBeVisible();

    // Reload is user-initiated: clicking it triggers a real navigation (reload).
    await Promise.all([
      page.waitForEvent('framenavigated'),
      page.getByRole('button', { name: 'Reload' }).click(),
    ]);
  });

  test("does NOT show when the manifest commit is 'unknown' (no false positive)", async ({ page }) => {
    await page.route('**/version.json*', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ...FAKE_NEWER, commit: 'unknown', shortCommit: 'unknown' }),
      }),
    );

    // Arm the request waiter BEFORE navigating so we know the check actually ran
    // before asserting the banner's absence.
    const manifestReq = page.waitForRequest('**/version.json*');
    await page.goto('/login');
    await manifestReq;

    await expect(page.getByText('A new version is available')).toHaveCount(0);
  });
});
