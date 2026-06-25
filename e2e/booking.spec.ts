import { test, expect } from './fixtures';
import { loginAs } from './helpers/loginAs';

/**
 * List B — booking domain (E2E, chromium). member3 (Ananias) is a teacher so they
 * appear in the wizard's teacher picker. The booking wizard uses base-ui
 * comboboxes (portal'd) — prefer the dialog-scoped role/text locators proven in
 * permissions.spec.ts.
 */
test.describe('List B — booking', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'member3');
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');
  });

  test('B9 color legend is shown', async ({ page }) => {
    const legendBtn = page.getByRole('button', { name: /legend/i });
    if (await legendBtn.count()) await legendBtn.first().click();
    await expect(page.getByText(/unbaptized/i).first()).toBeVisible();
  });

  test('B1 the Book button opens the wizard at the activity step', async ({ page }) => {
    await page.getByRole('button', { name: /^book$/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/bible study/i).first()).toBeVisible();
    await expect(dialog.getByText(/group activity/i).first()).toBeVisible();
  });

  test('B4 the room step surfaces availability (free-slot counts)', async ({ page }) => {
    await page.getByRole('button', { name: /^book$/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Activity = Bible Study, then advance to the Room step.
    await dialog.getByText(/bible study/i).first().click();
    // Walk Next until a room option with a free-slot count appears (max a few steps).
    for (let i = 0; i < 4; i++) {
      if (await dialog.getByText(/free 30-min slot|fully booked/i).first().isVisible().catch(() => false)) break;
      await dialog.getByRole('button', { name: /^next$/i }).first().click().catch(() => {});
      await page.waitForTimeout(300);
    }
    await expect(dialog.getByText(/free 30-min slot|fully booked/i).first()).toBeVisible();
  });
});
