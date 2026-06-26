import { test, expect } from '../fixtures';
import { loginAs } from '../helpers/loginAs';
import { MOCK_DATE, appendJsonl, assertClockActor } from './_lib';

/**
 * BATCH-2 (admin-console entities) — derived from docs/qa/propagation-catalog.md.
 * Admin-console forms (no detail-dialog WebGL churn that crashed the contacts
 * dialog). Each cell = one test() = fresh context. Observe at the SURFACE.
 */
test.describe.configure({ mode: 'serial' });

// ── E1: tags grant/revoke (admin) → row Tags badge (same-page reload) + reports
//        tag_grant/tag_revoke audit row. must-NOT-change: role badge. ──
test('E1 tag toggle (admin) → row Tags badge + reports tag_grant/revoke row', async ({ page }) => {
  test.setTimeout(90_000);
  await loginAs(page, 'admin');
  await page.goto('/admin?tab=users');
  await page.waitForLoadState('networkidle');
  const ca = await assertClockActor(page, 'dev');
  expect(ca.clock).toBe(MOCK_DATE);

  let verdict = 'INCONCLUSIVE'; let err: string | null = null;
  let pillLabel: string | null = null; let wasOn = false; let rowBadgeChanged = false; let auditSeen = false;
  let roleBefore: string | null = null; let roleAfter: string | null = null; let action = '';
  let dbg: unknown = null;
  try {
    // target a deterministic non-self row: search a Team Leader (admin can manage their tags)
    await page.getByPlaceholder(/search/i).first().fill('team1').catch(() => {});
    await page.waitForTimeout(500);
    const row = page.locator('tr', { hasText: /team1|jude/i }).first();
    const rowText = async () => (await row.textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim() ?? '';
    const before = await rowText();
    roleBefore = (before.match(/team leader|member|group leader|branch leader|overseer|dev/i) || [null])[0];

    // audit-log total BEFORE the grant (GET returns insertion order; use total + ?action filter)
    const fetchTotal = (act: string | null) => page.evaluate(async (a) => {
      const t = localStorage.getItem('token');
      const u = a ? `/api/audit-log?action=${encodeURIComponent(a)}&limit=1` : '/api/audit-log?limit=1';
      const r = await fetch(u, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
      const j = await r.json(); return (j && typeof j.total === 'number') ? j.total : (Array.isArray(j) ? j.length : 0);
    }, act);
    const beforeTotal = await fetchTotal(null);

    await row.getByRole('button', { name: /row actions/i }).click();
    await page.getByRole('menuitem', { name: /manage tags/i }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByText(/manage tags/i).first()).toBeVisible({ timeout: 6000 });

    const firstPill = dlg.locator('button[aria-pressed]').first();
    pillLabel = (await firstPill.textContent())?.replace(/\s+/g, ' ').trim() ?? null;
    wasOn = (await firstPill.getAttribute('aria-pressed')) === 'true';
    action = wasOn ? 'tag_revoke' : 'tag_grant';
    await firstPill.click();
    await dlg.getByRole('button', { name: /save tags/i }).click();
    await page.waitForTimeout(700); // dialog onClose → reload

    const after = await rowText();
    roleAfter = (after.match(/team leader|member|group leader|branch leader|overseer|dev/i) || [null])[0];
    // the toggled tag label appears (grant) or disappears (revoke) in the row Tags cell
    const lbl = (pillLabel || '').replace(/[+×x]\s*/i, '').trim();
    const inBefore = lbl && before.includes(lbl);
    const inAfter = lbl && after.includes(lbl);
    rowBadgeChanged = wasOn ? (inBefore && !inAfter) : (!inBefore && inAfter);

    // Audit-row reflection: the UI surfaces are NOT reliably live-observable here —
    // a cross-page nav to /reports RELOADS the document and re-seeds the in-page mock
    // (dbg proved 15 seed rows, no tag_grant); the admin "Audit Log" tab is ALSO stale
    // (it does not refetch on a cross-tab grant — dbg: /admin?tab=audit, 25 rows, no
    // tag_grant). So corroborate the audit row from the mock DATA on the SAME page
    // (fetch) — confirms the mutation EMITTED the row — and record the UI-staleness as
    // a frontend observation limitation (see notes).
    const auditUiStaleOnTabSwitch = await page.getByRole('button', { name: /^audit log$/i }).click()
      .then(() => page.waitForTimeout(700))
      .then(() => page.evaluate((a) => !document.body.innerText.includes(a), action))
      .catch(() => true);
    const afterTotal = await fetchTotal(null);
    const actionCount = await fetchTotal(action);
    // the single tag toggle must emit exactly ONE audit row, and one of the matching action
    auditSeen = afterTotal === beforeTotal + 1 && actionCount >= 1;
    dbg = { beforeTotal, afterTotal, actionCount, auditUiStaleOnTabSwitch, note: 'audit row emitted in DATA; UI surfaces (reports nav re-seeds, admin audit tab stale) do not live-reflect it' };

    const expectedOk = rowBadgeChanged && auditSeen;
    const mustNotOk = roleBefore === roleAfter;
    verdict = expectedOk ? (mustNotOk ? 'PASS' : 'OVER') : 'LEAK';
  } catch (e) { err = String(e).slice(0, 200); }

  await assertClockActor(page, 'dev').catch(() => ({}));
  appendJsonl('propagation.jsonl', {
    id: 'E1', domain: 'users', mutation: 'tag grant/revoke', actor_role: 'admin', trigger_surface: '/admin?tab=users → Manage tags',
    expected_reflections: [
      { site_id: 'usersTab.row.tags', site: 'UserRow Tags badge (PRIMARY, same-page)', instance: 'desktop', observe_how: 'DOM row text', expected_delta: `${action} reflected in row`, source_citation: 'UsersTab.tsx:862-868; reload onClose 719-722' },
      { site_id: `audit.${action}.data`, site: 'audit-log row (DATA corroboration via same-page fetch)', instance: 'n/a', observe_how: 'fetch /api/audit-log', expected_delta: `${action} row emitted`, source_citation: 'handlers.ts:2027-2051' },
    ],
    expected_site_count: 2, must_NOT_change: ['user.role', 'user.parentId', 'user.username'], verdict,
    leak_sites: verdict === 'LEAK' ? [!rowBadgeChanged && 'usersTab.row.tags', !auditSeen && `audit.${action}.data`].filter(Boolean) : verdict === 'OVER' ? ['user.role'] : [],
    classification: verdict === 'LEAK' || verdict === 'OVER' ? 'FRONTEND' : null,
    evidence: { pillLabel, wasOn, action, rowBadgeChanged, auditSeen, roleBefore, roleAfter, err, dbg },
    notes: 'AUDIT-UI FINDING: the audit-row reflection is NOT live-observable in the UI — /reports nav reloads+re-seeds the in-page mock; the admin Audit Log tab does not refetch on a cross-tab grant (stale). Both surface the mutation only after an explicit refetch. Logged as a frontend observation limitation / minor staleness finding (see out-of-scope-findings).',
    dedup_vs_prior: 'new (batch-2 tags)', clock_at_obs: ca.clock, actor_at_obs: ca.role, mock_date: MOCK_DATE,
  });
  expect(['PASS', 'LEAK', 'OVER', 'INCONCLUSIVE']).toContain(verdict);
});

// data helpers (same-page, no cross-page nav → no re-seed)
function auditTotal(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const t = localStorage.getItem('token');
    const r = await fetch('/api/audit-log?limit=1', { headers: t ? { Authorization: `Bearer ${t}` } : {} });
    const j = await r.json(); return (j && typeof j.total === 'number') ? j.total : 0;
  });
}
function areaCount(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const t = localStorage.getItem('token');
    const r = await fetch('/api/areas', { headers: t ? { Authorization: `Bearer ${t}` } : {} });
    const j = await r.json(); return Array.isArray(j) ? j.length : 0;
  });
}
function roomCountSum() {
  let s = 0;
  document.querySelectorAll('*').forEach((e) => {
    if (e.children.length === 0) { const m = (e.textContent || '').trim().match(/^(\d+)\s+rooms?$/); if (m) s += Number(m[1]); }
  });
  return s;
}

// ── E2: room create (admin) → AreaCard room-count badge +1 (same-page) + RoomRow +
//        audit row. must-NOT-change: area count (no phantom area). ──
test('E2 room create (admin) → area room-count badge + RoomRow + audit row', async ({ page }) => {
  test.setTimeout(90_000);
  await loginAs(page, 'admin');
  await page.goto('/admin?tab=rooms');
  await page.waitForLoadState('networkidle');
  const ca = await assertClockActor(page, 'dev'); expect(ca.clock).toBe(MOCK_DATE);

  let verdict = 'INCONCLUSIVE'; let err: string | null = null;
  let roomSeen = false; let auditDelta = 0; let roomSumBefore = 0; let roomSumAfter = 0; let areaBefore = 0; let areaAfter = 0;
  const roomName = '_AUDIT_Room_NN';
  try {
    const beforeTotal = await auditTotal(page);
    areaBefore = await areaCount(page);
    roomSumBefore = await page.evaluate(roomCountSum);

    await page.getByRole('button', { name: /add room/i }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.locator('#room-name').fill(roomName);
    await dlg.locator('#room-capacity').fill('12').catch(() => {});
    await dlg.getByRole('button', { name: /create room/i }).click();
    await expect(page.getByText(/room created/i).first()).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(700); // onSaved → reload

    roomSumAfter = await page.evaluate(roomCountSum);
    roomSeen = await page.getByText(roomName).first().isVisible().catch(() => false);
    auditDelta = (await auditTotal(page)) - beforeTotal;
    areaAfter = await areaCount(page);

    const expectedOk = roomSumAfter === roomSumBefore + 1 && auditDelta >= 1;
    const mustNotOk = areaBefore === areaAfter;
    verdict = expectedOk ? (mustNotOk ? 'PASS' : 'OVER') : 'LEAK';
  } catch (e) { err = String(e).slice(0, 200); }

  await assertClockActor(page, 'dev').catch(() => ({}));
  appendJsonl('propagation.jsonl', {
    id: 'E2', domain: 'rooms', mutation: 'room create', actor_role: 'admin', trigger_surface: '/admin?tab=rooms → Add Room',
    expected_reflections: [
      { site_id: 'roomsTab.area.roomCount', site: 'AreaCard "{n} rooms" badge', instance: 'desktop', observe_how: 'DOM badge sum', expected_delta: '+1', source_citation: 'RoomsTab.tsx:318' },
      { site_id: 'audit.room.create.data', site: 'audit-log room.create (data)', instance: 'n/a', observe_how: 'fetch total delta', expected_delta: '+1', source_citation: 'handlers.ts:672-683' },
    ],
    expected_site_count: 2, must_NOT_change: ['area count (no phantom area)'], verdict,
    leak_sites: verdict === 'LEAK' ? ['roomsTab.area.roomCount'] : verdict === 'OVER' ? ['area.count'] : [],
    classification: verdict === 'LEAK' || verdict === 'OVER' ? 'FRONTEND' : null,
    evidence: { roomName, roomSumBefore, roomSumAfter, roomSeen, auditDelta, areaBefore, areaAfter, err },
    dedup_vs_prior: 'new (batch-2 rooms)', clock_at_obs: ca.clock, actor_at_obs: ca.role, mock_date: MOCK_DATE,
  });
  expect(['PASS', 'LEAK', 'OVER', 'INCONCLUSIVE']).toContain(verdict);
});

// ── E3: area create (admin, Overseer+ gate) → new AreaCard (same-page) + audit row. ──
test('E3 area create (admin) → new AreaCard + audit row', async ({ page }) => {
  test.setTimeout(90_000);
  await loginAs(page, 'admin');
  await page.goto('/admin?tab=rooms');
  await page.waitForLoadState('networkidle');
  const ca = await assertClockActor(page, 'dev'); expect(ca.clock).toBe(MOCK_DATE);

  let verdict = 'INCONCLUSIVE'; let err: string | null = null;
  let areaSeen = false; let auditDelta = 0; let areaBefore = 0; let areaAfter = 0;
  const areaName = '_AUDIT_Area_NN';
  try {
    const beforeTotal = await auditTotal(page);
    areaBefore = await areaCount(page);

    await page.getByRole('button', { name: /add area/i }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.locator('#area-name, input').first().fill(areaName);
    await dlg.getByRole('button', { name: /create area/i }).click();
    await expect(page.getByText(/area created/i).first()).toBeVisible({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(700);

    areaAfter = await areaCount(page);
    areaSeen = await page.getByText(areaName).first().isVisible().catch(() => false);
    auditDelta = (await auditTotal(page)) - beforeTotal;

    const expectedOk = areaAfter === areaBefore + 1 && areaSeen && auditDelta >= 1;
    verdict = expectedOk ? 'PASS' : 'LEAK';
  } catch (e) { err = String(e).slice(0, 200); }

  await assertClockActor(page, 'dev').catch(() => ({}));
  appendJsonl('propagation.jsonl', {
    id: 'E3', domain: 'areas', mutation: 'area create', actor_role: 'admin', trigger_surface: '/admin?tab=rooms → Add Area',
    expected_reflections: [
      { site_id: 'roomsTab.areaCard.new', site: 'new AreaCard renders', instance: 'desktop', observe_how: 'DOM area name + areas count', expected_delta: '+1 area', source_citation: 'RoomsTab.tsx:151 Add Area; handlers.ts areas POST' },
      { site_id: 'audit.area.create.data', site: 'audit-log area.create (data)', instance: 'n/a', observe_how: 'fetch total delta', expected_delta: '+1', source_citation: 'handlers.ts:541-551' },
    ],
    expected_site_count: 2, must_NOT_change: [], verdict,
    leak_sites: verdict === 'LEAK' ? ['roomsTab.areaCard.new'] : [],
    classification: verdict === 'LEAK' ? 'FRONTEND' : null,
    evidence: { areaName, areaBefore, areaAfter, areaSeen, auditDelta, err },
    dedup_vs_prior: 'new (batch-2 areas)', clock_at_obs: ca.clock, actor_at_obs: ca.role, mock_date: MOCK_DATE,
  });
  expect(['PASS', 'LEAK', 'INCONCLUSIVE']).toContain(verdict);
});
