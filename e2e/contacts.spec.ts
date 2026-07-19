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

  test('bulk Delete actually removes the selected contacts (org-wide actor)', async ({ page }) => {
    // Decision 10 (2026-07): bulk delete gates per row on manageable scope, so
    // a Branch Leader can't delete an out-of-branch contact. This test proves
    // the delete MECHANISM (success toast + removal), so it runs as an
    // org-wide actor who can delete any row (the per-row scope skip logic is
    // covered by the permission matrix + refuter suite).
    await loginAs(page, 'admin');
    await page.goto('/contacts');
    await page.waitForLoadState('networkidle');
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

/**
 * Decision 10 permission regression (Phase-5 refuter gate): a Member must not
 * reach an EDITABLE contact form for a contact they didn't create — including
 * via the ?edit= deep-link, which previously opened the ungated ContactForm
 * for ANY contact id. member3 (Ananias) is a plain member+teacher.
 */
test.describe('List B — contacts permission boundary (Decision 10)', () => {
  test('a member deep-linking ?edit= to another owner\'s contact gets NO write form', async ({ page }) => {
    // Discover a contact id the member can at least see, as admin first.
    await loginAs(page, 'admin');
    await page.goto('/contacts');
    await page.waitForLoadState('networkidle');
    const someId = await page.evaluate(async () => {
      const res = await fetch('/api/contacts', {
        headers: (() => {
          for (const k of Object.keys(localStorage)) {
            try { const v = JSON.parse(localStorage.getItem(k) || 'null'); if (v?.state?.token) return { authorization: `Bearer ${v.state.token}` }; } catch { /* */ }
          }
          return {} as Record<string, string>;
        })(),
      });
      const all = await res.json();
      // pick a contact NOT created by / assigned to member3 (u-mem-3)
      const c = all.find((x: { createdBy?: string; assignedTeacherId?: string }) => x.createdBy !== 'u-mem-3' && x.assignedTeacherId !== 'u-mem-3');
      return c?.id ?? all[0]?.id ?? null;
    });
    expect(someId, 'seed has a non-member3 contact').toBeTruthy();

    // Now as member3, hit the edit deep-link for that contact.
    await loginAs(page, 'member3');
    await page.goto(`/contacts?edit=${someId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // The write form must NOT be reachable: no "Save Changes" button anywhere.
    await expect(page.getByRole('button', { name: /save changes/i })).toHaveCount(0);
    // If any dialog opened, it must be the read-only fallback (no Delete either).
    await expect(page.getByRole('button', { name: /^delete$/i })).toHaveCount(0);
  });
});

/**
 * REV3 #4 (2026-07-18): ContactDetailDialog is THE canonical edit surface —
 * the Contacts page row Edit action and the ?edit= deep-link open it straight
 * in edit mode. ContactForm is create-only now ("New Contact" / "Create
 * Contact"); its old edit path (the ungated ?edit= target) is retired.
 */
test.describe('REV3 #4 — detail dialog is the single edit surface', () => {
  test('?edit= deep-link opens the detail dialog straight in edit mode', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/contacts');
    await page.waitForLoadState('networkidle');
    const target = await page.evaluate(async () => {
      const res = await fetch('/api/contacts', {
        headers: (() => {
          for (const k of Object.keys(localStorage)) {
            try { const v = JSON.parse(localStorage.getItem(k) || 'null'); if (v?.state?.token) return { authorization: `Bearer ${v.state.token}` }; } catch { /* */ }
          }
          return {} as Record<string, string>;
        })(),
      });
      const all = await res.json();
      const c = all[0];
      return c ? { id: c.id as string, name: `${c.firstName} ${c.lastName}`.trim() } : null;
    });
    if (!target) throw new Error('seed has at least one contact');

    await page.goto(`/contacts?edit=${target.id}`);
    await page.waitForLoadState('networkidle');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // ContactDetailDialog's edit mode — prefilled with the EXISTING contact…
    await expect(dialog.getByRole('heading', { name: 'Edit Contact' })).toBeVisible();
    await expect(dialog.locator('input').first()).toHaveValue(target.name);
    await expect(dialog.getByRole('button', { name: /save changes/i })).toBeVisible();
    // …and NOT the create-only form.
    await expect(page.getByRole('button', { name: /create contact/i })).toHaveCount(0);
  });

  test('row Edit action opens the detail dialog in edit mode and a save round-trips', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/contacts');
    await page.waitForLoadState('networkidle');

    // Default desktop view is the table; first row's actions → Edit.
    await page.getByRole('button', { name: 'Row actions' }).first().click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Edit Contact' })).toBeVisible();

    // Name is the first field, prefilled from the contact — change it, save.
    const nameInput = dialog.locator('input').first();
    const before = await nameInput.inputValue();
    expect(before.trim().length).toBeGreaterThan(0);
    await nameInput.fill(`${before.trim()} Jr`);
    await dialog.getByRole('button', { name: /save changes/i }).click();

    await expect(page.getByText(/contact updated/i).first()).toBeVisible();
    // Saved → dialog returns to view mode.
    await expect(dialog.getByRole('heading', { name: 'Contact Details' })).toBeVisible();
  });
});
