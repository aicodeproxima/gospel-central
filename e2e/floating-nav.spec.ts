import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { loginAs } from './helpers/loginAs';
import { pinNav } from './helpers/pinNav';

/**
 * "Dock and Glide" floating navigation — real-browser behavior.
 *
 * The state machine has headless coverage (use-dock-glide.itest.tsx); what only
 * a real browser can prove is what lives here: genuine hover, actual layout
 * geometry, focus/Escape, and that the page never sits under the menu.
 *
 * Geometry note: at ≥1280px `globals.css` applies `:root { zoom: 0.9 }`, so
 * getBoundingClientRect returns 0.9× the authored px while computed style keeps
 * the authored value (with sub-pixel rounding — 52px reads as ~51.9965px).
 * Assertions therefore use tolerances, never exact strings.
 */

const DESKTOP = { width: 1440, height: 900 };

// Mobile-only projects run mobile.spec; this suite is desktop behavior.
test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'md+ only — below 768 MobileNav owns nav');

const nav = (page: Page) => page.getByTestId('floating-nav');
const navBody = (page: Page) => page.getByTestId('floating-nav-body');
const toggle = (page: Page) => nav(page).getByRole('button', { name: /navigation/i });
// Rounded because of the >=1280 root zoom, not because anything is unfinished:
// 284 * 0.9 = 255.6 device px, which WebKit snaps to its 1/64px LayoutUnit
// (255.59375) and reports back as 283.993px. (80 * 0.9 = 72.0 is exactly
// representable, which is why the collapsed margin reads a clean 80 on every
// engine.) Same rounding family as the 52px launcher measuring 51.9965px.
const mainMargin = (page: Page) =>
  page.locator('main').evaluate((el) => Math.round(parseFloat(getComputedStyle(el).marginLeft)));
const navBox = async (page: Page) => (await nav(page).boundingBox())!;

/** Move the pointer far away from the dock, to a dead area of the page. */
const pointerAway = (page: Page) => page.mouse.move(900, 500);

test.describe('floating nav — dock and glide', () => {
  test.use({ viewport: DESKTOP });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('launcher is a 52px dock inset 14px, and the page starts clear of it (reqs 3, 5, 6)', async ({
    page,
  }) => {
    await expect(nav(page)).toHaveAttribute('data-open', 'false');
    await expect(nav(page)).toHaveAttribute('data-pinned', 'false');

    const style = await nav(page).evaluate((el) => {
      const cs = getComputedStyle(el);
      return { w: cs.width, h: cs.height, top: cs.top, left: cs.left, position: cs.position };
    });
    expect(parseFloat(style.w)).toBeCloseTo(52, 0);
    expect(parseFloat(style.h)).toBeCloseTo(52, 0);
    expect(style.top).toBe('14px');
    expect(style.left).toBe('14px');
    expect(style.position).toBe('fixed');

    // Collapsed = 80px of margin: clears the launcher's 14 + 52 = 66px footprint.
    expect(await mainMargin(page)).toBe(80);

    const box = await navBox(page);
    const main = (await page.locator('main').boundingBox())!;
    expect(main.x).toBeGreaterThanOrEqual(box.x + box.width);
  });

  test('hover opens a 256px preview and glides the page over; leaving collapses it (reqs 4, 5, 7, 8)', async ({
    page,
  }) => {
    await nav(page).hover();

    await expect(nav(page)).toHaveAttribute('data-open', 'true');
    await expect
      .poll(async () => parseFloat(await nav(page).evaluate((el) => getComputedStyle(el).width)))
      .toBeCloseTo(256, 0);
    await expect.poll(() => mainMargin(page)).toBe(284);

    // Full height, inset 14px top and bottom.
    const box = await navBox(page);
    const viewportH = page.viewportSize()!.height;
    const zoom = parseFloat(await page.evaluate(() => getComputedStyle(document.documentElement).zoom || '1'));
    expect(box.height).toBeCloseTo(viewportH - 28 * zoom, 0);

    // A hover preview is not a pin.
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');

    // The open panel still never overlaps the page.
    const main = (await page.locator('main').boundingBox())!;
    expect(main.x).toBeGreaterThanOrEqual(box.x + box.width);

    await pointerAway(page);
    await expect(nav(page)).toHaveAttribute('data-open', 'false');
    await expect.poll(() => mainMargin(page)).toBe(80);
  });

  test('only the hamburger pins; a pin survives pointer-away and outside clicks (reqs 9, 10, 14)', async ({
    page,
  }) => {
    await pinNav(page);
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');

    await pointerAway(page);
    await page.waitForTimeout(400); // longer than the 170ms unpinned close
    await expect(nav(page)).toHaveAttribute('data-open', 'true');

    // An outside click must not dismiss a pinned menu.
    await page.mouse.click(900, 500);
    await expect(nav(page)).toHaveAttribute('data-open', 'true');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');

    // Unpin from the hamburger — the only control allowed to.
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(nav(page)).toHaveAttribute('data-open', 'false');
    await expect.poll(() => mainMargin(page)).toBe(80);
  });

  test('an outside pointer dismisses an unpinned preview (req 14)', async ({ page }) => {
    await nav(page).hover();
    await expect(nav(page)).toHaveAttribute('data-open', 'true');

    await page.mouse.click(900, 500);
    await expect(nav(page)).toHaveAttribute('data-open', 'false');
  });

  test('a pointer click navigates and dismisses the preview, pinned stays open (reqs 10, 11)', async ({
    page,
  }) => {
    await nav(page).hover();
    await navBody(page).getByRole('link', { name: 'Contacts' }).click();

    await page.waitForURL('**/contacts');
    await expect(nav(page)).toHaveAttribute('data-open', 'false');
    await expect(nav(page)).toHaveAttribute('data-pinned', 'false'); // a link never pins

    await pinNav(page);
    await navBody(page).getByRole('link', { name: 'Calendar' }).click();
    await page.waitForURL('**/calendar');
    await expect(nav(page)).toHaveAttribute('data-open', 'true'); // pinned navigation stays put
    await expect(nav(page)).toHaveAttribute('data-pinned', 'true');
  });

  test('keyboard focus opens the menu and route activation preserves the session (req 12)', async ({
    page,
  }) => {
    await toggle(page).focus();
    await expect(nav(page)).toHaveAttribute('data-open', 'true');

    // Tab into the panel: focus must stay INSIDE the menu and keep it open.
    // (Which element it lands on is engine policy: Chromium tabs to the first
    // link, WebKit — like real Safari — skips links on plain Tab and lands on
    // the Sign Out button. Both are legitimate keyboard sessions.)
    await page.keyboard.press('Tab');
    await expect(navBody(page).locator(':focus')).toHaveCount(1);
    await expect(nav(page)).toHaveAttribute('data-open', 'true');

    // Route-activate a link from that keyboard session (focused directly —
    // Safari users reach links via Option+Tab; the session semantics are the
    // same). Enter must navigate WITHOUT collapsing the menu.
    const contacts = navBody(page).getByRole('link', { name: 'Contacts' });
    await contacts.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/contacts');
    await expect(nav(page)).toHaveAttribute('data-open', 'true');
    await expect(navBody(page).locator(':focus')).toHaveCount(1); // focus stayed inside
  });

  test('Escape closes, unpins, and returns focus to the hamburger (req 13)', async ({ page }) => {
    await pinNav(page);
    await navBody(page).getByRole('link', { name: 'Contacts' }).focus();

    await page.keyboard.press('Escape');

    await expect(nav(page)).toHaveAttribute('data-open', 'false');
    await expect(nav(page)).toHaveAttribute('data-pinned', 'false');
    await expect(toggle(page)).toBeFocused();
    // The focus restore must not bounce it back open.
    await page.waitForTimeout(150);
    await expect(nav(page)).toHaveAttribute('data-open', 'false');
  });

  test('Escape closes an open dialog without unpinning the menu (req 13 guard)', async ({
    page,
  }) => {
    // The real integration the itest can only simulate: a genuine Base UI
    // dialog owns the first Escape; the pinned dock must survive it and only
    // yield to the SECOND Escape.
    await pinNav(page);
    await navBody(page).getByRole('link', { name: 'Calendar' }).click();
    await page.waitForURL('**/calendar');

    await page.getByRole('button', { name: /^book$/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(nav(page)).toHaveAttribute('data-open', 'true');
    await expect(nav(page)).toHaveAttribute('data-pinned', 'true');

    await page.keyboard.press('Escape');
    await expect(nav(page)).toHaveAttribute('data-open', 'false');
    await expect(nav(page)).toHaveAttribute('data-pinned', 'false');
  });

  test('collapsed content is inert and hidden from assistive tech (req 17)', async ({ page }) => {
    await expect(navBody(page)).toHaveAttribute('inert', '');
    await expect(navBody(page)).toHaveAttribute('aria-hidden', 'true');
    // aria-hidden removes it from the a11y tree entirely.
    await expect(page.getByRole('link', { name: 'Contacts' })).toHaveCount(0);

    await pinNav(page);
    await expect(navBody(page)).not.toHaveAttribute('inert', '');
    await expect(navBody(page)).toHaveAttribute('aria-hidden', 'false');
    await expect(navBody(page).getByRole('link', { name: 'Contacts' })).toBeVisible();
  });

  test('the active route carries aria-current (req 18)', async ({ page }) => {
    await pinNav(page);
    await expect(navBody(page).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(navBody(page).getByRole('link', { name: 'Contacts' })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('the hamburger keeps aria-expanded, aria-pressed, label and tooltip in sync (req 19)', async ({
    page,
  }) => {
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Pin navigation open');
    await expect(toggle(page)).toHaveAttribute('title', 'Pin navigation open');

    await pinNav(page);

    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Unpin and close navigation');
    await expect(toggle(page)).toHaveAttribute('title', 'Unpin and close navigation');
  });

  test('the menu carries the live profile, alert badge and build version', async ({ page }) => {
    await pinNav(page);
    await expect(navBody(page).getByText('Michael')).toBeVisible();
    await expect(navBody(page).getByText('Developer')).toBeVisible();
    await expect(navBody(page).getByText(/^v\d+\.\d+\.\d+/)).toBeVisible();
    await expect(navBody(page).getByRole('button', { name: /sign out/i })).toBeVisible();
  });

  test('Reports and Admin stay gated by role', async ({ page }) => {
    await pinNav(page);
    await expect(navBody(page).getByRole('link', { name: 'Reports' })).toBeVisible();
    await expect(navBody(page).getByRole('link', { name: 'Admin' })).toBeVisible();

    await loginAs(page, 'member3');
    await pinNav(page);
    await expect(navBody(page).getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(navBody(page).getByRole('link', { name: 'Reports' })).toHaveCount(0);
    await expect(navBody(page).getByRole('link', { name: 'Admin' })).toHaveCount(0);
  });

  test('the glass surface lets the themed canvas through without flattening text', async ({
    page,
  }) => {
    await pinNav(page);
    const shell = nav(page).locator('[data-slot="sidebar-container"]');
    // Marble (the app default) is a translucent glass rule keyed off data-slot.
    const surface = await shell.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, blur: cs.backdropFilter, border: cs.borderTopColor };
    });
    expect(surface.bg).toMatch(/rgba?\(/);
    // Translucent surface => the background canvas is visible through it.
    const alpha = Number((surface.bg.match(/[\d.]+\)$/) || ['1)'])[0].replace(')', ''));
    expect(alpha).toBeLessThan(1);
    // Assert the real value: an unset backdrop-filter computes to the STRING
    // "none", never "", so `not.toBe('')` could never have failed.
    expect(surface.blur).toMatch(/blur\(\d/);
    // The gold marble accent applies to every side (it was a sidebar-era
    // border-right, which drew one stripe down a rounded floating card).
    expect(surface.border).toBe('rgba(212, 175, 55, 0.35)');
  });
});

test.describe('floating nav — narrow widths', () => {
  test('the dock still fits and never overlaps the page at 768 and 1280', async ({ page }) => {
    for (const width of [768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await loginAs(page, 'admin');
      await expect(nav(page)).toBeVisible();
      expect(await mainMargin(page)).toBe(80);

      await pinNav(page);
      const box = await navBox(page);
      const main = (await page.locator('main').boundingBox())!;
      expect(main.x, `main must clear the open dock at ${width}`).toBeGreaterThanOrEqual(
        box.x + box.width,
      );
      // The page itself must never pan horizontally.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `no horizontal pan at ${width}`).toBeLessThanOrEqual(1);
    }
  });

  test('a short viewport keeps the menu scrollable rather than clipped', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 500 });
    await loginAs(page, 'admin');
    await pinNav(page);

    const body = navBody(page);
    // Sign Out lives at the very bottom of the panel; it must be reachable.
    const signOut = body.getByRole('button', { name: /sign out/i });
    await signOut.scrollIntoViewIfNeeded();
    await expect(signOut).toBeVisible();

    const box = await navBox(page);
    expect(box.y + box.height).toBeLessThanOrEqual(500 + 1);
  });

  test('below md the dock is absent and MobileNav owns navigation (req 2)', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await loginAs(page, 'admin');

    await expect(nav(page)).toBeHidden();
    await expect(page.locator('nav.fixed.bottom-0')).toBeVisible();
    expect(await mainMargin(page)).toBe(0);
  });
});

test.describe('floating nav — reduced motion', () => {
  test.use({ viewport: DESKTOP });

  test('honors prefers-reduced-motion (req 20)', async ({ page }) => {
    // Emulated rather than set via test.use: the repo's custom `test` fixture
    // doesn't surface Playwright's reducedMotion option to the type checker.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loginAs(page, 'admin');
    const durations = await nav(page).evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(durations).toMatch(/^(0s|0s,\s*0s)$/);

    // It must still function, just without the glide.
    await nav(page).hover();
    await expect(nav(page)).toHaveAttribute('data-open', 'true');
    await expect.poll(() => mainMargin(page)).toBe(284);
  });
});
