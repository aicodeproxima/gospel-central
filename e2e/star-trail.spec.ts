import { test, expect } from './fixtures';
import { loginAs } from './helpers/loginAs';

/**
 * REV3 #8 — the marble theme's gold cursor trail must spawn AT the cursor.
 *
 * The app sets `:root { zoom: 0.9 }` at >=1280px viewports; the trail spawns
 * position:fixed divs whose left/top used the raw clientX/Y, so every star
 * rendered at 0.9x its coordinate (measured live: spawn@600 -> painted at 540).
 * GoldStarTrail now divides by the effective root zoom. This spec fails loudly
 * if the compensation regresses: pre-fix the x error at these coordinates is
 * ~60px, far outside the tolerance.
 */

test.skip(({ viewport }) => (viewport?.width ?? 0) < 1280, 'zoom 0.9 only applies at >=1280 — that is the band the fix corrects');
// WebKit-under-automation never delivers these synthetic mousemoves to the page
// listener (same family as the WebKit event quirks pinned in project memory), so
// no star spawns to measure. The compensation itself is engine-independent
// arithmetic (left = clientX / rootZoom); the chromium pin is the regression net.
test.skip(({ browserName }) => browserName !== 'chromium', 'synthetic mousemove does not reach page listeners on automated WebKit');

test('a trail star paints at the cursor coordinate under root zoom (REV3 #8)', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Two moves: the first primes the throttle origin, the second (>18px away)
  // spawns a star at exactly (600, 400).
  await page.mouse.move(200, 200);
  await page.mouse.move(600, 400);

  const star = page.locator('.gold-star-trail').last();
  await expect(star).toBeAttached({ timeout: 600 });
  const box = (await star.boundingBox())!;
  // Top-left anchored 12x12 div. x must land on the coordinate; y drifts
  // UPWARD during the 620ms fade animation, so it gets a one-sided allowance.
  expect(Math.abs(box.x - 600), 'star x must equal the cursor x').toBeLessThan(4);
  expect(400 - box.y, 'star y may only drift upward from the cursor y').toBeGreaterThanOrEqual(-4);
  expect(400 - box.y, 'star y must stay near the cursor y').toBeLessThan(30);
});
