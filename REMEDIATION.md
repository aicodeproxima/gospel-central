# Audit-findings remediation ledger

Source: the 526-action UI audit (`Case Study/audit/**/findings*.jsonl`, 50 non-Done verdicts)
plus a 21-agent verification pass against `feat/supabase-cutover` on 2026-07-13
(workflow `wf_aa97dba6-0ae`). Product decisions resolved with the owner 2026-07-13
(all five recommendations adopted). This file is the finding → commit → evidence map;
the findings JSONLs stay immutable (they are the audit routine's resume pointer).

## Phase 1 — branch reconciliation (commit `1ad1c58`, merge of origin/main)

Closed with zero new code (fix already existed on main):

| Finding | What it was | Fixed by (main-side) |
|---|---|---|
| 94/96 | Dev/Overseer couldn't assign any teacher in ContactForm (`kind:'all'` sentinel dropped) | main's `contacts/page.tsx:1073` fix |
| 68/77 (mock) | Stage changes wrote no `stage_change` timeline row | `dd7124d` (real side: `7e188a0` migration 0010, already on branch) |
| 282 | Calendar help hardcoded "8 rooms" | `9a71384` |
| 393 | Teacher-metrics card static vs live popup | `94fa544` (metrics computed live) |

Also brought in: authz parity `97e0ca9`/`c67adaa`/`ea3e129`, dropdown alignment `d135809`.
Gates: clean build + vitest 543/543 at merge time.

## Refuted by verification (no code change; oracle doc correction owed)

| Finding | Verdict |
|---|---|
| 264 | Cancel→wizard "morph" is a ~100ms Radix exit-animation flash; `closeBookingModal()` closes atomically. Not a duplicate-creation footgun. |
| 292 (as written) | The wizard does NOT reject past times — the real defect was the opposite (past bookings silently creatable end-to-end). Fixed per product decision 1. |
| 118 | Reassign audit row exists (`f9b0951` mock, 0012 real). |
| 149 (audit half) | Delete audit row exists (`cdebb63` mock, 0012 real). a11y half was real → fixed. |

## Wave 1 — fixes on `feat/supabase-cutover` (2026-07-13)

| Finding | Fix | Commit |
|---|---|---|
| 78/151 | `includeInactive=1` on GET /contacts (both backends, areas pattern); ContactsAdminTab requests it — also fixes the real-backend regression from `5bb6734` (admin dimmed-inactive display silently dead) | `48fadc4` |
| 497 | Cancel writes structured audit `reason` on both backends (mock pushAudit + migration **0013** lifting `bookings.cancel_reason` in `audit_row()`); real backend stops discarding user-typed cancel context | `48fadc4` |
| 223 | WhenStep guards unparseable native-date values (belt: onChange isNaN bail; suspenders: render isValid) | `15f2269` |
| 292 / decision 1 | Day/Week grids retire fully-elapsed slots (in-progress slot stays bookable); wizard shows amber past-time notice, retroactive entry allowed | `15f2269` |
| 219 / decision 2 | `buildTitle()` appends primary subject (create AND edit — edits stop stripping seeded subjects) | `15f2269` |
| 92 | PredictiveInput Escape (menu open) stops native propagation — dialog survives; menu-closed Escape still closes dialog | `ca0d713` |
| 149 (a11y) | `aria-label="Delete contact"` on icon-only Trash2 | `ca0d713` |
| 102 / decision 3 | Main-Branch highlight strictly follows data slot 0 (`resolvePartnerSlots`); emptied slot 0 highlights nobody | `ca0d713` |
| 188 | ContactCard Teacher quick-field → 'Unassigned', never groupName | `ca0d713` |
| 509 / decision 5 | "This Month" card + drill-down gain through-now bound (matches table preset) | `19c075f` |
| 518 | Stat-dialog CSV `diamond-` → `gospel-central-` | `19c075f` |
| 349 | TreeSearchBar "+N more matches" overflow hint via `searchEntriesWithTotal` | `19c075f` |
| 132 | "Deselect all in {section}" keeps the suffix | `19c075f` |
| 145/147 | Seed: noon-UTC timeline anchors; session rows name the same person as userId | `19c075f` |
| 516 / decision 5 | Seed delete-booking details no longer read "Cancelled…" (Cancellations counts `action='cancel'` only, by design) | `19c075f` |
| NEW (security) | BL contact-reassign target scoped to own branch on all three surfaces (helper + MSW gate + migration **0014** `set_contact_teacher`); matrix test added | `dc4ee4c` |

Regression pins: `src/mocks/remediation-wave1.itest.ts` + permissions matrix test.
Gates after each commit: full vitest green (546/546 at wave-1 end) + clean build.

## Wave 2 — in progress

- [ ] Contacts restore flow (mock + real RPC + trigger restore-action + admin UI)
- [ ] Seed extension for dormant branches (51/61/62/64/236/303/420; 334/367/5/6 need
      fault injection or manual gesture — out of seed scope)

## Closure — pending

- [ ] Verify migrations 0012/0013/0014 applied to live Supabase (statically unverifiable)
- [ ] Deploy + browser re-verification of each fixed cell (desktop + 275×596)
- [ ] Oracle doc corrections (Available Actions.md cells 104/245/258/264/292/325/426/429/497)
- [ ] Custom re-audit routine prompt + orchestration workflow (new findings-file
      convention so `resume-pointer.py` is not corrupted)

## Deliberately NOT fixed

| Finding | Reason |
|---|---|
| 393 residual ("Active Now" tile = "Total Students" semantics) | Metric semantics need a product definition; card-vs-popup consistency was restored by `94fa544` |
| 176 (TSV import) | Doc itself says "even though the UI describes CSV-style import"; delimiter sniffing deferred |
| 426 (Admin Contacts phone column) | Doc overstated a phone cell that never existed; treated as doc drift, not a missing feature |
| 245 (em-dash vs `--`) | Doc drift; em-dash is the intended glyph |
| 258/325 | Deliberate design (status label by booking type; generic View Calendar link) → doc corrections |
