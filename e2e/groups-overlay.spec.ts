import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { loginAs } from './helpers/loginAs';
import { pinNav } from './helpers/pinNav';

/**
 * /groups navigation — since the Sidebar overlay's retirement (user decision
 * 2026-07-16) the page uses the SAME Dock-and-Glide menu as every other md+
 * page. What is /groups-specific and locked here:
 *   - the dock exists and works over the fullscreen 3D canvas;
 *   - /groups skips the 80/284 margin dance (the canvas stays fullscreen and
 *     the dock floats over it, like the old overlay did);
 *   - a pin travels INTO and OUT OF /groups across client-side navigation;
 *   - a pending-update banner never blocks the launcher here either.
 */

test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'md+ only — below md the bottom MobileNav owns /groups navigation');

const nav = (page: Page) => page.getByTestId('floating-nav');
const navBody = (page: Page) => page.getByTestId('floating-nav-body');
const toggle = (page: Page) => nav(page).getByRole('button', { name: /navigation/i });

test.describe('/groups — same dock as everywhere', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/groups');
    await expect(nav(page)).toBeVisible({ timeout: 20_000 });
  });

  test('the dock floats over the fullscreen canvas — no margin, old overlay gone', async ({ page }) => {
    // Same launcher, same geometry contract as the standard pages.
    const style = await nav(page).evaluate((el) => {
      const cs = getComputedStyle(el);
      return { top: cs.top, left: cs.left, position: cs.position };
    });
    expect(style).toEqual({ top: '14px', left: '14px', position: 'fixed' });

    // The old immersive chrome must be fully retired: no round hamburger, no
    // second aside, and the content is NOT margin-shifted (fullscreen canvas).
    await expect(page.getByRole('button', { name: 'Open menu' })).toHaveCount(0);
    expect(await page.locator('aside').count()).toBe(1); // the dock only
    expect(await page.locator('main').count()).toBe(0); // immersive branch has no <main>

    // Pin it: the panel opens over the canvas and all links are live.
    await pinNav(page);
    await expect(navBody(page).getByRole('link', { name: 'Groups' })).toHaveAttribute('aria-current', 'page');
    await expect(navBody(page).getByRole('button', { name: /sign out/i })).toBeVisible();
  });

  test('a pin travels into and out of /groups (client-side)', async ({ page }) => {
    // Pin ON /groups, route away via the panel — still pinned there…
    await pinNav(page);
    await navBody(page).getByRole('link', { name: 'Contacts' }).click();
    await page.waitForURL('**/contacts');
    await expect(nav(page)).toHaveAttribute('data-pinned', 'true');
    await expect(nav(page)).toHaveAttribute('data-open', 'true');

    // …and back INTO /groups, still pinned, panel usable over the canvas.
    await navBody(page).getByRole('link', { name: 'Groups' }).click();
    await page.waitForURL('**/groups');
    await expect(nav(page)).toHaveAttribute('data-pinned', 'true');
    await expect(navBody(page).getByRole('link', { name: 'Groups' })).toHaveAttribute('aria-current', 'page');

    // Unpin works here like anywhere else.
    await toggle(page).click();
    await expect(nav(page)).toHaveAttribute('data-open', 'false');
  });

  test('a pending-update banner never blocks the launcher on /groups', async ({ page }) => {
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

    // Launcher at left:14 sits inside the banner's cleared md+ lane.
    const b = (await banner.boundingBox())!;
    const l = (await nav(page).boundingBox())!;
    expect(b.x, 'banner must start right of the launcher').toBeGreaterThanOrEqual(l.x + l.width);
    await toggle(page).click({ timeout: 15_000 });
    await expect(nav(page)).toHaveAttribute('data-open', 'true');
  });
});
