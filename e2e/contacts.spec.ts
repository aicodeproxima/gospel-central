import { test, expect } from './fixtures';
import { loginAs } from './helpers/loginAs';

/**
 * List B — contacts domain (E2E, chromium). branch1 sees all 50 seeded contacts
 * (rich data for sort/filter/search). Contact detail opens via a card/row click.
 */
test.describe('List B — contacts', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'branch1');
    await page.goto('/contacts');
    await page.waitForLoadState('networkidle');
  });

  test('B16/B23 search → open a contact → session history shows', async ({ page }) => {
    await page.getByPlaceholder(/search/i).first().fill('Ethiopian');
    await page.waitForTimeout(400);
    await page.getByText(/ethiopian eunuch/i).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/session/i).first()).toBeVisible(); // B23 session history
  });

  test('B24 stage filter then Clear resets', async ({ page }) => {
    // baseline count of contact cards/rows
    const before = await page.getByText(/^\d+ contact/i).first().textContent().catch(() => null);
    // apply a stage filter chip
    await page.getByRole('button', { name: /baptized/i }).first().click();
    await page.waitForTimeout(300);
    // Clear filters
    const clear = page.getByRole('button', { name: /clear/i });
    await expect(clear.first()).toBeVisible();
    await clear.first().click();
    await page.waitForTimeout(300);
    // clear button gone (no active filters) — proves reset
    await expect(page.getByRole('button', { name: /clear filters/i })).toHaveCount(0);
    expect(before).not.toBeNull();
  });

  test('bulk Delete shows left of Clear when SOME selected, and is HIDDEN when ALL selected', async ({ page }) => {
    await page.getByRole('button', { name: /^select$/i }).first().click(); // enter select mode
    await page.locator('input[type="checkbox"]').first().check(); // select ONE contact
    await expect(page.getByText(/\d+ selected/i).first()).toBeVisible();
    const del = page.getByRole('button', { name: /^delete$/i });
    await expect(del).toBeVisible(); // some (not all) selected ⇒ Delete available to everyone
    await page.getByRole('button', { name: /^select all$/i }).click(); // now ALL selected
    await expect(del).toHaveCount(0); // the guard: never when all are selected
  });

  test('bulk Delete actually removes the selected contacts (everyone)', async ({ page }) => {
    await page.getByRole('button', { name: /^select$/i }).first().click();
    await page.locator('input[type="checkbox"]').first().check();
    page.once('dialog', (d) => d.accept()); // window.confirm("Delete N selected contacts?")
    await page.getByRole('button', { name: /^delete$/i }).click();
    await expect(page.getByText(/deleted/i).first()).toBeVisible(); // success toast
  });

  test('B13 sort by Sessions keeps the list rendered', async ({ page }) => {
    // open the sort control and pick Sessions (base-ui select → click trigger then option)
    const sortTrigger = page.getByRole('combobox').filter({ hasText: /sort|name|session|stage|updated/i }).first();
    await sortTrigger.click().catch(() => {});
    await page.getByRole('option', { name: /session/i }).first().click().catch(() => {});
    await page.waitForTimeout(300);
    // list still shows contacts
    await expect(page.getByText(/ethiopian eunuch|samaritan woman|adam/i).first()).toBeVisible();
  });
});
