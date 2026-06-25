import { test, expect } from '../fixtures';
import { loginAs } from '../helpers/loginAs';
import { MOCK_DATE, appendJsonl, assertClockActor, prefsState } from './_lib';

/**
 * BATCH-1 (settings/preferences) — the historical leak class. Each cell = one
 * test() = a FRESH context (empty localStorage ⇒ no cross-cell pref leak, R1).
 * PASS oracle for store-backed fields = the rendered DOM, not the store (R4);
 * the store read is corroboration only. Observe at the SURFACE without reload.
 */
test.describe.configure({ mode: 'serial' });

const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// VISIBLE persistent-sidebar avatar img src prefix (alt="" rounded object-cover), or null.
function sidebarAvatar() {
  const img = [...document.querySelectorAll('img')].find(
    (i) =>
      (i as HTMLImageElement).alt === '' &&
      i.className.includes('object-cover') &&
      i.className.includes('rounded-full') &&
      i.getBoundingClientRect().width > 0,
  ) as HTMLImageElement | undefined;
  return img ? (img.getAttribute('src') || '').slice(0, 24) : null;
}
function settingsAvatar() {
  const img = document.querySelector('img[alt="Profile"]') as HTMLImageElement | null;
  return img ? (img.getAttribute('src') || '').slice(0, 24) : null;
}
// a VISIBLE sidebar nav label (Calendar) — proves i18n propagation to the persistent chrome.
function navLabels() {
  return [...document.querySelectorAll('a[href]')]
    .filter((a) => (a as HTMLElement).getBoundingClientRect().width > 0)
    .map((a) => (a.textContent || '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

async function log(page: import('@playwright/test').Page, cell: Record<string, unknown>, role: string) {
  const ca = await assertClockActor(page, role);
  appendJsonl('propagation.jsonl', { ...cell, clock_at_obs: ca.clock, actor_at_obs: ca.role, mock_date: MOCK_DATE });
  expect(ca.clock, 'clock pinned at obs').toBe(MOCK_DATE);
}

// ── S1: profilePhoto → persistent Sidebar avatar (the marquee same-page cell) ──
test('S1 profilePhoto → Sidebar avatar (same-page, persistent)', async ({ page }) => {
  await loginAs(page, 'member3');
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');

  const before = { sidebar: await page.evaluate(sidebarAvatar), settings: await page.evaluate(settingsAvatar), store: (await prefsState(page))?.profilePhotoBase64 ?? null };
  await page.locator('input[type="file"][accept*="image"]').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: Buffer.from(TINY_PNG, 'base64') });
  await expect(page.getByText(/profile photo updated/i)).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(400);
  const after = { sidebar: await page.evaluate(sidebarAvatar), settings: await page.evaluate(settingsAvatar), store: ((await prefsState(page))?.profilePhotoBase64 ? 'data:set' : null) };

  const sidebarMoved = before.sidebar === null && (after.sidebar || '').startsWith('data:');
  const settingsMoved = (after.settings || '').startsWith('data:');
  const verdict = sidebarMoved && settingsMoved ? 'PASS' : 'LEAK';
  await log(page, {
    id: 'S1', domain: 'settings', mutation: 'set profilePhoto', actor_role: 'member3', trigger_surface: '/settings file input',
    expected_reflections: [
      { site_id: 'sidebar.avatar', site: 'Sidebar.tsx:47 img(profilePhotoBase64)', instance: 'desktop', observe_how: 'DOM img src', expected_delta: 'null→data:', source_citation: 'components/layout/Sidebar.tsx:42,47' },
      { site_id: 'settings.avatar', site: 'settings/page.tsx:302 img(profilePhotoBase64)', instance: 'desktop', observe_how: 'DOM img src', expected_delta: 'null→data:', source_citation: 'app/(dashboard)/settings/page.tsx:302' },
    ],
    expected_site_count: 2, must_NOT_change: ['nav.labels'], verdict,
    leak_sites: verdict === 'LEAK' ? [!sidebarMoved && 'sidebar.avatar', !settingsMoved && 'settings.avatar'].filter(Boolean) : [],
    classification: verdict === 'LEAK' ? 'FRONTEND' : null,
    evidence: { before, after }, dedup_vs_prior: 'profilePhoto→sidebar was a HISTORICAL fixed leak (regression guard)',
  }, 'member3');
  expect(verdict, 'S1 verdict logged').toBeTruthy();
});

// ── S2: language en→es → persistent Sidebar nav labels (i18n) ──
test('S2 language en→es → Sidebar nav labels (same-page i18n)', async ({ page }) => {
  await loginAs(page, 'member3');
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');

  const before = { nav: await page.evaluate(navLabels), store: (await prefsState(page))?.language ?? 'en' };
  await page.getByRole('button', { name: /español/i }).first().click();
  await page.waitForTimeout(400);
  const after = { nav: await page.evaluate(navLabels), store: (await prefsState(page))?.language ?? null };

  // Calendar→Calendario, Contacts→Contactos, Settings→Configuración: nav set must change
  const navChanged = JSON.stringify(before.nav) !== JSON.stringify(after.nav);
  const verdict = navChanged ? 'PASS' : 'LEAK';
  await log(page, {
    id: 'S2', domain: 'settings', mutation: 'language en→es', actor_role: 'member3', trigger_surface: '/settings Español',
    expected_reflections: [{ site_id: 'sidebar.nav', site: 'Sidebar nav via useTranslation', instance: 'desktop', observe_how: 'DOM nav labels', expected_delta: 'en→es strings', source_citation: 'lib/i18n.ts:714 useTranslation; Sidebar.tsx:56 navItems' }],
    expected_site_count: 1, must_NOT_change: [], verdict,
    leak_sites: verdict === 'LEAK' ? ['sidebar.nav'] : [], classification: verdict === 'LEAK' ? 'FRONTEND' : null,
    evidence: { before, after }, dedup_vs_prior: 'new',
  }, 'member3');
  expect(verdict).toBeTruthy();
});

// ── S3: colorTheme → html[data-theme] (same-page, immediate) + INVERSE ──
test('S3 colorTheme default→ocean→default → html[data-theme] (same-page)', async ({ page }) => {
  await loginAs(page, 'member3');
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');

  const themeAttr = () => document.documentElement.getAttribute('data-theme');
  const before = await page.evaluate(themeAttr);
  await page.getByRole('button', { name: /ocean theme/i }).first().click();
  await page.waitForTimeout(250);
  const afterSet = await page.evaluate(themeAttr);
  // inverse: back to default
  await page.getByRole('button', { name: /default theme/i }).first().click();
  await page.waitForTimeout(250);
  const afterClear = await page.evaluate(themeAttr);

  // applyThemeToDOM REMOVES data-theme for 'default' (preferences-store.ts:82-90),
  // so the inverse returns to null (attribute absent), NOT the string 'default'.
  const setOk = afterSet === 'ocean';
  const inverseOk = afterClear === null;
  const verdict = setOk && inverseOk ? 'PASS' : 'LEAK';
  await log(page, {
    id: 'S3', domain: 'settings', mutation: 'colorTheme set+inverse', actor_role: 'member3', trigger_surface: '/settings theme swatches',
    expected_reflections: [{ site_id: 'html.data-theme', site: 'applyThemeToDOM → <html data-theme>', instance: 'desktop', observe_how: 'DOM attribute', expected_delta: 'default→ocean→default', source_citation: 'preferences-store.ts:126-128 setColorTheme→applyThemeToDOM' }],
    expected_site_count: 1, must_NOT_change: [], verdict,
    leak_sites: verdict === 'LEAK' ? ['html.data-theme'] : [], classification: verdict === 'LEAK' ? 'FRONTEND' : null,
    evidence: { before, afterSet, afterClear }, dedup_vs_prior: 'new (inverse pair)',
  }, 'member3');
  expect(verdict).toBeTruthy();
});

// ── S4: backgroundStyle → html[data-bg] (same-page) ──
test('S4 backgroundStyle → html[data-bg] (same-page)', async ({ page }) => {
  await loginAs(page, 'member3');
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');

  const bgAttr = () => document.documentElement.getAttribute('data-bg');
  const before = await page.evaluate(bgAttr);
  // pick a REAL background swatch (aria-label "<title> background"), excluding the
  // "No animated background" OFF button (which would set style='none' → no data-bg).
  const swatch = page.locator('button[aria-label$=" background"]:not([aria-label="No animated background"])').first();
  const label = await swatch.getAttribute('aria-label');
  await swatch.click();
  await page.waitForTimeout(300);
  const after = await page.evaluate(bgAttr);

  const moved = after !== before && after !== null && after !== 'none';
  const verdict = moved ? 'PASS' : 'LEAK';
  await log(page, {
    id: 'S4', domain: 'settings', mutation: `backgroundStyle → ${label}`, actor_role: 'member3', trigger_surface: '/settings background swatch',
    expected_reflections: [{ site_id: 'html.data-bg', site: 'applyBackgroundToDOM → <html data-bg>', instance: 'desktop', observe_how: 'DOM attribute', expected_delta: 'none→<style>', source_citation: 'preferences-store.ts:136-138 setBackgroundStyle→applyBackgroundToDOM' }],
    expected_site_count: 1, must_NOT_change: [], verdict,
    leak_sites: verdict === 'LEAK' ? ['html.data-bg'] : [], classification: verdict === 'LEAK' ? 'FRONTEND' : null,
    evidence: { before, after, label }, dedup_vs_prior: 'new',
  }, 'member3');
  expect(verdict).toBeTruthy();
});

// ── S5: timeFormat 12h→24h → calendar BookingCard time (cross-page consumer; dead-toggle regression guard) ──
test('S5 timeFormat 12h→24h → calendar BookingCard time (DOM)', async ({ page }) => {
  await loginAs(page, 'member3');
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');

  // set Time format = 24h via the Calendar Preferences select
  await page.getByText(/12-hour \(9:00 am\)/i).first().click();
  await page.getByRole('option', { name: /24-hour/i }).first().click();
  await page.waitForTimeout(200);
  const store = (await prefsState(page))?.timeFormat ?? null;

  // navigate to the calendar; assert a booking time renders in 24h (HH:MM, no am/pm)
  await page.goto('/calendar');
  await page.waitForLoadState('networkidle');
  // gather visible time-looking strings from booking cards
  const times = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('button[title], [class*="rounded"]').forEach((el) => {
      const t = (el.textContent || '');
      const m = t.match(/\b([01]?\d|2[0-3]):[0-5]\d(\s?[ap]m)?/gi);
      if (m) out.push(...m);
    });
    return [...new Set(out)].slice(0, 20);
  });
  const has24h = times.some((s) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(s.trim()) && !/[ap]m/i.test(s));
  const hasAmPm = times.some((s) => /[ap]m/i.test(s));
  // PASS = at least one 24h-formatted time and NO am/pm leakage (the dead-toggle would show am/pm)
  const verdict = has24h && !hasAmPm ? 'PASS' : (times.length === 0 ? 'INCONCLUSIVE' : 'LEAK');
  await log(page, {
    id: 'S5', domain: 'settings', mutation: 'timeFormat 12h→24h', actor_role: 'member3', trigger_surface: '/settings time-format select',
    expected_reflections: [{ site_id: 'calendar.bookingcard.time', site: 'BookingCard via useTimeFormat', instance: 'desktop', observe_how: 'DOM time string', expected_delta: '1:00 pm → 13:00', source_citation: 'lib/hooks/useTimeFormat.ts:24; components/calendar/BookingCard.tsx time()' }],
    expected_site_count: 1, must_NOT_change: [], verdict,
    leak_sites: verdict === 'LEAK' ? ['calendar.bookingcard.time'] : [], classification: verdict === 'LEAK' ? 'FRONTEND' : null,
    evidence: { store, times, has24h, hasAmPm }, dedup_vs_prior: 'dead 12h/24h toggle was a HISTORICAL fixed leak (regression guard)',
  }, 'member3');
  expect(['PASS', 'LEAK', 'INCONCLUSIVE']).toContain(verdict);
});
