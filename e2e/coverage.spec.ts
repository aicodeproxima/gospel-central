import { test, expect } from './fixtures';
import { loginAs } from './helpers/loginAs';

/**
 * List B — the two cells the plan earmarked as MANUAL turned out to be
 * deterministically automatable, so they're E2E (durable + CI-gating, better
 * than a one-off browser agent):
 *  - B19  CSV import uses a standard <input type=file> → Playwright setInputFiles
 *         (no native OS picker), so the whole import flow is scriptable.
 *  - B50  "cover a sick teammate's week" = the POSITIVE scope path of
 *         canEditBooking (the inverse of B11's read-only). The subtree RULE is
 *         already unit-proven (src/lib/utils/permissions.test.ts "leader edits
 *         within subtree"); this E2E proves the calendar WIRES it — a Team Leader
 *         reaches an editable booking (no "outside your scope" badge), i.e. can
 *         step in to manage a teammate's bookings.
 */
test.describe('List B — coverage (B19 import, B50 leader scope)', () => {
  test('B19 a Branch Leader imports contacts from a CSV file', async ({ page }) => {
    await loginAs(page, 'branch1');
    await page.goto('/contacts');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /import/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/import contacts from csv/i)).toBeVisible();
    const csv =
      'Name,Phone,Email,Stage,Sessions\n' +
      'R2 Import Aeneas,555-0100,aeneas@example.io,Regular,3\n' +
      'R2 Import Dorcas,555-0101,dorcas@example.io,Baptized,9\n';
    await dialog
      .locator('input[type="file"]')
      .setInputFiles({ name: 'r2-contacts.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(dialog.getByText(/rows found/i)).toBeVisible(); // preview parsed
    await dialog.getByRole('button', { name: /import \d+ contacts/i }).click();
    await expect(dialog.getByText(/\d+ imported/i)).toBeVisible(); // success badge
  });

  test('B50 a Team Leader can open an in-scope booking and edit it (cover a teammate)', async ({ page }) => {
    await loginAs(page, 'team1');
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');
    const btns = page.locator('button[title]');
    await expect(btns.first()).toBeVisible();
    const titles = await btns.evaluateAll((els) => els.map((e) => e.getAttribute('title') || ''));
    const dialog = page.getByRole('dialog');
    const readonly = page.getByText(/read-only.*outside your scope/i);
    let openedAny = false;
    let editable = false;
    for (let i = 0; i < titles.length && !editable; i++) {
      if (!/(study|meeting|activity|\bwith\b|\d{1,2}:\d{2})/i.test(titles[i])) continue; // skip nav/icon buttons
      await btns.nth(i).click();
      await dialog.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
      if (await dialog.isVisible().catch(() => false)) {
        openedAny = true;
        // editable ⇔ the wizard opened WITHOUT the read-only badge (canEditBooking true)
        if (!(await readonly.isVisible({ timeout: 1000 }).catch(() => false))) {
          editable = true;
          break;
        }
      }
      await page.keyboard.press('Escape'); // not this one — close and try the next
      await dialog.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
    }
    expect(openedAny, 'a Team Leader can open a booking from the calendar').toBe(true);
    expect(editable, 'a Team Leader reaches an EDITABLE booking (scope coverage, inverse of B11)').toBe(true);
  });
});
