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

  test('B1 the Book button opens the wizard on the When page', async ({ page }) => {
    await page.getByRole('button', { name: /^book$/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Phase 4: "When" is always the first page — the 2x2 activity-group
    // selector + the WhenStep time grid are both visible immediately, no
    // separate activity/date steps to walk through first.
    await expect(dialog.getByRole('button', { name: /^bible study$/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^group activity$/i })).toBeVisible();
    // A time-grid section exists — the "All day" button (WhenStep.tsx) is a
    // stable, non-i18n-drifting anchor for "the time picker rendered".
    await expect(dialog.getByRole('button', { name: /^all day$/i })).toBeVisible();
    // Next is disabled until an activity + a time range are picked (canAdvance).
    await expect(dialog.getByRole('button', { name: /^next$/i })).toBeDisabled();
  });

  test('B4 the room step surfaces availability (free-slot counts)', async ({ page }) => {
    await page.getByRole('button', { name: /^book$/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Activity = Bible Study (reveals the In-Person/Zoom + Unbaptized/Baptized
    // segments), pick the longest free run via "All day" (deterministic under
    // the pinned seed — no dependence on which slots happen to be free),
    // then the two study-only segments, before Next unlocks.
    await dialog.getByRole('button', { name: /^bible study$/i }).click();
    await dialog.getByRole('button', { name: /^all day$/i }).click();
    // Mode + baptism segments are role="radio" (WhenStep.tsx), not plain buttons.
    await dialog.getByRole('radio', { name: /^in person$/i }).click();
    await dialog.getByRole('radio', { name: /^unbaptized$/i }).click();
    await expect(dialog.getByRole('button', { name: /^next$/i })).toBeEnabled();
    await dialog.getByRole('button', { name: /^next$/i }).click();
    await expect(dialog.getByText(/free 30-min slot|fully booked|not free at the selected time/i).first()).toBeVisible();
  });

  test('B-NEW the duration selector is gone', async ({ page }) => {
    await page.getByRole('button', { name: /^book$/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Phase 4: duration is derived from the picked start->end range — the old
    // fixed-duration buttons ("60 min" / "90 min") no longer exist anywhere
    // in the wizard.
    await expect(dialog.getByRole('button', { name: /^60 min$/ })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /^90 min$/ })).toHaveCount(0);
  });

  test('B-NEW the step badge counts 6 steps for a study', async ({ page }) => {
    await page.getByRole('button', { name: /^book$/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Bible Study = when->room->leader->contact->subject->confirm (6 steps).
    // Badge text is t('wizard.step') + n + t('misc.of') + total = "Step 1 of 6".
    await dialog.getByRole('button', { name: /^bible study$/i }).click();
    await expect(dialog.getByText(/step\s*1\s*of\s*6/i)).toBeVisible();
  });
});

/**
 * Booking LIFECYCLE — DRIVEN behavioral E2E (admin/Dev edits any booking).
 * Replaces the source-grep oracle (critical-scenarios.test.ts) with real behavior:
 * reschedule moves the time, cancel marks the card, restore reverts — all observed
 * same-page (in-place reloadBookings, no document reload).
 *
 * DETERMINISM: booking-store seeds selectedDate from mockNow(), so under test the
 * calendar opens on the PINNED Monday (2026-06-22) — the same week the seed fills —
 * regardless of the real clock (in prod mockNow() is the real clock, so prod is
 * unchanged). The day therefore always has seeded bookings to operate on.
 *
 * A booking CARD has a time RANGE in its title ("8:00 — 9:00"); empty slots are
 * "Click to book 8:00 AM" (single time) — so match a range to avoid opening the
 * new-booking wizard by accident.
 *
 * Phase 4: the confirm-step "Time" row now jumps to the When page (it used to
 * open a dedicated time step). The When page's slot grid columns carry class
 * `sm:grid-cols-3` (CSS attribute-contains still matches `[class*="grid-cols-3"]`
 * on the responsive variant), the 7-day strip is `grid-cols-7`, and the
 * activity selector is `grid-cols-2` — none of those collide with slot
 * buttons, but slot buttons are scoped further by an accessible name that
 * looks like a clock time (e.g. "8:00 AM") to stay unambiguous. Clicking a
 * single slot sets a 30-min range STARTING there, so an edited booking's
 * start time AND duration both change (to 30 min) — the test only asserts
 * the time-range multiset changed, which still holds.
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
    // proves the determinism pin: the calendar opens on the mock Monday, not real-today
    await expect(page.getByText(/Monday, June 22, 2026/i).first(), 'calendar pinned to MOCK_DATE (booking-store mockNow)').toBeVisible();
    const before = await dayTimes(page);
    expect(before.length, 'the pinned Monday (2026-06-22) has seeded bookings to reschedule').toBeGreaterThan(0);

    await activeBookingCard(page).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole('button', { name: /save changes/i }), 'opened the EDIT wizard (not a new booking)').toBeVisible();
    // confirm-step "Time" row (Row = a <button>, name starts with the label "Time") → now jumps
    // to the When page (Phase 4 — there is no separate time step anymore).
    await dlg.getByRole('button', { name: /^time/i }).first().click();
    await page.waitForTimeout(300);
    // pick a FREE (enabled), non-current slot in the grid (selected slot has bg-primary).
    // Scope to buttons whose accessible name looks like a clock time (e.g. "8:00 AM") so this
    // can't ambiguously match the day-strip (grid-cols-7) or activity selector (grid-cols-2).
    const gridBtns = dlg.locator('[class*="grid-cols-3"] button:not([disabled])').filter({ hasText: /^\d{1,2}:\d{2}/ });
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
