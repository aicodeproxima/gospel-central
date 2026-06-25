import { test, expect } from './fixtures';
import { loginAs } from './helpers/loginAs';

/**
 * Mobile-fitment guards (run on the mobile projects: mobile-pixel5, mobile-s24).
 * The single most important: NO horizontal page pan — the regression the user
 * hits most on the Galaxy S24 Ultra. Skipped on desktop-width projects.
 */
test.describe('mobile (S24 Ultra) fitment', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 9999) >= 768, 'mobile viewports only');

  async function pageOverflowPx(page: import('@playwright/test').Page) {
    return page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  }

  test('no horizontal page pan on key pages', async ({ page }) => {
    await loginAs(page, 'member3');
    for (const path of ['/dashboard', '/contacts', '/settings']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await pageOverflowPx(page), `${path} must not pan horizontally`).toBeLessThanOrEqual(1);
    }
  });

  test('calendar renders the Agenda list at phone width, no pan', async ({ page }) => {
    await loginAs(page, 'member3');
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');
    expect(await pageOverflowPx(page), '/calendar must not pan').toBeLessThanOrEqual(1);
    await expect(page.getByRole('button', { name: /^book$/i }).first()).toBeVisible(); // calendar loaded
  });

  test('booking wizard opens and fits the viewport width', async ({ page }) => {
    await loginAs(page, 'member3');
    await page.goto('/calendar');
    await page.getByRole('button', { name: /^book$/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await pageOverflowPx(page), 'wizard must not cause a horizontal pan').toBeLessThanOrEqual(1);
  });
});
