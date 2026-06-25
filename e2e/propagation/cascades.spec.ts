import { test, expect } from '../fixtures';
import { loginAs } from '../helpers/loginAs';
import { MOCK_DATE, appendJsonl, assertClockActor } from './_lib';

/**
 * BATCH-1 (cross-entity cascades). Each cell = one test() = fresh context.
 * Observe at the SURFACE without reload. Honors the graph facts: PUT /contacts is
 * a blind body-spread (only sent fields move — R6), so a stage change must NOT
 * auto-change contact.type.
 */
test.describe.configure({ mode: 'serial' });

function chipScrape() {
  const chips: Record<string, number> = {};
  document.querySelectorAll('button, a, [role="tab"]').forEach((el) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const m = (el.textContent || '').trim().match(/^(.+?)\s*\((\d+)\)$/);
    if (m) chips[m[1]] = Number(m[2]);
  });
  return chips;
}

// ── C1: baptize (bulk stage → Baptized) → card badge + chip counts (same-page);
//        contact.type must NOT auto-change (R6: PUT /contacts blind body-spread) ──
test('C1 baptize stage-change → chip counts move, contact.type does NOT (R6)', async ({ page }) => {
  await loginAs(page, 'branch1');
  await page.goto('/contacts');
  await page.waitForLoadState('networkidle');

  const ca = await assertClockActor(page, 'branch_leader');
  expect(ca.clock).toBe(MOCK_DATE);

  // capture: chip counts + the visible "type" badges present (Unbaptized Contact etc.)
  const typeBadgesBefore = await page.evaluate(() =>
    [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /unbaptized contact|baptized persecuted/i.test(e.textContent || '')).length);
  const chipsBefore = await page.evaluate(chipScrape);

  // baptize the FIRST contact via bulk stage-change → "Baptized"
  await page.getByRole('button', { name: /^select$/i }).first().click();
  await page.locator('input[type="checkbox"]').first().check();
  await page.getByText(/^change stage\.\.\.$/i).first().click();
  await page.getByRole('option', { name: /^baptized$/i }).first().click();
  await expect(page.getByText(/contacts? updated/i).first()).toBeVisible({ timeout: 8000 });
  await page.waitForLoadState('networkidle');

  const chipsAfter = await page.evaluate(chipScrape);
  const typeBadgesAfter = await page.evaluate(() =>
    [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /unbaptized contact|baptized persecuted/i.test(e.textContent || '')).length);

  const baptizedUp = (chipsAfter['Baptized'] ?? 0) === (chipsBefore['Baptized'] ?? 0) + 1;
  const totalSame = (chipsAfter['All'] ?? 0) === (chipsBefore['All'] ?? 0);
  // must-NOT-change: the count of contacts showing a "type" badge is unchanged (type didn't flip)
  const typeUnchanged = typeBadgesAfter === typeBadgesBefore;

  const expectedOk = baptizedUp && totalSame;
  const mustNotOk = typeUnchanged;
  const verdict = expectedOk ? (mustNotOk ? 'PASS' : 'OVER') : 'LEAK';

  await assertClockActor(page, 'branch_leader');
  appendJsonl('propagation.jsonl', {
    id: 'C1', domain: 'cascade', mutation: 'baptize (stage→Baptized)', actor_role: 'branch1', trigger_surface: '/contacts bulk stage',
    expected_reflections: [
      { site_id: 'contacts.chip.baptized', site: 'stage-chip counts', instance: 'desktop', observe_how: 'DOM chip count', expected_delta: 'Baptized +1', source_citation: 'contacts/page.tsx:261 stageCounts' },
    ],
    expected_site_count: 1,
    must_NOT_change: ['contact.type (PUT /contacts body-spread only — handlers.ts:1266; R6)'],
    verdict,
    leak_sites: verdict === 'LEAK' ? ['contacts.chip.baptized'] : verdict === 'OVER' ? ['contact.type'] : [],
    classification: verdict === 'OVER' ? 'FRONTEND (over-propagation)' : verdict === 'LEAK' ? 'FRONTEND' : null,
    evidence: { chipsBefore, chipsAfter, typeBadgesBefore, typeBadgesAfter, baptizedUp, totalSame, typeUnchanged },
    dedup_vs_prior: 'new — R6 type-must-not-cascade check',
    clock_at_obs: ca.clock, actor_at_obs: ca.role, mock_date: MOCK_DATE,
  });
  expect(['PASS', 'LEAK', 'OVER']).toContain(verdict);
});
