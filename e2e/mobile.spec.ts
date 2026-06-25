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

  // B14 — the dense contacts list (branch1 sees all 50 seeded contacts) must
  // reflow to a fitting stacked layout at phone width, not a wide table that pans.
  test('B14 the dense contacts list reflows without a horizontal pan', async ({ page }) => {
    await loginAs(page, 'branch1');
    await page.goto('/contacts');
    await page.waitForLoadState('networkidle');
    expect(await pageOverflowPx(page), 'dense /contacts must not pan').toBeLessThanOrEqual(1);
    await expect(
      page.getByText(/ethiopian eunuch|samaritan woman|adam/i).first(),
    ).toBeVisible(); // a seeded contact actually rendered (not an empty/clipped list)
  });

  // B25 — the org tree page (3D canvas) must offer the List view and fit phone
  // width with no pan in either mode.
  test('B25 the org tree fits phone width and toggles to List view', async ({ page }) => {
    await loginAs(page, 'branch1');
    await page.goto('/groups');
    await expect(page.getByText(/organization/i).first()).toBeVisible();
    expect(await pageOverflowPx(page), '/groups (3D) must not pan').toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: /^list$/i }).first().click();
    await expect(page.getByText(/michael|gabriel|joseph/i).first()).toBeVisible();
    expect(await pageOverflowPx(page), '/groups (List) must not pan').toBeLessThanOrEqual(1);
  });

  // B49 — the long settings page (cards + danger zone + switch rows) must fit
  // phone width end-to-end; the user's S24 Ultra is 412px CSS, ABOVE the
  // max-[400px] stacking breakpoint, so the inline label+action rows are exactly
  // where a clip/pan would surface.
  test('B49 the full settings page fits phone width with the danger zone reachable', async ({ page }) => {
    await loginAs(page, 'member3');
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    expect(await pageOverflowPx(page), '/settings top must not pan').toBeLessThanOrEqual(1);
    await expect(page.getByText(/notifications/i).first()).toBeVisible();
    const danger = page.getByText(/danger zone/i).first();
    await danger.scrollIntoViewIfNeeded();
    await expect(danger).toBeVisible();
    expect(await pageOverflowPx(page), '/settings danger zone must not pan').toBeLessThanOrEqual(1);
  });
});
