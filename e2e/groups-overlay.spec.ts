import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { loginAs } from './helpers/loginAs';

/**
 * The /groups immersive overlay — the ONE surface still served by Sidebar.tsx
 * after the Dock-and-Glide port. This spec exists because the Sidebar rewrite
 * (853e5f2) shipped with zero automated coverage of the overlay, and the
 * adversarial audit that noticed also found the open-state toggle sitting
 * under the update banner. The overlay contract locked here:
 *   - the open-menu trigger exists ONLY while the overlay is closed (its old
 *     slid-out position lived under the update banner's z-[9999] strip);
 *   - focus moves into the drawer on open and back to the trigger on close;
 *   - the panel's X, the backdrop, and a nav-link click all dismiss it;
 *   - labels are translated (the audit caught 'Close menu' beside 'Cerrar menú');
 *   - a pending-update banner never blocks opening the menu.
 */

test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'md+ only — below md the bottom MobileNav owns /groups navigation');

const openBtn = (page: Page) => page.getByRole('button', { name: 'Open menu' });
// The overlay panel is the only <aside> on /groups (the dock never mounts there).
const overlay = (page: Page) => page.locator('aside').filter({ hasText: 'Gospel Central' });
const closeBtn = (page: Page) => overlay(page).getByRole('button', { name: 'Close menu' });

test.describe('/groups immersive overlay', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/groups');
    await expect(openBtn(page)).toBeVisible({ timeout: 15_000 });
  });

  test('trigger opens the drawer, hides itself, and hands focus to the X', async ({ page }) => {
    await openBtn(page).click();

    await expect(overlay(page)).toBeVisible();
    // The trigger must be GONE while open — its old open-state position
    // (left:208) sat fully under the update banner.
    await expect(openBtn(page)).toHaveCount(0);
    // Drawer focus contract: the trigger unmounted, so focus lands on the X.
    await expect(closeBtn(page)).toBeFocused();

    // X closes and returns focus to the remounted trigger.
    await closeBtn(page).click();
    await expect(overlay(page)).toHaveCount(0);
    await expect(openBtn(page)).toBeFocused();
  });

  test('the backdrop dismisses an open overlay', async ({ page }) => {
    await openBtn(page).click();
    await expect(overlay(page)).toBeVisible();

    // Click well right of the 256px panel — the z-[46] backdrop owns that space.
    await page.mouse.click(640, 400);
    await expect(overlay(page)).toHaveCount(0);
    await expect(openBtn(page)).toBeVisible();
  });

  test('a nav link routes out of /groups and the standard dock takes over', async ({ page }) => {
    await openBtn(page).click();
    await overlay(page).getByRole('link', { name: 'Contacts' }).click();

    await page.waitForURL('**/contacts');
    // Standard layout resumes: the dock exists, the immersive trigger does not.
    await expect(page.getByTestId('floating-nav')).toBeVisible();
    await expect(openBtn(page)).toHaveCount(0);
  });

  test('trigger and X are translated as a pair (es)', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        'gospel-central-preferences',
        JSON.stringify({ state: { language: 'es' }, version: 4 }),
      );
    });
    await page.goto('/groups');

    const abrir = page.getByRole('button', { name: 'Abrir menú' });
    await expect(abrir).toBeVisible({ timeout: 15_000 });
    await abrir.click();
    // The audit's split-language finding: an English 'Close menu' used to sit
    // beside the translated X. Both names now come from the same locale.
    await expect(overlay(page).getByRole('button', { name: 'Cerrar menú' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close menu' })).toHaveCount(0);
  });

  test('a pending-update banner never blocks opening the menu', async ({ page }) => {
    await page.route('**/version.json*', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          version: '99.0.0',
          commit: 'e2e0different0commit0000000000000000000000',
          shortCommit: 'e2e0dif',
          branch: 'main',
          buildTime: '2030-01-01T00:00:00.000Z',
        }),
      }),
    );
    await page.goto('/groups');

    const banner = page.locator('[role="alert"]').filter({ hasText: /new version is available/i });
    await expect(banner).toBeVisible();

    // The trigger sits at left:16 inside the banner's cleared md+ lane — the
    // click must land on the button, not the banner.
    await openBtn(page).click({ timeout: 15_000 });
    await expect(overlay(page)).toBeVisible();
  });
});
