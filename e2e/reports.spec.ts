import { test, expect } from './fixtures';
import { loginAs } from './helpers/loginAs';

/**
 * List B — reports/admin domain (E2E, chromium), as branch1 (Branch Leader+).
 */
test.describe('List B — reports', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'branch1');
  });

  test('B48 reports dashboard renders stats + Top Contributors', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/top contributors/i).first()).toBeVisible();
  });

  test('B43 Change Log tab renders the audit table', async ({ page }) => {
    await page.goto('/reports');
    await page.getByText(/change log/i).first().click();
    await page.waitForTimeout(400);
    await expect(page.getByText(/action|entity|timestamp/i).first()).toBeVisible();
  });

  test('B45 clicking the Creates stat drills into a dialog', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    await page.getByText(/^creates$/i).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('B35 a Branch Leader reaches the /admin console', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin/); // BL+ not redirected (member redirect covered in smoke.spec)
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /admin/i }).first()).toBeVisible(); // console loaded
  });
});
