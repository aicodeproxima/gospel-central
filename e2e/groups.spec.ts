import { test, expect } from './fixtures';
import { loginAs } from './helpers/loginAs';

/**
 * List B — groups domain (E2E, chromium). The 3D tree is WebGL; assert via the
 * DOM toolbar/tabs/List-view (reliable) rather than driving the canvas.
 */
test.describe('List B — groups', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'branch1');
    await page.goto('/groups');
    // H1 + tab both say "Org Tree" since the REV3 #13 rename (was "Organization").
    await expect(page.getByText(/org tree/i).first()).toBeVisible();
  });

  test('B25 toggle 3D → List view shows the org as a list', async ({ page }) => {
    await page.getByRole('button', { name: /^list$/i }).first().click();
    await expect(page.getByText(/michael|gabriel|joseph/i).first()).toBeVisible();
  });

  test('B26 Expand All / Collapse All', async ({ page }) => {
    await page.getByRole('button', { name: /^list$/i }).first().click();
    await page.getByRole('button', { name: /expand/i }).first().click();
    await page.waitForTimeout(400);
    await expect(page.getByText(/leader|overseer|member/i).first()).toBeVisible();
    await page.getByRole('button', { name: /collapse/i }).first().click();
    await page.waitForTimeout(300);
  });

  test('B28 Jump-to picker opens', async ({ page }) => {
    await page.getByRole('button', { name: /jump to/i }).first().click();
    await expect(
      page.getByPlaceholder(/search|jump|name/i).or(page.getByRole('listbox')).first(),
    ).toBeVisible();
  });

  test('B29/B30 Teacher Metrics + Student Pipeline tabs render', async ({ page }) => {
    await page.getByText(/teacher metrics/i).first().click();
    await expect(page.getByText(/studying|students|baptiz|total/i).first()).toBeVisible();
    await page.getByText(/student pipeline/i).first().click();
    await expect(page.getByText(/first study|regular study|baptism|baptiz/i).first()).toBeVisible();
  });
});
