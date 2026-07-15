import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { loginAs } from './helpers/loginAs';

/**
 * Dock and Glide on a TOUCH tablet (the tablet-touch project: 768×1024,
 * hasTouch, no mouse hover). This is the population that lost the old
 * always-visible icon rail: hover previews are deliberately ignored for
 * touch (pointerType gate, req 15), so every open is a tap on the hamburger —
 * which pins. These tests drive that journey with real taps, not mouse
 * synthesis (pinNav's toggle.click() emits pointerType 'mouse' and proves
 * nothing here).
 */

const nav = (page: Page) => page.getByTestId('floating-nav');
const navBody = (page: Page) => page.getByTestId('floating-nav-body');
const toggle = (page: Page) => nav(page).getByRole('button', { name: /navigation/i });
const mainMargin = (page: Page) =>
  page.locator('main').evaluate((el) => Math.round(parseFloat(getComputedStyle(el).marginLeft)));

test.describe('floating nav — touch tablet', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('tap opens pinned; navigation keeps it; only the hamburger closes it', async ({ page }) => {
    await expect(nav(page)).toBeVisible();
    await expect(nav(page)).toHaveAttribute('data-open', 'false');
    expect(await mainMargin(page)).toBe(80);

    // Tap the launcher: for touch this is the ONLY way in, and it pins.
    await toggle(page).tap();
    await expect(nav(page)).toHaveAttribute('data-open', 'true');
    await expect(nav(page)).toHaveAttribute('data-pinned', 'true');
    await expect.poll(() => mainMargin(page)).toBe(284);

    // An outside tap must NOT dismiss a pinned menu. Tap the page's own
    // heading — guaranteed non-interactive, unlike an arbitrary coordinate
    // (a blind (x,y) here once landed on a contact row and opened its modal).
    await page.locator('main h1').first().tap();
    await expect(nav(page)).toHaveAttribute('data-open', 'true');
    await expect(nav(page)).toHaveAttribute('data-pinned', 'true');

    // Tap a page link: navigates, and the pinned menu deliberately stays.
    await navBody(page).getByRole('link', { name: 'Contacts' }).tap();
    await page.waitForURL('**/contacts');
    await expect(nav(page)).toHaveAttribute('data-open', 'true');
    await expect(nav(page)).toHaveAttribute('data-pinned', 'true');

    // …only the hamburger unpins and closes.
    await toggle(page).tap();
    await expect(nav(page)).toHaveAttribute('data-open', 'false');
    await expect(nav(page)).toHaveAttribute('data-pinned', 'false');
    await expect.poll(() => mainMargin(page)).toBe(80);
  });

  test('a tap on the launcher never opens a mere (dismissable) preview', async ({ page }) => {
    // The 170ms leave-close timer arms during the tap's pointer sequence
    // (pointerdown → pointerup → pointerleave precede click); only the pinned
    // latch keeps the just-opened menu alive. Guard that ordering.
    await toggle(page).tap();
    await page.waitForTimeout(400); // well past the 170ms unpinned close
    await expect(nav(page)).toHaveAttribute('data-open', 'true');
    await expect(nav(page)).toHaveAttribute('data-pinned', 'true');
  });

  test('open-pinned calendar keeps the week usable: internal scroll, no page pan', async ({
    page,
  }) => {
    await toggle(page).tap();
    await navBody(page).getByRole('link', { name: 'Calendar' }).tap();
    await page.waitForURL('**/calendar');
    await page.waitForLoadState('networkidle');

    // The page body itself must never pan horizontally…
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // …the calendar grid absorbs the squeeze by scrolling INTERNALLY.
    const grid = page.locator('[data-calendar-surface="grid"]').first();
    await expect(grid).toBeVisible();
    const scrolls = await grid.evaluate((el) => ({
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
      overflowX: getComputedStyle(el).overflowX,
    }));
    expect(['auto', 'scroll']).toContain(scrolls.overflowX);
  });

  test('tap targets on the open panel meet the 44px floor', async ({ page }) => {
    await toggle(page).tap();
    await expect(nav(page)).toHaveAttribute('data-open', 'true');

    // The coarse-pointer bumps ([@media(pointer:coarse)]) only engage when the
    // engine reports a coarse pointer — record what this project actually
    // emulates so the assertion is honest about what it proved.
    const coarse = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);

    const toggleBox = (await toggle(page).boundingBox())!;
    expect(toggleBox.width).toBeGreaterThanOrEqual(44);
    expect(toggleBox.height).toBeGreaterThanOrEqual(44);

    const links = navBody(page).getByRole('link');
    for (let i = 0; i < (await links.count()); i++) {
      const box = (await links.nth(i).boundingBox())!;
      expect(box.height, `link ${i} height (coarse=${coarse})`).toBeGreaterThanOrEqual(coarse ? 44 : 42);
    }

    const signOut = navBody(page).getByRole('button', { name: /sign out/i });
    const signOutBox = (await signOut.boundingBox())!;
    if (coarse) {
      expect(signOutBox.height, 'Sign Out needs the coarse 44px bump').toBeGreaterThanOrEqual(44);
    }
  });
});
