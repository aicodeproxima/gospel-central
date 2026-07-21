export const meta = {
  name: 'ui-cases-run',
  description: 'Per-page UI Cases routine: drive the deployed app from the user seat, prove metrics, round-trip files, log verdicts, skeptic-check, render reports',
  whenToUse: 'The desktop (daily, page:"all") and mobile (hourly, page:"auto") UI-testing routines. Args {surface, page, date, maxCasesPerPage?, targetUrl?}. Contract: Case Study/UI Cases/RUNBOOK.md + GUARDS.md.',
  phases: [
    { title: 'Select', detail: 'resume.py derives the page(s) + next cases from the ledgers' },
    { title: 'Execute', detail: 'ONE browser agent per page, sequential; Control first, then cases; appends ledger lines + evidence' },
    { title: 'Skeptic', detail: 'parallel adversarial re-grade of sampled verdicts from evidence alone (U13)' },
    { title: 'Close-out', detail: 'end fingerprint; render STATUS/PASSDOWN/FINDINGS/run-report from the ledgers; marker; lock' },
  ],
}

// args: { surface:'desktop'|'mobile', page:'<name>'|'all'|'auto', date:'YYYY-MM-DD', maxCasesPerPage?, targetUrl? }
// Date.now() is unavailable in workflow scripts — the caller supplies `date`.
const A = typeof args === 'string' ? JSON.parse(args) : (args || {})
const surface = A.surface === 'mobile' ? 'mobile' : 'desktop'
const url = A.targetUrl || 'https://gospel-central.vercel.app'
const date = A.date
if (!date) throw new Error('args {date:"YYYY-MM-DD"} is required (Date.now() unavailable in workflows)')
const maxCases = A.maxCasesPerPage || (surface === 'mobile' ? 6 : 7)
const REPO = 'C:/Users/aicod/Projects/_src/diamond-live'
const UIC = 'Case Study/UI Cases'
const ALL_PAGES = ['contacts', 'calendar', 'dashboard', 'groups', 'admin', 'reports', 'settings', 'alerts', 'shell']

// Which pages this firing works. desktop:'all' => all 9 sequential; mobile/auto => resume.py --pick (one page).
let pages
if (A.page === 'all') pages = ALL_PAGES
else if (!A.page || A.page === 'auto') pages = ['__auto__']   // resolved inside Execute via resume.py --pick
else pages = [A.page]

const VERDICT = {
  type: 'object',
  required: ['page', 'buildStart', 'cases'],
  properties: {
    page: { type: 'string' },
    buildStart: { type: 'string', description: '/version.json shortCommit read in-browser at start' },
    backend: { type: 'string', enum: ['mock', 'real-backend', 'unknown'] },
    isolatedContextOk: { type: 'boolean', description: 'true iff localStorage gc-mock-v1 was null pre-login' },
    controlOk: { type: 'boolean', description: 'CTRL-00 pinned-true PASSed AND false-twin FAILed' },
    cases: {
      type: 'array',
      items: {
        type: 'object',
        required: ['case', 'status', 'evidence'],
        properties: {
          case: { type: 'string' },
          status: { type: 'string', enum: ['PASS', 'CONFIRMED_ISSUE', 'SUSPECTED_ISSUE', 'BLOCKED_BY_UI_PREREQUISITE', 'BLOCKED_ENVIRONMENT', 'BLOCKED_SAFETY', 'NOT_APPLICABLE'] },
          evidence: { type: 'string' },
          finding: { type: 'string' },
          note: { type: 'string', description: 'quotes observed UI text verbatim (U4)' },
        },
      },
    },
  },
}

const SKEPTIC = {
  type: 'object',
  required: ['reviewed'],
  properties: {
    reviewed: {
      type: 'array',
      items: {
        type: 'object',
        required: ['case', 'agrees'],
        properties: {
          case: { type: 'string' },
          agrees: { type: 'boolean', description: 'does the evidence support the executor status?' },
          skepticStatus: { type: 'string' },
          why: { type: 'string' },
        },
      },
    },
  },
}

// RUN_TS = the run timestamp `${date}_HHMM_ET`. Date.now() is unavailable in workflow scripts, so
// each browser agent computes it ONCE from the system clock (e.g. bash `date +%H%M`) at start and
// reuses that exact string for every ledger `run` field, evidence dir, and runs/<RUN_TS>.md file.
const isoDir = (p) => `${UIC}/${surface}/${p}`

const EXEC = (p) => `You are the Gospel Central UI Cases routine (surface: ${surface.toUpperCase()}) working the '${p}' page on the DEPLOYED app ${url}. You run on Fable 5 / ultracode / bypass permissions. The CONTRACT is binding: read '${UIC}/GUARDS.md' (U1-U13), '${UIC}/RUNBOOK.md'${surface === 'mobile' ? " and '" + UIC + "/RUNBOOK-MOBILE.md'" : ''} BEFORE acting.

REPO (read the contract + CASES.md there; WRITE ONLY under '${UIC}/**'): ${REPO}

RUN_TS: FIRST, compute this run's timestamp string once as '${date}_HHMM_ET' using the real system clock (bash: date +%H%M) — reuse that EXACT string for every ledger 'run' field, the evidence dir '${date}_HHMM_ET/', and the run report filename. Do not invent or drift it.

BROWSER: load Playwright tools via ToolSearch (${surface === 'mobile' ? 'MOBILE isolated context: emulate 275x596 CSS @ DPR 5.24, isMobile+hasTouch; real taps/swipes/bottom-nav' : 'isolated context; chrome-devtools MCP acceptable for non-download cases'}). NEVER use Claude-in-Chrome / the user's real profile. Use a FRESH isolated context (deterministic seed).

GATES, in order (abort/annotate per RUNBOOK):
 1. Isolated-context: before login, read localStorage['gc-mock-v1']; if NON-NULL -> ABORT this page (write an aborted case line, stop). Record isolatedContextOk.
 2. Backend: login through the real login form as admin/admin. If REJECTED -> real backend: run READ-ONLY cases only, mark every mutation/import case BLOCKED_ENVIRONMENT, set backend:"real-backend". Else backend:"mock".
 3. Fingerprint: read /version.json shortCommit IN-BROWSER (corroborate the sidebar 'v.. .hash'); this is buildStart, stamped on every case line's "build".
 4. Control CTRL-00 FIRST: assert the login/landing shows "Gospel Central" (must PASS) AND a deliberately-false twin "this page shows the text 'Wells Fargo'" (must FAIL). If either misgrades -> controlOk:false and QUARANTINE (still run cases but note them unverified-control).

WORK: run '${p}' cases in CASES.md order, RESUMING from the ledger. Determine the resume point by reading '${isoDir(p)}/ledger.jsonl' (a case with step lines but no 'case' line is in-flight -> continue at its first missing step; else the first case with no 'case' line; when none remain, do a REGRESSION lap on cases whose last build != buildStart). Budget: up to ${maxCases} case-slots (workflow/metric-proof/chain/round-trip = 2, atomic = 1). Priority: in-flight -> proofs/workflows/chains/round-trips -> atomics.

FOR EACH CASE: perform the real UI steps (clicks/drags/hovers/dropdowns/scrolls/${surface === 'mobile' ? 'taps/swipes' : 'keyboard'}). APPEND (>>, never overwrite) one JSON 'step' line per step to '${isoDir(p)}/ledger.jsonl' AS YOU GO, each quoting the OBSERVED UI TEXT VERBATIM (U4) and pointing at an evidence file you saved under '${isoDir(p)}/evidence/<RUN_TS>/'. Close each case with a 'case' line {kind:"case",ts,run:<RUN_TS>,surface:"${surface}",case,status,build:buildStart,severity,finding,evidence,note}. Metric-proofs: read your OWN baseline immediately before mutating (earlier cases already changed state). Export cases: capture the download, PARSE it, quote parsed vs on-screen values. Import cases: run 'python "${UIC}/tools/make-import-fixture.py" --out "${isoDir(p)}/evidence/<RUN_TS>" --ts <RUN_TS>', upload it, assert the accepted/rejected counts against the fixture's oracle, then DELETE the UICASE rows via the UI. All mutations are UI-only and reverted/cleaned via the UI; tag created records with 'UICASE'.

FINDINGS: dedupe vs Hourly Recon (GC-RECON-*) + audit findings + '${UIC}/findings.jsonl' before minting GC-UIC-NNNN; append one line to '${UIC}/findings.jsonl'. Report only (no fix backlog).

STOP at budget (U7) — close out cleanly mid-inventory; leaving a case in-flight is fine (the ledger resumes it). Return the structured verdict for THIS page (page, buildStart, backend, isolatedContextOk, controlOk, cases[]).`

phase('Select')
// One agent resolves the concrete page list + reports each page's resume pointer, so 'auto'/'all'
// become concrete and the executor never guesses (U1/U5).
const plan = await agent(
  `In repo ${REPO}: for surface '${surface}', ${A.page === 'all' ? "the pages are ALL of: " + ALL_PAGES.join(', ') + '.' : (A.page && A.page !== 'auto' ? "the page is '" + A.page + "'." : "run 'python \"" + UIC + "/tools/resume.py\" --surface " + surface + " --pick --json' and take its .page.")} For EACH resolved page, run 'python "${UIC}/tools/resume.py" --surface ${surface} --page <page> --json' and collect {page, next_case, next_step, complete}. Also recompute sha256 of 'Case Study/Available Actions.md' and compare to the pin in '${UIC}/pagemap.json' (report driftOk). Return {pages:[...], resume:{page->pointer}, driftOk}.`,
  { label: 'select', schema: { type: 'object', required: ['pages'], properties: { pages: { type: 'array', items: { type: 'string' } }, driftOk: { type: 'boolean' }, resume: { type: 'object' } } } },
)
log(`select: ${JSON.stringify(plan?.pages)} driftOk=${plan?.driftOk}`)
const runPages = (plan && plan.pages && plan.pages.length) ? plan.pages : (pages[0] === '__auto__' ? ['contacts'] : pages)

phase('Execute')
// Sequential — ONE browser at a time (storage-state race; the one-Chrome constraint). ultracode
// does NOT parallelize this phase.
const results = []
for (const p of runPages) {
  const r = await agent(EXEC(p), { label: `exec:${p}`, phase: 'Execute', schema: VERDICT })
  if (r) {
    results.push(r)
    const tally = (r.cases || []).map((c) => `${c.case}:${c.status}`).join(' ')
    log(`${p} [${r.backend}/ctrl=${r.controlOk}] ${tally}`)
  }
}

phase('Skeptic')
// U13: parallel adversarial re-grade. Every CONFIRMED_ISSUE + up to 2 random PASSes per page,
// judged from EVIDENCE FILES ALONE, blind to the executor's note. This is the ultracode fan-out.
const skeptic = await parallel(
  results.map((r) => () => {
    const suspects = (r.cases || []).filter((c) => c.status === 'CONFIRMED_ISSUE' || c.status === 'PASS').slice(0, 4)
    if (!suspects.length) return Promise.resolve(null)
    const list = suspects.map((c) => `${c.case} (executor said ${c.status}; evidence: ${c.evidence})`).join('; ')
    return agent(
      `ADVERSARIAL re-grade (repo ${REPO}, read-only). For page '${r.page}' surface ${surface}, open ONLY the evidence files and re-judge each case from the evidence ALONE — do NOT trust the executor's status or note, and do NOT open the app. Cases: ${list}. For each, return {case, agrees:<does the evidence actually support the executor status?>, skepticStatus, why}. Default to agrees:false if the evidence is insufficient to confirm.`,
      { label: `skeptic:${r.page}`, phase: 'Skeptic', schema: SKEPTIC },
    )
  }),
)
const disputes = []
for (const s of skeptic.filter(Boolean)) {
  for (const rv of (s.reviewed || [])) if (rv.agrees === false) disputes.push(rv)
}
log(`skeptic: ${disputes.length} disputed`)

phase('Close-out')
const end = await agent(
  `Open ${url} via browser tools, isolated context, login admin/admin if needed, read /version.json shortCommit in-browser and return ONLY that string.`,
  { label: 'fingerprint:end' },
)
const closeout = await parallel(
  runPages.map((p) => () => agent(
    `In repo ${REPO} (WRITE ONLY under '${UIC}/**'): RUN_TS = the newest 'run' value in '${isoDir(p)}/ledger.jsonl' (the run just executed). Render page '${p}' surface ${surface} artifacts FROM its ledger (never memory, U8): (1) 'python "${UIC}/tools/status.py" --surface ${surface} --page ${p}' to rewrite STATUS.md; (2) write '${isoDir(p)}/runs/<RUN_TS>.md' with run facts (start/end fingerprint ${JSON.stringify(results.find((r) => r.page === p)?.buildStart)} vs end '${end}' — MISMATCH invalidates the run; backend; isolated-context+control results; per-case table with evidence; any GC-UIC findings in full); (3) update '${isoDir(p)}/PASSDOWN.md' — prepend a fresh LATEST blockquote (coverage tally, in-flight, next-3, blockers-worth-retrying, environment notes, ${surface === 'mobile' ? 'PAGE-COMPLETE if the inventory is now complete, ' : ''}and any SKEPTIC-DISPUTED cases from: ${JSON.stringify(disputes.filter((d) => true))}) and push the previous LATEST into History. Demote any disputed case to SUSPECTED_ISSUE for next run. Return a 3-line summary.`,
    { label: `closeout:${p}`, phase: 'Close-out' },
  )),
)
// Findings rollup + markers are cheap and singular.
await agent(
  `In repo ${REPO}: run 'python "${UIC}/tools/status.py" --findings' to rebuild FINDINGS.md, then write '${UIC}/${surface === 'mobile' ? 'mobile/' : ''}state/last_run_complete.json' = {surface:"${surface}", date:"${date}", pages:${JSON.stringify(runPages)}, disputed:${disputes.length}, ts:"<clock>"} and remove '${UIC}/${surface === 'mobile' ? 'mobile/' : ''}state/run.lock' if present. Return one line.`,
  { label: 'markers' },
)

return { surface, date, pages: runPages, results, disputes: disputes.length, end }
