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
  // The width transition is 220ms; wait it out so callers measure or click a
  // settled panel rather than a mid-glide one. Threshold rather than an exact
  // width: ≥1280 the root `zoom: 0.9` renders the 256px panel at 230.4 device
  // px, so only "much wider than the 52px launcher" is true at every width.
  await expect
    .poll(async () => (await nav.boundingBox())?.width ?? 0, { timeout: 2_000 })
    .toBeGreaterThan(200);
}
