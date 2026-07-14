# Remediation re-verification routine (post-fix re-audit)

Purpose: after audit findings are fixed, re-drive the DEPLOYED app as a user and
confirm each fix behaves as the ledger claims — the same adversarial standard as
the original 526-action audit, scoped to the remediated cells. This routine is
the formal re-verdict pass; the original `findings*.jsonl` files stay immutable.

## Contract (what keeps this safe to re-run)

- **Input:** `REMEDIATION.md` (repo root) — the finding → commit → expected-behavior map.
- **Output:** ONE verdict line per re-checked finding, append-only, to
  `Case Study/audit/remediation-verify/reverify-<YYYY-MM-DD>.jsonl`.
  The `reverify-` filename prefix deliberately does NOT match the
  `findings*.jsonl` glob, so `resume-pointer.py` never sees these lines and the
  original audit trail cannot be corrupted. Never write to any `findings*.jsonl`.
- **Verdict shape:** `{finding, commit, status, evidence, verdict}` with
  `status` = Fixed-verified / Still-broken / Regressed / Blocked. A missing line
  = un-verified; the next run re-checks it.
- **Fingerprint** the deployed build (sidebar `v… · <hash>`) at start AND end;
  start≠end invalidates the run.
- Recon-only on the app: NO code edits, NO seeding beyond what the UI offers.
  Mock resets on every reload — use that to your advantage between checks.

## Execution

1. Read `REMEDIATION.md`; collect findings marked fixed whose `reverify` line is
   absent from every `remediation-verify/reverify-*.jsonl` (or that a caller
   names explicitly).
2. Surface priority: chrome-devtools MCP → Claude-in-Chrome → Playwright
   (headed). One browser session at a time — do NOT parallelize browser agents.
3. Target: the branch preview deployment for the branch that carries the fixes
   (feat/supabase-cutover → `gospel-central-git-feat-supabase-cutover-…vercel.app`)
   or prod `gospel-central.vercel.app` once the fixes reach `main`. Note which.
   Login `admin`/`admin`. SW-free MSW: probe the mock with an in-page
   `fetch('/api/contacts')`, not the network panel.
4. Per finding, test the FIXED behavior adversarially (try to break it, not
   confirm it), cross-check counts/lists against REST (`/api/contacts`,
   `/api/users`, `/api/audit-log` with `Bearer mock-jwt-token-u-michael`), and
   attach DOM/console/screenshot evidence where it clarifies.
5. Close-out: render `remediation-verify/SUMMARY-<date>.md` FROM the JSONL (not
   memory); tick the matching checkboxes in `REMEDIATION.md`; report pass rate +
   one line per non-Fixed-verified verdict.

## The current re-verification checklist (2026-07-13 wave)

| Finding | What to drive | Expect |
|---|---|---|
| 94/96 | Contacts → New Contact as admin | Teacher combobox offers teacher-tagged users, not empty |
| 68/77 | Kanban-drag a contact's stage; open its timeline | stage_change row appended |
| 282 | Calendar → help dialog | No hardcoded room count ("8 rooms" gone) |
| 78/151 | Bulk-delete a contact; refetch (edit another) | Deleted row does NOT resurface; Admin shows it dimmed + Restore works (audit 'restore' row) |
| 497/264 | Cancel a booking with a typed reason; open the audit row detail | Reason row renders with the typed text; actor = the real user |
| 223 | Booking wizard date input: type a 6-digit year | No crash/error screen; wizard survives |
| 292 | DayView on today | Fully-elapsed slots dimmed/disabled; wizard past-selection shows amber notice but allows save |
| 219 | Create a study booking with a subject | Title ends "— {subject}"; editing keeps it |
| 92 | ContactForm partner field: open suggestions, press Escape twice | 1st closes menu only, 2nd closes dialog |
| 102 | Contact with partners 1+2: clear slot 1, save, reopen | Nobody has the purple Main-Branch highlight |
| 188 | Import a CSV contact w/o teacher (or view c-69 Rhoda) | Card Teacher field = 'Unassigned', never the church name |
| 349 | Groups search "team leader" | "+N more matches" footer under 10 rows |
| 509 | Reports: month card vs table 'This Month' preset | Same number |
| 132/518 | Curriculum picker; Reports stat-dialog export | "Deselect all in {section}"; gospel-central-*.csv filename |
| Seed edge cases | Admin Contacts: Demas (inactive), Rhoda (unassigned), Apollos (converted), Crispus (retention-expired badge); Calendar VB next-Wed ('No availability this day') | Each dormant branch renders |
| Security (BL reassign) | Login branch1, open an own-branch contact in ContactDetail edit | Reassign options limited to own branch (no VB users) |

Rows already re-verified in a prior `reverify-*.jsonl` are skipped — the JSONL
is the resume pointer, exactly like the original audit.
