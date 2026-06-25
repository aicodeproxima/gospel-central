import { test, expect } from './fixtures';
import { loginAs } from './helpers/loginAs';

test.describe('permission boundaries — UI affordances', () => {
  test('B20 Export on /contacts is gated to Branch Leader+', async ({ page }) => {
    await loginAs(page, 'member3');
    await page.goto('/contacts');
    await expect(page.getByRole('button', { name: /add contact/i }).first()).toBeVisible(); // loaded
    await expect(page.getByText(/^export$/i)).toHaveCount(0);

    await loginAs(page, 'branch1');
    await page.goto('/contacts');
    await expect(page.getByRole('button', { name: /add contact/i }).first()).toBeVisible();
    await expect(page.getByText(/^export$/i).first()).toBeVisible(); // the export <Select> trigger
  });

  test('Add User on /groups is gated to Team Leader+', async ({ page }) => {
    await loginAs(page, 'member3');
    await page.goto('/groups');
    await expect(page.getByText(/organization/i).first()).toBeVisible(); // loaded
    await expect(page.getByRole('button', { name: /add user/i })).toHaveCount(0);

    await loginAs(page, 'team1');
    await page.goto('/groups');
    await expect(page.getByText(/organization/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /add user/i }).first()).toBeVisible();
  });

  test('B11 a non-owner opens a booking READ-ONLY (outside your scope)', async ({ page }) => {
    await loginAs(page, 'member3'); // Ananias owns only a few bookings; most are others'
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');
    const btns = page.locator('button[title]');
    await expect(btns.first()).toBeVisible();
    const titles = await btns.evaluateAll((els) => els.map((e) => e.getAttribute('title') || ''));
    const dialog = page.getByRole('dialog');
    const badge = page.getByText(/read-only.*outside your scope/i);
    let found = false;
    let openedAny = false;
    for (let i = 0; i < titles.length && !found; i++) {
      if (!/(study|meeting|activity|\bwith\b|\d{1,2}:\d{2})/i.test(titles[i])) continue; // skip nav/icon buttons
      await btns.nth(i).click();
      await dialog.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
      if (await dialog.isVisible().catch(() => false)) openedAny = true;
      if (await badge.isVisible({ timeout: 1500 }).catch(() => false)) {
        found = true;
        break;
      }
      await page.keyboard.press('Escape'); // owned/editable — close before trying the next
      await dialog.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
    }
    expect(openedAny, 'clicking a booking opened the edit wizard').toBe(true);
    expect(found, 'a booking not owned by member3 shows the read-only badge').toBe(true);
  });
});
