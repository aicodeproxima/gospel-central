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

  // B9 — the calendar with its color legend open. The legend is the data-key the
  // DOM test (booking.spec B9) asserts presence of; the baseline guards its
  // layout/contrast. Pinned seed = deterministic week.
  test('B9 calendar + legend (member)', async ({ page }) => {
    await loginAs(page, 'member3');
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');
    const legendBtn = page.getByRole('button', { name: /legend/i });
    if (await legendBtn.count()) await legendBtn.first().click();
    await expect(page.getByText(/unbaptized/i).first()).toBeVisible();
    await expect(page).toHaveScreenshot('calendar-legend.png', shot);
  });

  // B48 — the reports dashboard (stats + Top Contributors). Deterministic with
  // the pinned seed; catches chart/layout regressions the DOM text assertions miss.
  test('B48 reports dashboard (branch leader)', async ({ page }) => {
    await loginAs(page, 'branch1');
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/top contributors/i).first()).toBeVisible();
    await expect(page).toHaveScreenshot('reports-dashboard.png', shot);
  });

  // Phase 4 — the consolidated When page (wizard's always-first page) at the
  // project's three verification widths. Element shot of the dialog (the page
  // behind it is covered by the other baselines); the dialog is 92vh-bounded
  // so it fits each viewport.
  test('B-P4 wizard When page at 3 widths (member)', async ({ page }) => {
    await loginAs(page, 'member3');
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /^book$/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /^bible study$/i }).click();
    for (const [w, h, name] of [
      [1440, 900, 'wizard-when-desktop.png'],
      [412, 915, 'wizard-when-412.png'],
      [275, 596, 'wizard-when-275.png'],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(400);
      await expect(dialog).toHaveScreenshot(name, {
        animations: 'disabled',
        maxDiffPixelRatio: 0.03,
      });
    }
  });
});
