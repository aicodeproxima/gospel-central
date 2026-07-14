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
// Tolerate a JSON-encoded string (some callers deliver args stringified).
const A = typeof args === 'string' ? JSON.parse(args) : (args || {})
const url = A.targetUrl
if (!url || !A.date) throw new Error('args {targetUrl, date} are required')
const OUT = `Case Study/audit/remediation-verify/reverify-${A.date}.jsonl`

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
  { id: 'booking', findings: '223 (6-digit year in the wizard date input does not crash), 292 (fully-elapsed Day/Week slots dimmed+disabled; past selection shows amber notice but saves), 219 (new study booking title ends with "— {subject}"; edit preserves it — REVERT: cancel/delete the test booking on this persistent real DB), 132 (booking-wizard SUBJECT step / StepSubjectPicker: pick a study subject, then click "Select all in <section>" and confirm the toggle now reads "Deselect all in <section>" — the section-name suffix is PRESERVED, not a bare "Deselect all"), 282 (Calendar help dialog has no hardcoded room count like "8 rooms"), 236-seed (Virginia Beach next-Wednesday "No availability this day" — EXPECT status:Blocked on this real-backend preview: the VB full-day closure is a mock-only seed row, absent from the real DB; the mock-local counterpart is verified separately)' },
  { id: 'reports-audit', findings: '509 (This Month card equals the table This Month preset count), 497/264 (cancel with typed reason → audit detail shows a Reason row + real actor), 518 (stat-dialog export filename starts gospel-central-), 516 (Cancellations card counts the new cancel)' },
  { id: 'groups-search', findings: '349 (search "team leader" shows 10 rows + "+N more matches" footer)' },
  { id: 'security-bl', findings: 'BL reassign scope: login branch1/gospelseed1 (Joseph, Branch Leader — NOT admin), open an own-branch (Newport News) contact in ContactDetail edit — the reassign / assigned-teacher options contain NO cross-branch (Virginia Beach) users; (same-origin REST probe) PUT/PATCH assignedTeacherId to a cross-branch user id returns 403 (migration 0014 set_contact_teacher own-branch gate). REVERT any change you make.' },
]

const COMMON = (g) => `You are re-verifying REMEDIATED audit findings on the DEPLOYED build at ${url}.

CRITICAL SURFACE FACT — proven by the already-completed contacts-core + contacts-admin groups: despite this preview being built with --build-env NEXT_PUBLIC_MOCK_API=true, it actually runs the REAL Supabase backend, NOT the MSW mock. You MUST honor all of this:
  1. STATE PERSISTS across reloads — there is NO mock reset. REVERT every mutation you make so the DB ends net-unchanged: delete→restore, edit→restore the original value, create→cancel/delete it, cancel→restore. Leaving test data behind corrupts the shared DB.
  2. Login is the username→email shim admin/gospelseed1 (mock creds admin/admin 401 here). Where a check names another user, use that user with password gospelseed1.
  3. Auth is an httpOnly session cookie set at login. Probe REST with a SAME-ORIGIN in-page fetch('/api/…') — the cookie authenticates you automatically. Do NOT add an "Authorization: Bearer mock-jwt-token-u-michael" header; that is a mock-ism and is ignored on the real backend.
  4. Routes the real backend doesn't implement return 501 from the catch-all route (and ids are UUIDs, not u-michael/c-xx) — that 501 is your confirmation you are on the real backend.
  5. Mock-only seed rows DO NOT EXIST on this real DB — specifically the c-68..c-71 edge contacts (Demas/Rhoda/Apollos/Crispus) and the Virginia-Beach next-Wednesday full-day closure blocked slot. If a check depends on one of these, mark it status:Blocked, note surface "real-backend preview", and say which mock-only seed row is missing (a NEXT_PUBLIC_MOCK_API=true local run covers those separately).

Load browser tools via ToolSearch (chrome-devtools preferred; Claude-in-Chrome fallback; Playwright headed last). Login admin/gospelseed1 unless the check says otherwise. Read the build fingerprint from the sidebar (v… · hash) FIRST and include it. Test ADVERSARIALLY — try to break the fix, don't rubber-stamp; cross-check every count against a same-origin REST fetch. Repo context (read-only reference): C:/Users/aicod/Projects/_src/diamond-live — REMEDIATION.md is the ledger; 'Case Study/audit/REVERIFY-ROUTINE.md' has the full expectations table.

After finishing your checks, APPEND (>>, never overwrite) one compact JSON line per finding to '${OUT}' (create the folder if missing) with {finding, status, evidence, verdict} — status ∈ Fixed-verified/Still-broken/Regressed/Blocked. Then return the structured summary.

YOUR GROUP (${g.id}): ${g.findings}`

phase('Fingerprint')
const start = await agent(
  `Open ${url} via browser tools (ToolSearch first), login admin/gospelseed1 if needed (this preview runs the real Supabase backend; admin/admin 401s), read the sidebar build fingerprint 'v… · <hash>' and return ONLY that string.`,
  { label: 'fingerprint:start' },
)
log(`start fingerprint: ${start}`)

phase('Verify')
const wanted = Array.isArray(A.only) && A.only.length ? GROUPS.filter((g) => A.only.includes(g.id)) : GROUPS
const all = []
for (const g of wanted) {
  // Sequential on purpose: one Chrome, one session at a time (storage-state race).
  const r = await agent(COMMON(g), { label: `verify:${g.id}`, phase: 'Verify', schema: VERDICTS })
  if (r) { all.push(r); log(`${g.id}: ${r.results.map((x) => x.status).join(', ')}`) }
}

phase('Close-out')
const end = await agent(
  `Open ${url} via browser tools, login admin/gospelseed1 if needed (real Supabase backend; admin/admin 401s), read the sidebar build fingerprint and return ONLY that string.`,
  { label: 'fingerprint:end' },
)
const closeout = await agent(
  `In repo C:/Users/aicod/Projects/_src/diamond-live: (1) read '${OUT}' and render 'Case Study/audit/remediation-verify/SUMMARY-${A.date}.md' FROM it (pass rate + one line per non-Fixed-verified verdict; note start fingerprint '${start}' vs end '${end}' — mismatch invalidates the run). (2) In REMEDIATION.md, tick the closure checkboxes that this run proves (browser re-verification) — do NOT touch anything else. Return a 5-line run report.`,
  { label: 'close-out' },
)
return { start, end, groups: all, closeout }
