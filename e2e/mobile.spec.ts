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

  // B25 — the org page must fit phone width with no pan in BOTH view modes.
  // List is the DEFAULT since G1 (groupsDefaultView), and the "Org Tree"
  // title pill is xl-only — so assert readiness via rendered org rows, then
  // toggle to 3D and re-check fitment there.
  test('B25 the org page fits phone width in List and 3D views', async ({ page }) => {
    await loginAs(page, 'branch1');
    await page.goto('/groups');
    await expect(page.getByText(/michael|gabriel|joseph/i).first()).toBeVisible();
    expect(await pageOverflowPx(page), '/groups (List) must not pan').toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: /^3d$/i }).first().click();
    await expect(page.getByText(/drag to pan/i).first()).toBeVisible(); // 3D scene mounted
    expect(await pageOverflowPx(page), '/groups (3D) must not pan').toBeLessThanOrEqual(1);
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

  // Tap targets ≥ 44×44 on the S24 (the user's explicit bar), scoped to ACTIONABLE
  // CONTROLS: buttons / links / nav / tabs / menuitems. Per the standard target-size
  // intent, text inputs + selects + switches (tapping a field/toggle is forgiving)
  // and secondary pill filter-chips are held to the WCAG-AA 24px floor instead — so
  // they're excluded from the ≥44 set here (allowlist). Measured on the 4 stable
  // pages; the booking-wizard + contacts select-mode surfaces crash the PW renderer,
  // so their controls (close-X, duration/slots, bulk-bar) are fixed by source instead.
  test('tap targets are >= 44x44 on the S24 Ultra (actionable controls)', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'member3');
    const SEL = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"]';
    const collect = (label: string) => page.evaluate(({ sel, label }) => {
      const isChip = (c: string) => c.includes('rounded-full') && (c.includes('text-xs') || c.includes('text-[10px]'));
      return [...document.querySelectorAll(sel as string)].filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el as Element);
        if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') return false;
        const c = (el.className || '').toString();
        if (r.width < 12 || r.height < 12) return false;        // decorative / measuring nodes
        if (isChip(c) || c.includes('text-[10px]')) return false; // secondary pill chips / micro-labels (AA-24 tier)
        const t = (el.textContent || '').trim();
        if (/accessoryseezin|built by/i.test(t)) return false;  // attribution / inline prose link
        return r.width < 44 || r.height < 44;
      }).map((el) => {
        const r = el.getBoundingClientRect();
        return { page: label, tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 22), w: Math.round(r.width), h: Math.round(r.height), cls: (el.className || '').toString().slice(0, 50) };
      });
    }, { sel: SEL, label });

    const v: unknown[] = [];
    for (const p of ['/dashboard', '/contacts', '/settings', '/calendar']) {
      await page.goto(p);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(350);
      v.push(...(await collect(p)));
    }
    expect(v, `actionable tap targets < 44px on S24:\n${JSON.stringify(v, null, 2)}`).toEqual([]);
  });

  // F-0001 (UI audit run-20260704a) — the fixed bottom nav must OCCLUDE content
  // scrolling beneath it. --card is deliberately translucent under the glass-look
  // themes (marble 0.75 alpha, animated 0.35–0.4), so a bare bg-card nav let page
  // text bleed through and collide with the nav labels on every mobile route.
  // Guard: for one theme per alpha class, the nav's computed background must be
  // fully opaque OR carry a real backdrop blur (the Topbar frosted-glass idiom).
  // Fires again if a future theme ships a translucent --card and the nav regresses.
  test('F-0001 bottom nav occludes scrolled content on every theme alpha class', async ({ page }) => {
    await loginAs(page, 'member3');
    for (const theme of ['basic', 'marble', 'galaxy']) {
      await page.evaluate((t) => {
        // Both keys required to force a theme headlessly: zustand-persist (v4) + next-themes.
        localStorage.setItem(
          'gospel-central-preferences',
          JSON.stringify({ state: { colorTheme: t }, version: 4 }),
        );
        localStorage.setItem('theme', 'dark');
      }, theme);
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      const nav = page.locator('nav.fixed.bottom-0');
      await expect(nav).toBeVisible();
      const { alpha, hasBlur, bg } = await nav.evaluate((el) => {
        const cs = getComputedStyle(el);
        const bgc = cs.backgroundColor;
        // Computed color may serialize as rgb()/rgba() or oklch(... / a).
        let a = 1;
        const slash = bgc.match(/\/\s*([\d.]+)\s*\)/);
        const rgba = bgc.match(/^rgba\([^)]*,\s*([\d.]+)\)$/);
        if (slash) a = parseFloat(slash[1]);
        else if (rgba) a = parseFloat(rgba[1]);
        const bf =
          cs.backdropFilter ||
          (cs as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter ||
          '';
        return { alpha: a, hasBlur: /blur\(/.test(bf), bg: bgc };
      });
      expect(
        alpha === 1 || hasBlur,
        `theme "${theme}": bottom-nav background "${bg}" (alpha=${alpha}, blur=${hasBlur}) — a translucent, un-blurred nav lets content collide with the labels (F-0001)`,
      ).toBe(true);
      expect(await pageOverflowPx(page), `theme "${theme}" must not pan`).toBeLessThanOrEqual(1);
    }
  });
});
