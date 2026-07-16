import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Pin the md+ "Dock and Glide" navigation open and wait for the glide to settle.
 *
 * The menu is a 52px launcher by default and its contents are `inert` +
 * `aria-hidden` until it opens, so any test that needs to see or click a nav
 * link, the profile, or Sign Out must pin it first. Pinning (rather than
 * hovering) keeps it open across clicks and pointer moves.
 *
 * No-op below md, where the bottom MobileNav owns navigation instead.
 */
export async function pinNav(page: Page): Promise<void> {
  const nav = page.getByTestId('floating-nav');
  if (!(await nav.isVisible().catch(() => false))) return;

  const toggle = nav.getByRole('button', { name: /navigation/i });
  if ((await toggle.getAttribute('aria-pressed')) === 'true') return;

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(nav).toHaveAttribute('data-open', 'true');
  // Wait for the 220ms glide to FINISH, not merely to start: callers measure
  // geometry against this, and a mid-glide panel yields a smaller dock and a
  // half-moved page margin. Assert the authored computed width (~256px —
  // zoom-independent, unlike boundingBox, which the >=1280 root zoom scales to
  // 230.4) so the settle test is the same at every width. A loose "wider than
  // the launcher" threshold raced the animation on Playwright-WebKit, which
  // renders this page at ~3fps.
  await expect
    .poll(
      async () => parseFloat(await nav.evaluate((el) => getComputedStyle(el).width)),
      { timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(255);

  // The page margin is a SEPARATE framer tween on <main> (80 → 284) that the
  // aside's width settle does not cover — at Playwright-WebKit's ~3fps it can
  // still be mid-glide (or un-started) when the aside is already 256px wide,
  // so callers comparing main/nav geometry raced it. Settle both.
  const main = page.locator('main');
  if (await main.count()) {
    await expect
      .poll(
        async () => Math.round(parseFloat(await main.evaluate((el) => getComputedStyle(el).marginLeft))),
        { timeout: 10_000 },
      )
      .toBe(284);
  }
}
