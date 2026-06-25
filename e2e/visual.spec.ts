import { test, expect } from './fixtures';
import { loginAs } from './helpers/loginAs';

/**
 * Visual-regression baselines (the layout/contrast/clipping the DOM assertions are
 * blind to). Pinned seed + default theme = deterministic content. Baselines are
 * PLATFORM-specific (font rendering), so this is SKIPPED in CI and run locally /
 * nightly on a consistent machine. /groups (WebGL, non-deterministic) is excluded.
 * Regenerate after intentional UI changes: `npm run e2e:update`.
 */
const shot = { fullPage: true, animations: 'disabled', maxDiffPixelRatio: 0.03 } as const;

test.describe('visual regression', () => {
  test.skip(!!process.env.CI, 'platform-specific baselines — run locally / nightly');

  test('login', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveScreenshot('login.png', shot);
  });

  test('dashboard (member)', async ({ page }) => {
    await loginAs(page, 'member3');
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('dashboard-member.png', shot);
  });

  test('contacts list (branch leader)', async ({ page }) => {
    await loginAs(page, 'branch1');
    await page.goto('/contacts');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('contacts-branch.png', shot);
  });

  test('settings', async ({ page }) => {
    await loginAs(page, 'member3');
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('settings.png', shot);
  });
});
