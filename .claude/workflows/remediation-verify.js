export const meta = {
  name: 'remediation-verify',
  description: 'Re-drive the deployed app and verify each remediated audit finding; append verdicts to the reverify JSONL',
  whenToUse: 'After audit-finding fixes deploy: formal re-verdict pass per Case Study/audit/REVERIFY-ROUTINE.md. Pass args {targetUrl, date, only?}.',
  phases: [
    { title: 'Fingerprint', detail: 'deployed build hash, start' },
    { title: 'Verify', detail: 'one browser agent per finding group, SEQUENTIAL (single Chrome)' },
    { title: 'Close-out', detail: 'summary from JSONL + ledger checkboxes + end fingerprint' },
  ],
}

// args: { targetUrl: 'https://…vercel.app', date: 'YYYY-MM-DD', only?: ['group-id', …] }
// Date.now() is unavailable in workflow scripts — the caller supplies `date`.
const url = args?.targetUrl
if (!url || !args?.date) throw new Error('args {targetUrl, date} are required')
const OUT = `Case Study/audit/remediation-verify/reverify-${args.date}.jsonl`

const VERDICTS = {
  type: 'object',
  required: ['group', 'buildHash', 'results'],
  properties: {
    group: { type: 'string' },
    buildHash: { type: 'string', description: 'sidebar v… · <hash> observed this session' },
    results: {
      type: 'array',
      items: {
        type: 'object',
        required: ['finding', 'status', 'evidence', 'verdict'],
        properties: {
          finding: { type: 'string' },
          status: { type: 'string', enum: ['Fixed-verified', 'Still-broken', 'Regressed', 'Blocked'] },
          evidence: { type: 'string' },
          verdict: { type: 'string' },
        },
      },
    },
  },
}

// Groups = one coherent browser session each. Serial: chrome-devtools drives ONE Chrome.
const GROUPS = [
  { id: 'contacts-core', findings: '94/96 (teacher combobox populated for admin), 68/77 (kanban stage-drag appends stage_change timeline row), 92 (Escape closes suggestion menu first, dialog second), 102 (clearing partner slot 1 leaves NO purple Main-Branch highlight after save+reopen), 188 (teacherless contact card shows Unassigned, never the church name)' },
  { id: 'contacts-admin', findings: '78/151 (bulk-delete does not resurface on refetch; Admin Contacts shows the row dimmed with Inactive badge + working Restore that writes a restore audit row), seed edge cases (Demas inactive, Rhoda unassigned, Apollos converted, Crispus retention-expired badge)' },
  { id: 'booking', findings: '223 (6-digit year in the wizard date input does not crash), 292 (fully-elapsed Day/Week slots dimmed+disabled; past selection shows amber notice but saves), 219 (new study booking title ends with "— {subject}"; edit preserves it), 282 (Calendar help has no hardcoded room count), 236-seed (Virginia Beach next-Wednesday shows "No availability this day")' },
  { id: 'reports-audit', findings: '509 (This Month card equals the table This Month preset count), 497/264 (cancel with typed reason → audit detail shows a Reason row + real actor), 518 (stat-dialog export filename starts gospel-central-), 516 (Cancellations card counts the new cancel)' },
  { id: 'groups-search', findings: '349 (search "team leader" shows 10 rows + "+N more matches" footer)' },
  { id: 'security-bl', findings: 'BL reassign scope: login branch1/admin, open an own-branch contact in ContactDetail edit — reassign options contain NO cross-branch users; (REST probe) PATCH assignedTeacherId to a cross-branch user id returns 403' },
]

const COMMON = (g) => `You are re-verifying REMEDIATED audit findings on the DEPLOYED build at ${url} (mock-era app, SW-free MSW: mock state resets on every full reload — exploit that between checks; probe REST with in-page fetch('/api/…'), audit-log needs header Authorization: Bearer mock-jwt-token-u-michael). Load browser tools via ToolSearch (chrome-devtools preferred; Claude-in-Chrome fallback; Playwright headed last). Login admin/admin unless the check says otherwise. Read the build fingerprint from the sidebar (v… · hash) FIRST and include it. Test ADVERSARIALLY — try to break the fix, don't rubber-stamp; cross-check every count against REST. Repo context (read-only reference): C:/Users/aicod/Projects/_src/diamond-live — REMEDIATION.md is the ledger; 'Case Study/audit/REVERIFY-ROUTINE.md' has the full expectations table.

After finishing your checks, APPEND (>>, never overwrite) one compact JSON line per finding to '${OUT}' (create the folder if missing) with {finding, status, evidence, verdict} — status ∈ Fixed-verified/Still-broken/Regressed/Blocked. Then return the structured summary.

YOUR GROUP (${g.id}): ${g.findings}`

phase('Fingerprint')
const start = await agent(
  `Open ${url} via browser tools (ToolSearch first), login admin/admin if needed, read the sidebar build fingerprint 'v… · <hash>' and return ONLY that string.`,
  { label: 'fingerprint:start' },
)
log(`start fingerprint: ${start}`)

phase('Verify')
const wanted = Array.isArray(args?.only) && args.only.length ? GROUPS.filter((g) => args.only.includes(g.id)) : GROUPS
const all = []
for (const g of wanted) {
  // Sequential on purpose: one Chrome, one session at a time (storage-state race).
  const r = await agent(COMMON(g), { label: `verify:${g.id}`, phase: 'Verify', schema: VERDICTS })
  if (r) { all.push(r); log(`${g.id}: ${r.results.map((x) => x.status).join(', ')}`) }
}

phase('Close-out')
const end = await agent(
  `Open ${url} via browser tools, read the sidebar build fingerprint and return ONLY that string.`,
  { label: 'fingerprint:end' },
)
const closeout = await agent(
  `In repo C:/Users/aicod/Projects/_src/diamond-live: (1) read '${OUT}' and render 'Case Study/audit/remediation-verify/SUMMARY-${args.date}.md' FROM it (pass rate + one line per non-Fixed-verified verdict; note start fingerprint '${start}' vs end '${end}' — mismatch invalidates the run). (2) In REMEDIATION.md, tick the closure checkboxes that this run proves (browser re-verification) — do NOT touch anything else. Return a 5-line run report.`,
  { label: 'close-out' },
)
return { start, end, groups: all, closeout }
