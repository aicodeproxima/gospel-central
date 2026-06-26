import { test, expect } from './fixtures';
import { loginAs } from './helpers/loginAs';

/**
 * List B — booking domain (E2E, chromium). member3 (Ananias) is a teacher so they
 * appear in the wizard's teacher picker. The booking wizard uses base-ui
 * comboboxes (portal'd) — prefer the dialog-scoped role/text locators proven in
 * permissions.spec.ts.
 */
test.describe('List B — booking', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'member3');
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');
  });

  test('B9 color legend is shown', async ({ page }) => {
    const legendBtn = page.getByRole('button', { name: /legend/i });
    if (await legendBtn.count()) await legendBtn.first().click();
    await expect(page.getByText(/unbaptized/i).first()).toBeVisible();
  });

  test('B1 the Book button opens the wizard at the activity step', async ({ page }) => {
    await page.getByRole('button', { name: /^book$/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/bible study/i).first()).toBeVisible();
    await expect(dialog.getByText(/group activity/i).first()).toBeVisible();
  });

  test('B4 the room step surfaces availability (free-slot counts)', async ({ page }) => {
    await page.getByRole('button', { name: /^book$/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Activity = Bible Study, then advance to the Room step.
    await dialog.getByText(/bible study/i).first().click();
    // Walk Next until a room option with a free-slot count appears (max a few steps).
    for (let i = 0; i < 4; i++) {
      if (await dialog.getByText(/free 30-min slot|fully booked/i).first().isVisible().catch(() => false)) break;
      await dialog.getByRole('button', { name: /^next$/i }).first().click().catch(() => {});
      await page.waitForTimeout(300);
    }
    await expect(dialog.getByText(/free 30-min slot|fully booked/i).first()).toBeVisible();
  });
});

/**
 * Booking LIFECYCLE — DRIVEN behavioral E2E (admin/Dev edits any booking).
 * Replaces the source-grep oracle (critical-scenarios.test.ts) with real behavior:
 * reschedule moves the time, cancel marks the card, restore reverts — all observed
 * same-page (in-place reloadBookings, no document reload).
 *
 * NOTE on the date: the calendar's selectedDate reads the REAL clock (booking-store
 * `new Date()`), NOT the pinned mock date (the documented R3 finding) — so the view
 * opens on the real today. The seed fills the whole pinned week (2026-06-22..28); the
 * GET /bookings range is ignored so all seeds are returned and filtered client-side
 * by the visible day. These cells therefore require the real clock to be inside the
 * seeded week; the guard below fails LEGIBLY if it isn't (fix = pin the calendar clock).
 *
 * A booking CARD has a time RANGE in its title ("8:00 — 9:00"); empty slots are
 * "Click to book 8:00 AM" (single time) — so match a range to avoid opening the
 * new-booking wizard by accident.
 */
const RANGE = String.raw`\d{1,2}:\d{2}[^\n]{0,15}\d{1,2}:\d{2}`;

test.describe('booking lifecycle (admin) — driven', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');
  });

  // multiset of booking-card time-ranges on the current Day view (booking cards only)
  const dayTimes = (page: import('@playwright/test').Page) => page.evaluate((rangeSrc) => {
    const re = new RegExp(rangeSrc);
    return [...document.querySelectorAll('button[title]')]
      .filter((b) => (b as HTMLElement).getBoundingClientRect().width > 0 && re.test(b.getAttribute('title') || ''))
      .map((b) => (b.getAttribute('title') || '').match(re)![0])
      .sort();
  }, RANGE);
  // cancelled booking-card count (BookingCard.tsx:66 — opacity-35 border-dashed)
  const cancelledCount = (page: import('@playwright/test').Page) => page.evaluate((rangeSrc) => {
    const re = new RegExp(rangeSrc);
    return [...document.querySelectorAll('button[title]')]
      .filter((b) => b.className.includes('opacity-35') && (b as HTMLElement).getBoundingClientRect().width > 0 && re.test(b.getAttribute('title') || '')).length;
  }, RANGE);

  // first ACTIVE booking card — getByTitle(range) is reliable (Playwright click, proven
  // in C3); fresh seed has no cancelled bookings so .first() is active.
  const activeBookingCard = (page: import('@playwright/test').Page) => page.getByTitle(new RegExp(RANGE)).first();

  test('reschedule moves a booking time on the calendar (same-page, no reload)', async ({ page }) => {
    const before = await dayTimes(page);
    expect(before.length, 'real-clock day has seeded bookings (else real-now drifted outside the seed week 06-22..28 — pin the calendar clock)').toBeGreaterThan(0);

    await activeBookingCard(page).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole('button', { name: /save changes/i }), 'opened the EDIT wizard (not a new booking)').toBeVisible();
    // confirm-step "Time" row (Row = a <button>, name starts with the label "Time") → the time step
    await dlg.getByRole('button', { name: /^time/i }).first().click();
    await page.waitForTimeout(300);
    // pick a FREE (enabled), non-current slot in the grid (selected slot has bg-primary)
    const gridBtns = dlg.locator('[class*="grid-cols-3"] button:not([disabled])');
    const n = await gridBtns.count();
    let picked = false;
    for (let i = 0; i < n; i++) {
      const cls = (await gridBtns.nth(i).getAttribute('class')) || '';
      if (!cls.includes('bg-primary')) { await gridBtns.nth(i).click(); picked = true; break; }
    }
    expect(picked, 'a free, non-current slot exists to move into').toBe(true);
    // the time step footer has Review/Next (NOT Save Changes) — return to confirm, then save
    await dlg.getByRole('button', { name: /^review$/i }).first().click().catch(() => dlg.getByRole('button', { name: /^next$/i }).first().click());
    await dlg.getByRole('button', { name: /save changes/i }).click();
    await expect(dlg).toBeHidden({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(700);

    const after = await dayTimes(page);
    expect(after.length, 'no booking duplicated or lost').toBe(before.length);
    expect(JSON.stringify(after), 'a booking time MOVED on the calendar same-page').not.toBe(JSON.stringify(before));
  });

  test('cancel marks the card cancelled, and restore reverts it (same-page inverse)', async ({ page }) => {
    const beforeCancelled = await cancelledCount(page);
    await activeBookingCard(page).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg).toBeVisible();
    await dlg.getByRole('button', { name: /cancel booking/i }).first().click(); // opens reason overlay
    await dlg.locator('textarea').last().fill('_AUDIT_lifecycle cancel');
    await page.getByRole('button', { name: /^cancel booking$/i }).last().click(); // confirm destructive
    await expect(page.getByText(/booking cancelled/i).first()).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(500);
    expect(await cancelledCount(page), 'cancel reflects same-page (+1 cancelled card)').toBe(beforeCancelled + 1);

    // restore — the cancelled card is the one with opacity-35 (BookingCard.tsx:66); reopen + Restore
    await page.locator('button[title][class*="opacity-35"]').first().click();
    await expect(dlg).toBeVisible();
    await dlg.getByRole('button', { name: /^restore$/i }).first().click();
    await expect(page.getByText(/booking restored/i).first()).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(500);
    expect(await cancelledCount(page), 'restore reverts same-page (back to baseline)').toBe(beforeCancelled);
  });
});
