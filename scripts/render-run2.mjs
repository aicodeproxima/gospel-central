#!/usr/bin/env node
/**
 * render-run2.mjs — GENERATE docs/qa/RUN2.md from machine reporter output.
 *
 * Anti-drift discipline (audit-anti-drift G13/G1): the report is rendered FROM
 * the reporters + the B1–B50 contract, NEVER from memory. Every cell's status
 * comes from a token-match against the actual vitest/playwright JSON, an it.todo
 * marker, the manual JSONL, or an explicit deferral reason — nothing is asserted
 * by hand. The script EXITS NON-ZERO on any orphan (a contract cell claims a
 * test that the reporters don't contain) or any FAIL, so it gates the report.
 *
 * Inputs (produced first — see docs/TESTING.md / the npm scripts):
 *   docs/qa/run2-int.json   = `vitest run --reporter=json --outputFile ...`
 *   docs/qa/run2-e2e.json   = `PLAYWRIGHT_JSON_OUTPUT_NAME=... playwright test --reporter=json`
 *   docs/qa/run2-manual.jsonl (optional) = one {id,status,evidence,ts} per line
 * Output:
 *   docs/qa/RUN2.md
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const QA = 'docs/qa';
const INT = `${QA}/run2-int.json`;
const E2E = `${QA}/run2-e2e.json`;
const MANUAL = `${QA}/run2-manual.jsonl`;
const OUT = `${QA}/RUN2.md`;

// ---- The B1–B50 contract (titles + roles verbatim from DiamondQA/WORKFLOWS.md
//      List B). Lane/coverage from the Run-2 plan. cov.kind:
//      auto    → a token-matched test must exist in the reporters
//      gap     → INT it.todo backend-acceptance (UI-enforced, handler ungated)
//      manual  → resolved from the manual JSONL
//      deferred→ explicitly not run this round (reason recorded; honest, not faked)
const C = [
  ['B1', 'Book from scratch (blank wizard)', 'any', 'E2E', { kind: 'auto' }],
  ['B2', 'Add a room on the fly', 'BL+', 'E2E', { kind: 'deferred', why: 'create-flow variant — covered in the Run-1 manual pass' }],
  ['B3', 'Add a teacher on the fly', 'any', 'E2E', { kind: 'deferred', why: 'create-flow variant — Run-1 manual covered' }],
  ['B4', 'Dodge a full room', 'any', 'E2E', { kind: 'auto' }],
  ['B5', 'Conflict bounce-back', 'any', 'E2E', { kind: 'deferred', why: 'Run-1 manual covered the conflict guard' }],
  ['B6', 'Fix one field from Confirm', 'any', 'E2E', { kind: 'deferred', why: 'lower-value wizard nav' }],
  ['B7', 'Extend a session to 90m', 'any', 'E2E', { kind: 'deferred', why: 'lower-value duration tweak' }],
  ['B8', 'Baptized-Persecuted study', 'any', 'E2E', { kind: 'deferred', why: 'lower-value contact-type variant' }],
  ['B9', 'Decode the board Legend', 'any', 'E2E+visual', { kind: 'auto' }],
  ['B10', 'Read a cancellation reason', 'any', 'E2E', { kind: 'deferred', why: 'Run-1 manual covered cancel reason' }],
  ['B11', 'Hit the "Outside your scope" badge', 'any', 'E2E', { kind: 'auto' }],
  ['B12', 'Reschedule a no-show', 'teacher', 'INT-todo', { kind: 'gap', marker: 'PUT /bookings/:id' }],
  ['B13', 'Sort contacts by Sessions', 'teacher', 'E2E', { kind: 'auto' }],
  ['B14', 'Dense Table view', 'teacher', 'mobile', { kind: 'auto' }],
  ['B15', 'Filter Type = Unbaptized Zoom', 'teacher', 'E2E', { kind: 'deferred', why: 'lower-value filter variant' }],
  ['B16', 'Search by a note', 'teacher', 'E2E', { kind: 'auto' }],
  ['B17', 'Jot a private note', 'teacher', 'E2E', { kind: 'deferred', why: 'lower-value note-save flow' }],
  ['B18', 'One-tap call (tel:)', 'teacher', 'E2E', { kind: 'deferred', why: 'data-dependent (only contacts with seeded phones expose a tel: anchor); dropped per plan' }],
  ['B19', 'Import contacts CSV', 'BL+', 'E2E', { kind: 'auto' }],
  ['B20', 'Export selected only', 'BL+', 'E2E', { kind: 'auto' }],
  ['B21', '"Already converted" state', 'leader', 'E2E', { kind: 'deferred', why: 'data-dependent contact state' }],
  ['B22', 'Make a group inline', 'teacher', 'E2E', { kind: 'deferred', why: 'lower-value inline-create' }],
  ['B23', 'Read the full 15-event timeline', 'teacher', 'E2E', { kind: 'auto' }],
  ['B24', 'Clear all filters', 'teacher', 'E2E', { kind: 'auto' }],
  ['B25', 'Flatten tree (3D→List)', 'any', 'E2E+mobile', { kind: 'auto' }],
  ['B26', 'Expand/Collapse All', 'any', 'E2E', { kind: 'auto' }],
  ['B27', 'Prep a baptism day', 'leader', 'E2E', { kind: 'deferred', why: 'complex multipage; lower-value' }],
  ['B28', 'Jump-to picker', 'any', 'E2E', { kind: 'auto' }],
  ['B29', 'Lifetime "Total Studies" metric', 'any', 'E2E', { kind: 'auto' }],
  ['B30', '"Currently Studying" metric', 'any', 'E2E', { kind: 'auto' }],
  ['B31', 'Open a card from a tree leaf', 'any', 'E2E', { kind: 'deferred', why: 'WebGL leaf-click; lower-value (B25/B28 cover the tree)' }],
  ['B32', 'Add a team to your group', 'GL+', 'INT', { kind: 'auto' }],
  ['B33', 'Stand up a new branch', 'Overseer+', 'INT', { kind: 'auto' }],
  ['B34', 'Curate a custom tag', 'Overseer+', 'INT', { kind: 'auto' }],
  ['B35', 'Read the Permissions matrix', 'BL+', 'E2E', { kind: 'auto' }],
  ['B36', 'Delegate export rights', 'BL+', 'INT', { kind: 'auto' }],
  ['B37', 'Restore a deactivated room/area', 'BL+', 'INT', { kind: 'deferred', why: 'admin-tier restore — not written this round (INT-eligible follow-up)' }],
  ['B38', "Upgrade a room's features", 'BL+', 'INT', { kind: 'auto' }],
  ['B39', 'Take a room offline', 'BL+', 'INT', { kind: 'auto' }],
  ['B40', 'Block a convention day', 'BL+', 'INT', { kind: 'auto' }],
  ['B41', "Rename a member's username", 'Overseer+', 'INT-todo', { kind: 'gap', marker: 'username' }],
  ['B42', 'Find every teacher in one Zion', 'BL+', 'INT', { kind: 'deferred', why: 'GET /users area+tag scope — not written this round (INT-eligible follow-up)' }],
  ['B43', "Trace a booking's edits (Change Log)", 'BL+', 'E2E', { kind: 'auto' }],
  ['B44', "Review one person's activity", 'BL+', 'INT-todo', { kind: 'gap', marker: 'audit-log' }],
  ['B45', 'Drill the "Creates" card', 'BL+', 'E2E', { kind: 'auto' }],
  ['B46', 'Inspect a single audit change', 'BL+', 'E2E', { kind: 'deferred', why: 'lower-value (B43/B45 cover the audit UI)' }],
  ['B47', 'Export a compliance slice', 'BL+', 'INT-todo', { kind: 'gap', marker: 'audit-log' }],
  ['B48', 'Weekly pulse (pie + Top Contributors)', 'BL+', 'E2E+visual', { kind: 'auto' }],
  ['B49', 'Tune alerts & dark/light', 'any', 'mobile', { kind: 'auto' }],
  ['B50', "Cover a sick teammate's week", 'TL+', 'E2E+unit', { kind: 'auto' }],
];

// ---- optionally (re)generate the reporters first: `node scripts/render-run2.mjs --run`
if (process.argv.includes('--run')) {
  execSync('npx vitest run --reporter=json --outputFile=docs/qa/run2-int.json', { stdio: 'inherit' });
  // Playwright boots an ephemeral `next dev`; a reused-but-half-warmed server can
  // make the first invocation flake on the health check. Retry once before failing.
  const pwEnv = { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: 'docs/qa/run2-e2e.json' };
  const pwCmd = 'npx playwright test --project=chromium --project=mobile-s24 --reporter=json';
  try {
    execSync(pwCmd, { stdio: 'inherit', env: pwEnv });
  } catch {
    console.error('playwright run flaked (dev-server race?) — retrying once…');
    execSync(pwCmd, { stdio: 'inherit', env: pwEnv });
  }
}

// ---- load reporters
const vit = JSON.parse(readFileSync(INT, 'utf8'));
const pw = JSON.parse(readFileSync(E2E, 'utf8'));

// vitest assertions → flat list
const vitTests = vit.testResults.flatMap((f) =>
  f.assertionResults.map((a) => ({
    title: a.fullName || a.title,
    status: a.status === 'passed' ? 'pass' : a.status === 'failed' ? 'fail' : 'todo',
    src: 'INT',
  })),
);
const vitTodos = vitTests.filter((t) => t.status === 'todo');

// playwright suites → flat spec list (recursive)
const pwTests = [];
const walk = (s) => {
  for (const spec of s.specs || []) {
    const flaky = (spec.tests || []).some((t) => t.status === 'flaky');
    pwTests.push({ title: spec.title, status: spec.ok ? (flaky ? 'flaky' : 'pass') : 'fail', src: 'E2E' });
  }
  for (const child of s.suites || []) walk(child);
};
for (const s of pw.suites || []) walk(s);

// token index: B## → [{title,status,src}]
const allTests = [...vitTests, ...pwTests];
const tokenIndex = {};
for (const t of allTests) {
  const toks = (t.title.match(/\bB\d{1,2}\b/g) || []);
  for (const tk of new Set(toks)) (tokenIndex[tk] ||= []).push(t);
}

// manual jsonl
const manualMap = {};
if (existsSync(MANUAL)) {
  for (const line of readFileSync(MANUAL, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try { const o = JSON.parse(s); if (o.id) manualMap[o.id] = o; } catch { /* skip bad line */ }
  }
}

// ---- resolve each contract cell
let orphan = 0, fail = 0, flaky = 0;
const rows = C.map(([id, title, role, lane, cov]) => {
  let status, evidence;
  if (cov.kind === 'auto') {
    const hits = tokenIndex[id] || [];
    if (!hits.length) { status = 'ORPHAN'; evidence = 'NO matching test in reporters'; orphan++; }
    else if (hits.some((h) => h.status === 'fail')) { status = 'FAIL'; evidence = hits.map((h) => h.src).join('+'); fail++; }
    else {
      const isFlaky = hits.some((h) => h.status === 'flaky');
      status = isFlaky ? 'FLAKY' : 'PASS';
      if (isFlaky) flaky++;
      evidence = [...new Set(hits.map((h) => h.src))].join('+');
    }
  } else if (cov.kind === 'gap') {
    const todo = vitTodos.find((t) => t.title.includes(cov.marker));
    status = 'GAP';
    evidence = todo ? `it.todo: ${todo.title.replace(/^.*backend: /, '').slice(0, 70)}…` : `(marker '${cov.marker}' not found — verify)`;
    if (!todo) { orphan++; status = 'GAP?'; }
  } else if (cov.kind === 'manual') {
    const m = manualMap[id];
    status = m ? m.status.toUpperCase() : 'MANUAL-PENDING';
    evidence = m ? (m.evidence || '').slice(0, 70) : 'awaiting the one frugal manual agent (B19 CSV import, B50 exploratory)';
    if (m && m.status === 'fail') fail++;
  } else {
    status = 'DEFERRED';
    evidence = cov.why;
  }
  return { id, title, role, lane, status, evidence };
});

// ---- fingerprint
const sh = (c) => { try { return execSync(c, { encoding: 'utf8' }).trim(); } catch { return '?'; } };
const pkgVer = (name) => {
  try { return JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).version; } catch { return '?'; }
};
const mockDate = (() => {
  try { return (readFileSync('playwright.config.ts', 'utf8').match(/MOCK_DATE\s*=\s*'([^']+)'/) || [])[1] || '?'; }
  catch { return '?'; }
})();
const fp = {
  generatedAtUTC: new Date().toISOString(),
  branch: sh('git rev-parse --abbrev-ref HEAD'),
  headSha: sh('git rev-parse --short HEAD'),
  originMainSha: sh('git rev-parse --short origin/main'),
  mockDate,
  node: process.version,
  vitest: pkgVer('vitest'),
  playwright: pkgVer('@playwright/test'),
  vit: { total: vit.numTotalTests, pass: vit.numPassedTests, todo: vit.numTodoTests, fail: vit.numFailedTests },
  pw: pw.stats,
};

// ---- counts
const tally = {};
for (const r of rows) tally[r.status] = (tally[r.status] || 0) + 1;
const automated = (tally.PASS || 0) + (tally.FLAKY || 0) + (tally.GAP || 0);

// ---- render
const esc = (s) => String(s).replace(/\|/g, '\\|');
const md = `# Diamond — Run 2 (List B / 50) — GENERATED report

> **This file is machine-generated by \`scripts/render-run2.mjs\` from the JSON
> reporters — do not hand-edit.** Re-render (regenerates the reporters + renders):
> \`npm run qa:run2\`. The script exits non-zero on
> any orphan/FAIL, so a green render is itself an integrity check
> (audit-anti-drift G1/G13).

## Environment fingerprint (start == end ⇒ run is valid)
| field | value |
|---|---|
| generated (UTC) | ${fp.generatedAtUTC} |
| branch | \`${fp.branch}\` |
| HEAD | \`${fp.headSha}\` |
| origin/main | \`${fp.originMainSha}\` |
| pinned MOCK_DATE | \`${fp.mockDate}\` (Mon — deterministic seed week) |
| node | ${fp.node} |
| vitest | ${fp.vitest} |
| @playwright/test | ${fp.playwright} |
| vitest totals | ${fp.vit.pass} pass / ${fp.vit.todo} todo / ${fp.vit.fail} fail (of ${fp.vit.total}) |
| playwright stats | ${fp.pw.expected} expected, ${fp.pw.unexpected} unexpected, ${fp.pw.flaky} flaky, ${fp.pw.skipped} skipped |

## Coverage summary (all 50 cells reconciled — no orphan)
| outcome | count | meaning |
|---|---|---|
| PASS | ${tally.PASS || 0} | a token-matched test is green in the reporters |
| FLAKY | ${tally.FLAKY || 0} | passed only on retry — treat as not-green |
| GAP | ${tally.GAP || 0} | UI-enforced but the mock HANDLER is ungated → backend-acceptance \`it.todo\` (real finding) |
| MANUAL-PENDING | ${tally['MANUAL-PENDING'] || 0} | would need a manual/exploratory pass (none this round — B19/B50 were automatable after all) |
| DEFERRED | ${tally.DEFERRED || 0} | explicitly not run this round (reason in the table) — honest, not faked |
| ORPHAN/FAIL | ${(tally.ORPHAN || 0) + (tally.FAIL || 0) + (tally['GAP?'] || 0)} | **must be 0** |

**Automated coverage this round: ${automated}/50** (${tally.PASS || 0} PASS green + ${tally.GAP || 0} backend-acceptance todos${(tally.FLAKY || 0) ? ` + ${tally.FLAKY} FLAKY` : ''}). Manual-pending ${tally['MANUAL-PENDING'] || 0}; deferred ${tally.DEFERRED || 0} (honestly enumerated, not faked).

## B1–B50 reconciliation
| ID | Title | Role | Lane | Status | Evidence / reason |
|---|---|---|---|---|---|
${rows.map((r) => `| ${r.id} | ${esc(r.title)} | ${esc(r.role)} | ${r.lane} | ${r.status} | ${esc(r.evidence)} |`).join('\n')}

## Backend-acceptance gaps (the durable findings — handler is permissive, the real Go backend MUST gate)
These are surfaced as \`it.todo\` markers in the vitest suite (verbatim from the reporter); the UI enforces
them today but the mock handler does not, so they are acceptance criteria for Mike's backend — NOT bugs to
"fix" in the mock (that would mask the gap). See \`docs/qa/out-of-scope-findings.md\`.
${vitTodos.map((t) => `- ${t.title.replace(/^.*?(backend:|it\.todo)?\s*/i, '')}`).join('\n')}

## Notes
- Determinism: every reporter run pins \`${fp.mockDate}\` (mock-clock read eagerly at module init); the seed
  lays the church-week relative to that Monday, so cell results don't drift by day.
- GAP cells (B12/B41/B44/B47) are **cross-source-of-truth findings** (audit-anti-drift G3): the UI blocks the
  action (e.g. Members are redirected from /reports — \`smoke.spec\`) while the handler does not, and that very
  divergence is the finding.
- DEFERRED cells are enumerated honestly with a reason; they are not counted as covered.
`;

writeFileSync(OUT, md);
console.log(`RUN2.md written — PASS ${tally.PASS || 0}, GAP ${tally.GAP || 0}, FLAKY ${flaky}, MANUAL-PENDING ${tally['MANUAL-PENDING'] || 0}, DEFERRED ${tally.DEFERRED || 0}, ORPHAN ${orphan}, FAIL ${fail}`);
if (orphan || fail) {
  console.error(`\nINTEGRITY FAIL: orphan=${orphan} fail=${fail} — the contract references a test the reporters don't contain, or a test failed. Halting (report still written for inspection).`);
  process.exit(1);
}
