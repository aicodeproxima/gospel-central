import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { loginAs } from './helpers/loginAs';

/**
 * /groups navigation — the page uses the SAME Dock-and-Glide menu as every
 * other md+ page (the slide-in Sidebar overlay was retired 2026-07-16), with
 * two deliberate differences this spec locks down, both from real user reports:
 *
 *   1. Hover does NOT open it here. The launcher sits on the corner of the 3D
 *      canvas the user orbits by dragging, so an incidental sweep used to fling
 *      the panel open and swallow the next click — which landed on the toggle
 *      and pinned it ("it just got pinned on me when I didn't click to pin").
 *   2. The page's floating toolbar clears the OPEN panel. /groups keeps its
 *      canvas fullscreen, so there is no content margin doing that for it, and
 *      the panel used to cover the search bar.
 */

test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'md+ only — below md the bottom MobileNav owns /groups navigation');

const nav = (page: Page) => page.getByTestId('floating-nav');
const navBody = (page: Page) => page.getByTestId('floating-nav-body');
const toggle = (page: Page) => nav(page).getByRole('button', { name: /navigation/i });
const searchBar = (page: Page) => page.locator('[data-tree-frame-top] input').first();

/** Does the dock's box intersect the toolbar's search field? */
async function navCoversSearch(page: Page) {
  const n = (await nav(page).boundingBox())!;
  const s = (await searchBar(page).boundingBox())!;
  return n.x < s.x + s.width && n.x + n.width > s.x && n.y < s.y + s.height && n.y + n.height > s.y;
}

test.describe('/groups — the dock over the 3D canvas', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/groups');
    await expect(nav(page)).toBeVisible({ timeout: 20_000 });
    await expect(searchBar(page)).toBeVisible({ timeout: 20_000 });
  });

  test('the old immersive chrome is gone and the dock floats over a fullscreen canvas', async ({
    page,
  }) => {
    const style = await nav(page).evaluate((el) => {
      const cs = getComputedStyle(el);
      return { top: cs.top, left: cs.left, position: cs.position };
    });
    expect(style).toEqual({ top: '14px', left: '14px', position: 'fixed' });

    await expect(page.getByRole('button', { name: 'Open menu' })).toHaveCount(0);
    expect(await page.locator('aside').count()).toBe(1); // the dock only
    expect(await page.locator('main').count()).toBe(0); // fullscreen: no margin column
  });

  test('mousing over the canvas corner never opens or pins the menu', async ({ page }) => {
    // The reported bug, reproduced as a test: sweep the pointer across the
    // launcher the way a user orbiting the tree does.
    await page.mouse.move(700, 450);
    await page.mouse.move(400, 300, { steps: 8 });
    await page.mouse.move(40, 40, { steps: 8 });
    await page.waitForTimeout(500);

    await expect(nav(page), 'hover must not open the dock on /groups').toHaveAttribute('data-open', 'false');
    await expect(nav(page)).toHaveAttribute('data-pinned', 'false');

    // Resting on it changes nothing either — only a deliberate click opens it.
    await nav(page).hover();
    await page.waitForTimeout(400);
    await expect(nav(page)).toHaveAttribute('data-open', 'false');
  });

  test('clicking the launcher opens it, and the toolbar clears the panel', async ({ page }) => {
    // Collapsed: the toolbar already clears the 66px launcher.
    expect(await navCoversSearch(page), 'collapsed dock must not cover the search bar').toBe(false);

    await toggle(page).click();
    await expect(nav(page)).toHaveAttribute('data-open', 'true');
    await expect(nav(page)).toHaveAttribute('data-pinned', 'true');
    await expect
      .poll(async () => parseFloat(await nav(page).evaluate((el) => getComputedStyle(el).width)))
      .toBeGreaterThanOrEqual(255);
    // The toolbar shifts out of the way rather than hiding under the panel.
    await expect
      .poll(async () => navCoversSearch(page), { timeout: 5_000 })
      .toBe(false);
    await expect(searchBar(page)).toBeVisible();

    // Closing gives the space back.
    await toggle(page).click();
    await expect(nav(page)).toHaveAttribute('data-open', 'false');
    await expect
      .poll(async () => (await searchBar(page).boundingBox())!.x, { timeout: 5_000 })
      .toBeLessThan(220);
  });

  test('keyboard focus still opens it (hover suppression must not break a11y)', async ({ page }) => {
    await toggle(page).focus();
    await expect(nav(page)).toHaveAttribute('data-open', 'true');
    // Focus-opened is a preview, not a pin — Escape closes it.
    await expect(nav(page)).toHaveAttribute('data-pinned', 'false');
    await page.keyboard.press('Escape');
    await expect(nav(page)).toHaveAttribute('data-open', 'false');
  });

  test('a pin travels into and out of /groups (client-side)', async ({ page }) => {
    await toggle(page).click();
    await expect(nav(page)).toHaveAttribute('data-pinned', 'true');

    await navBody(page).getByRole('link', { name: 'Contacts' }).click();
    await page.waitForURL('**/contacts');
    await expect(nav(page)).toHaveAttribute('data-pinned', 'true');
    await expect(nav(page)).toHaveAttribute('data-open', 'true');

    await navBody(page).getByRole('link', { name: 'Groups' }).click();
    await page.waitForURL('**/groups');
    await expect(nav(page)).toHaveAttribute('data-pinned', 'true');
    await expect(navBody(page).getByRole('link', { name: 'Groups' })).toHaveAttribute('aria-current', 'page');
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

    const b = (await banner.boundingBox())!;
    const l = (await nav(page).boundingBox())!;
    expect(b.x, 'banner must start right of the launcher').toBeGreaterThanOrEqual(l.x + l.width);
    await toggle(page).click({ timeout: 15_000 });
    await expect(nav(page)).toHaveAttribute('data-open', 'true');
  });
});
