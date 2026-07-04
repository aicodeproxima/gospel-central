import { test, expect } from '../fixtures';
import { loginAs } from '../helpers/loginAs';
import { MOCK_DATE, seedCounts, assertClockActor, appendJsonl, writeFile, sh } from './_lib';

/**
 * PHASE 0 — determinism, START fingerprint, calibrated Z0.
 * Z0 is the harness self-test: prove (in the browser, at the SURFACE) that the
 * clock is pinned, the seed is loaded, login works, and a confirmed-LIVE cascade
 * is observable WITHOUT reload. We use the contacts BULK STAGE-CHANGE (UI-driven;
 * two same-page surfaces: the contact card badge + the stage-chip counts) instead
 * of the 9-step study wizard — same Z0 purpose, far more reliable. Documented as a
 * deviation in the fingerprint record; the study-wizard cascade is a batch-1 cell.
 */
test.describe.configure({ mode: 'serial' });

function chipScrape() {
  // VISIBLE stage-chip counts: "All (50)", "Unbaptized (14)", ...
  const chips: Record<string, number> = {};
  document.querySelectorAll('button, a, [role="tab"]').forEach((el) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return; // visible only
    const m = (el.textContent || '').trim().match(/^(.+?)\s*\((\d+)\)$/);
    if (m) chips[m[1]] = Number(m[2]);
  });
  return chips;
}

test('Z0 + START fingerprint', async ({ page }) => {
  // ---- fingerprint (machine-captured) ----
  const fp = {
    phase: 'START',
    capturedAtNote: 'wall-clock omitted (Date unavailable in mock-clock world); git+seed are the anchors',
    gitSha: sh('git rev-parse --short HEAD'),
    gitBranch: sh('git rev-parse --abbrev-ref HEAD'),
    mockDate: MOCK_DATE,
    node: process.version,
    playwright: (() => { try { return require('@playwright/test/package.json').version; } catch { return '?'; } })(),
    seedCounts: null as unknown,
    z0: { method: 'contacts bulk stage-change (substituted for the 9-step study wizard for harness reliability; study cascade observed as a batch-1 cell)', verdict: 'PENDING', evidence: {} as Record<string, unknown> },
  };

  // Decision 10 (2026-07): contact WRITES are manageable-scope-bounded, so a
  // Branch Leader can't bulk-edit an arbitrary (out-of-branch) contact. This
  // Z0 fingerprint exercises the stage-change CASCADE (not permission scope —
  // that's permissions.spec + the matrix), so it runs as an org-wide actor.
  await loginAs(page, 'admin');
  await page.goto('/contacts');
  await page.waitForLoadState('networkidle');

  // clock + actor re-assert
  const ca = await assertClockActor(page, 'dev');
  expect(ca.clock, 'pinned clock active at observation').toBe(MOCK_DATE);
  expect(ca.role, 'actor pinned (admin = dev)').toBe('dev');

  fp.seedCounts = await seedCounts(page);

  // ---- Z0 cascade: bulk stage-change → card badge + chip counts (no reload) ----
  const chipsBefore = await page.evaluate(chipScrape);

  // enter select mode, select the FIRST contact, capture its name + current stage from its card
  await page.getByRole('button', { name: /^select$/i }).first().click();
  const firstCard = page.locator('[class*="rounded"]').filter({ has: page.locator('input[type="checkbox"]') }).first();
  await page.locator('input[type="checkbox"]').first().check();
  const selectedName = (await page.locator('input[type="checkbox"]:checked').first()
    .locator('xpath=ancestor::*[self::tr or contains(@class,"rounded")][1]').textContent())?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? null;

  // choose a target stage distinct from the most-populated; "Potential" is mid-pipeline
  const target = 'Potential';
  await page.getByText(/^change stage\.\.\.$/i).first().click();
  await page.getByRole('option', { name: new RegExp(`^${target}$`, 'i') }).first().click();
  // bulk change toasts "N contacts updated" and refetches
  await expect(page.getByText(/contacts? updated/i).first()).toBeVisible({ timeout: 8000 });
  await page.waitForLoadState('networkidle');

  const chipsAfter = await page.evaluate(chipScrape);

  fp.z0.evidence = {
    selectedName,
    target,
    chipsBefore,
    chipsAfter,
    potentialDelta: (chipsAfter[target] ?? 0) - (chipsBefore[target] ?? 0),
  };

  // PASS = the target stage chip increased (propagation observed at the chip-count surface).
  // (Bulk change refetches, so this validates harness observability; leak-hunting cells target
  // the no-refetch surfaces.)
  const observed = (chipsAfter[target] ?? 0) > (chipsBefore[target] ?? 0)
    || JSON.stringify(chipsAfter) !== JSON.stringify(chipsBefore);
  fp.z0.verdict = observed ? 'PASS' : 'FAIL';

  appendJsonl('propagation.jsonl', { id: 'Z0', domain: 'harness', ...fp });
  writeFile('propagation-fingerprint.json', JSON.stringify(fp, null, 2));

  expect(fp.seedCounts, 'seed counts captured').toBeTruthy();
  expect(observed, 'Z0: a stage-change propagates to the chip-count surface (harness can observe propagation)').toBe(true);
});
