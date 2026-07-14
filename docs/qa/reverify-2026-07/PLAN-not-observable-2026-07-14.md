# PLAN — close the cutover re-verify loop (2026-07-14, expanded)

> Filename kept as `PLAN-not-observable-2026-07-14.md` on purpose — SUMMARY-2026-07-13.md,
> SESSION_PASSDOWN.md, `diamond-remediation-state`, and REMEDIATION.md all reference this path. Do
> NOT rename it. The scope grew (per the 2026-07-14 owner decisions a–e); the file is the same.

## What this plan now covers (owner-approved 2026-07-14)
The read-only re-confirmation pass left 4 findings un-observable (they need a write) and surfaced 5
follow-ups. The owner decided all of them IN, so this is now a multi-phase closure plan:

| Ref | Owner decision | Becomes |
|---|---|---|
| (base) | Live-verify the 4 not-observable findings | **Phase C** (write→observe→revert) |
| a | "add your best recommendation" → **map the 3 residual bare tokens** | **Phase B** (TDD) |
| b | "mock must work exactly like prod, add the build" | **Phase A** (stand up real-backend build) + **mock-vs-real parity** cross-check woven into B & C |
| c | "clean them as part of the plan" → residual test data on the shared DB | **Phase D** |
| d | "back it up somewhere tracked" → the audit trail | **Phase E** |
| e | "handle it per your best recommendation, as part of the plan" → the live 403 re-probe | folded into **Phase C / Step 4b** (executed, not deferred) |

> ⚠️ **This plan WRITES on the shared prod-parity Supabase DB and DELETES test rows, deploys a
> preview, and lands a code change.** It is a build/execute plan, not a read-only pass. Run only with
> an explicit go-ahead. Every finding-write is reverted; the only intentional deletes are Phase D's
> sentinel-scoped cleanup, done SELECT-first.

---

## §0 — Anti-corruption protocol (hallucination / drift / memory-loss / context-rot)
**Why this section exists:** this branch moved **three times during the session that wrote this plan**
(`ee4da06`→`86e77fb`→`758acb0`, concurrent sessions pushing), the target preview's mock-vs-real mode is
*contested in our own records* (memory says "all previews real"; the 758acb0 fix session says the
git-auto preview is mock), and the plan spans deploy + code + browser + DB + docs across a long session.
That is exactly the environment where an agent hallucinates a SHA, trusts a stale fact, or drifts
mid-run. These 15 guards are **mandatory**, not optional. They adapt the `audit-anti-drift` skill's 13
guards plus 2 context-rot guards.

**G1 — Re-derive ground truth live, never from this doc.** Every SHA / URL / count in this file is a
*snapshot* and may already be stale. At the start of EVERY phase run: `git fetch` + `git rev-parse
--short origin/feat/supabase-cutover` and use THAT, not any hash written here. If a value here disagrees
with the live repo/preview, the live value wins and you fix this doc.

**G2 — Environment fingerprint at START and END of each phase.** Capture into the exec log: branch tip
SHA, preview build hash (sidebar `v… · <hash>` AND `/version.json`), whether the preview is mock or real
(probe, see G8), applied-migration markers, and DB row counts (users/contacts/bookings). **START ≠ END
fingerprint ⇒ that phase's results are INVALID — re-run it.** A mid-plan branch advance (G1) forces a
re-fingerprint of everything downstream.

**G3 — Append-only exec log, one line per cell.** All live verdicts append to a NEW
`Case Study/audit/remediation-verify/reverify-2026-07-14.jsonl` (`printf '%s\n' "$json" >> file`, never
overwrite). **Do NOT touch** the committed `reverify-2026-07-13.jsonl` or its 19/21 count — different
run, immutable. Each line: `{phase, finding, surface, status, evidence, verdict, ts, buildHash}`.

**G4 — Evidence required per cell; no PASS without it.** Every PASS carries (a) a quoted same-origin REST
payload (URL logged) AND (b) a DOM snippet or screenshot. Write-checks record `before` and `after` reads
whose diff contains exactly the expected change and nothing else.

**G5 — Cross-source-of-truth, ×2 axes.** (i) Every status/count is confirmed from BOTH the browser
(DOM/network) AND a direct REST/DB read — disagreement IS the finding. (ii) **Mock-vs-real parity (owner
decision b):** every finding + every token mapping is exercised on BOTH the LOCAL mock
(`NEXT_PUBLIC_MOCK_API=true npm run dev`) AND the real-backend preview; the two MUST return identical
`{status, code, shape}`. Divergence ⇒ a parity defect to fix in the mock or the router, logged.

**G6 — Fixture identity via embedded timestamps.** Name every test entity
`REVERIFY-<PHASE>-<ISO-ts>-<n>` (e.g. `REVERIFY-C1-2026-07-14T18:03Z-1`). Every read-back re-asserts the
timestamp so you know it's THIS run's data; Phase D deletes by exactly this pattern (no blind deletes).

**G7 — Cell isolation + revert.** No cell depends on a prior cell's side effect. Every finding-write is
reverted immediately (delete→restore, edit→restore, cancel→restore); net-zero proven by a before/after
REST read. Bookings can't be hard-deleted on real (`DELETE /bookings` = 501) → they end cancelled;
log the residual id for Phase D.

**G8 — Pre-flight harness self-test (cell Z0), before any real cell.** On the chosen surface: (1) log in,
(2) probe `/api/me` — a **UUID** id + working `admin/gospelseed1` = REAL backend; `u-michael` + working
`admin/admin` = MOCK; (3) hit one unimplemented route and confirm **501** (real) vs MSW 200 (mock);
(4) confirm REST contact count == DOM tile count == the number this plan expects. If any disagree, **HALT
and re-derive** — do not start real cells on a mis-identified surface. (This is the guard that resolves
our mock-vs-real contradiction empirically instead of by assumption.)

**G9 — Re-verify a failure once; a pass-on-rerun is flaky.** Log flaky cells as `flaky`, don't silently
upgrade to PASS.

**G10 — Adversarial spot-check before the report.** Re-run 3 random PASS cells from the log; any
divergence ⇒ HALT, don't render the summary.

**G11 — Report rendered FROM the log, never from memory.** SUMMARY-2026-07-14.md is generated by reading
`reverify-2026-07-14.jsonl`; spot-check that its counts match the file. (Cornerstone guard.)

**G12 — Resume-from-log on interruption.** If this plan is interrupted (usage limit, crash), do NOT
restart from Phase A. Read the phase checkboxes below + the exec log + `git log`, and continue from the
first incomplete cell. (This plan's own parent run was interrupted twice by usage limits — assume it
will happen again.)

**G13 — Scope discipline.** The phases below are the contract. New defects found mid-run go to
`Case Study/audit/remediation-verify/out-of-scope-2026-07-14.md`, NOT into this run. No opportunistic
"while I'm here" edits.

**G14 (context-rot) — Chapter every phase; carry a 5-line state header.** Mark a session chapter at each
phase boundary. Keep a running "STATE" block (current phase, branch tip, preview URL+mode, last log line)
and re-post it after any long tool sequence, so a compaction can't lose the thread.

**G15 (context-rot) — Tooling reality, re-checked live (don't trust these lines either).** As of writing:
the **Vercel MCP + Supabase MCP need OAuth / were disconnected** this session → use the **`vercel` CLI**
(authed as `aicodeproxima`) and **`scripts/sbq.mjs` + `SB_PAT`** for DB/DDL, NOT the MCPs. **Re-confirm at
run time** — MCP availability flips between turns. Migrations are applied-live: **NEVER re-apply or edit a
migration**; only add app-layer code.

---

## §1 — Preconditions & global fingerprint (run FIRST)
1. **G1/G2 fingerprint (start):** `git fetch`; record `origin/feat/supabase-cutover` tip; `npx vitest run`
   green baseline (expect 566+); confirm working tree clean except untracked-by-convention dirs.
2. Confirm the `SB_PAT` is present/valid for `scripts/sbq.mjs` (Phase D/A need it). If rotated/absent, HALT
   and ask — do not guess.
3. Confirm `vercel` CLI auth (`vercel whoami` = `aicodeproxima`, scope `aicodeproximas-projects`).
4. Log the start fingerprint as the first line of `reverify-2026-07-14.jsonl` (`{phase:"Z0-start", …}`).

---

## Phase B — Map the 3 residual bare tokens (owner decision a) · TDD · pure code
Runs FIRST of the work phases so the Phase-A build contains it (one build = one fingerprint for Phase C).

**Recommendation (the "best recommendation" the owner approved):** add the 3 missing tokens to
`TOKEN_TO_CODE` in `src/lib/api/supabase.ts` with these mappings, chosen to match how the UI/`ApiErrorCode`
union consumes them (confirm the exact `ApiErrorCode` names against `client.ts` before coding — G1):
- `WEAK_PASSWORD` → code `WEAK_PASSWORD`, **HTTP 400** (client input problem; UI can branch on the code).
- `MISSING_FIELDS` → code `VALIDATION_ERROR` (or a new `MISSING_FIELDS`), **HTTP 400**.
- `CYCLE` → code `CONFLICT`, **HTTP 409** (an org-tree cycle is a structural conflict). *If the client
  union has no CONFLICT-for-cycle path, fall back to 400/VALIDATION and note it.*

**Steps (RED→GREEN, mirroring how `758acb0` was proven):**
1. **RED:** extend `src/lib/api/supabase-errors.test.ts` — pin bare `WEAK_PASSWORD`/`MISSING_FIELDS`/`CYCLE`
   → the chosen `{code,status}`; keep the existing 12 assertions. Run, watch the 3 new ones fail with the
   current 400/UNKNOWN.
2. **GREEN:** add the 3 entries to `TOKEN_TO_CODE`. Re-run — 15+ green.
3. **Mock parity (owner decision b):** confirm `src/mocks/handlers.ts` returns the SAME `{status,code}` for
   the same conditions (weak password on reset/convert, missing required field, org-tree cycle). If a mock
   path currently diverges, fix the mock to match real (parity is the contract — see
   `diamond-mock-is-prod-parity`). Add/extend an itest asserting mock == the mapped shape.
4. **Gate:** full `npx vitest run` green + `next build` clean. Commit
   (`fix(api): map WEAK_PASSWORD/MISSING_FIELDS/CYCLE bare tokens; mock parity`). Do NOT touch migrations.
- **Exit:** 3 tokens mapped, unit-pinned, mock==real in tests, suite+build green, committed & pushed.

---

## Phase A — Stand up & verify a real-backend preview of the CURRENT tip (owner decision b)
Must run AFTER Phase B so the build contains every fix (`758acb0` + the 3-token map).

**Steps:**
1. **G1 fingerprint:** re-derive the branch tip (it will be Phase B's new commit). Push if not pushed.
2. **Find/trigger the build:** `vercel ls gospel-central --scope aicodeproximas-projects` → find the
   Preview for the current tip (git-auto build), or `vercel deploy` a fresh one. Record its URL + the
   deployed commit (`vercel inspect <url>`), and the sidebar/`/version.json` hash.
3. **Resolve the mock-vs-real contradiction EMPIRICALLY (G8, do NOT assume):** on that preview run the
   Z0 self-test — `/api/me` id shape, login creds that work, a 501 probe. Record `surface: real|mock`.
   - If **real** → this is Phase C's target. 
   - If **mock** → stand up a real-backend preview: `vercel deploy` with the branch-scoped real Supabase
     env (`NEXT_PUBLIC_MOCK_API=false` + `SUPABASE_URL`/`ANON_KEY`), per the passdown's real-preview
     recipe — NOT `--build-env NEXT_PUBLIC_MOCK_API=true` (that flag was observed NOT to flip
     `ghonounep`, which is why our records disagree; empirical probe settles it, not the flag).
4. **Correct the record:** whatever G8 proves, update the contradicting line in `diamond-remediation-state`
   / this doc so the next session isn't misled (the "ALL previews run real" claim gets a precise scope).
- **Exit:** a preview URL whose G8 self-test PROVES real-backend AND whose commit == current tip, logged
  with its fingerprint. Phase C's start-fingerprint must equal this.

---

## Phase C — Live re-checks + 403/40x re-probe (base findings + owner decision e)
Target: the Phase-A real-backend preview. **G5 parity:** run each cell on the LOCAL mock too and assert
identical results. Sequential, one Chrome (chrome-devtools MCP; load via ToolSearch). Z0 self-test first.

**C1 — 188** (teacherless card → "Unassigned", never the church name): create active contact, no teacher
(`REVERIFY-C1-<ts>`, group "Newport News Zion"); Grid card Teacher field = "Unassigned"; screenshot;
**REVERT** soft-delete; REST count back to baseline.

**C2 — 68/77** (kanban stage-drag appends `stage_change`): baseline stage+timeline via REST; drag to a new
stage; assert REST stage changed + new `stage_change` row (real actor) + timeline renders it; **REVERT**
drag back (second append-only row by design); final stage == baseline.

**C3 — 219** (study title ends "— {subject}", edit preserves): create study booking w/ subject
(`REVERIFY-C3-<ts>`); REST title ends `— {subject}`; edit leader, save; title still ends `— {subject}`;
keep the booking for C4.

**C4 — 497/264** (cancel reason → audit Reason row + real actor): cancel the C3 booking via wizard
Confirm→Cancel, reason `REVERIFY-C4-<ts>`; audit-log detail shows a Reason row (verbatim) + actor =
real signed-in user; REST audit row carries `reason`; screenshot; **REVERT** `POST /bookings/:id/restore`
(cancel+restore rows persist append-only; log the booking id for Phase D).

**C5 — Step 4b, security 400→403 (validates `758acb0`)** — DENIED write, zero mutation: login
`branch1`/`gospelseed1`; same-origin `PUT /api/contacts/<NN contact>/…{assignedTeacherId:<VB user>}` →
**403 / PERMISSION_DENIED** (was 400 on `fb13257`); contact unchanged.

**C6 — the 3 newly-mapped tokens (from Phase B), best-effort live** — unit tests are the primary proof
(as accepted for `758acb0`); live probes where feasible: `WEAK_PASSWORD` via the admin reset dialog with a
weak password → 400+code; `MISSING_FIELDS`/`CYCLE` via a same-origin REST call that omits a field / makes
an org cycle → mapped status+code. Any not live-triggerable are marked `covered-by-unit-test`, not PASS.

- **Exit:** C1–C5 PASS with before/after net-zero (except the one logged cancelled booking); C6 mapped
  live-or-unit; every cell also passed on local mock (parity); all appended to the exec log.

---

## Phase D — Clean residual test data on the shared real DB (owner decision c)
**Destructive — SELECT-first, sentinel-scoped, count-reconciled.** Use `scripts/sbq.mjs` + `SB_PAT`
(Supabase MCP disconnected — G15).
1. **Enumerate (SELECT, cross-source G5):** list every test row — `contacts WHERE first_name LIKE
   'REVERIFY-%' OR first_name IN (known session sentinels: 'GuardProbe%','%TestContact%', the workflow's
   c-* test names)` and the inert cancelled `bookings` (incl. C4's id + `6c6c070f` from the fix session's
   219 test). Print id, name, created_at, status. Also read the same via the app REST for a second source.
2. **Confirm the count** and that EVERY row matches a sentinel/known-test pattern (G6). A row that doesn't
   match the pattern is NOT deleted — flag it instead.
3. **DELETE** exactly those ids (scoped SQL, not a broad predicate). Respect FK order (bookings/audit refs
   before contacts if needed).
4. **Reconcile:** re-SELECT → 0 sentinel rows remain; total `contacts`/`bookings` counts dropped by
   exactly N; app REST agrees. Log before/after counts in the exec log.
- **Exit:** DB back to the intended baseline (132 users / 67 active contacts / 105 bookings, or the live
  baseline the fingerprint recorded); zero sentinel rows; reconciliation logged. Audit rows for the
  deletes are expected (append-only) and are NOT themselves cleaned.

---

## Phase E — Back up the audit trail to a tracked location (owner decision d)
**Recommendation:** track the small, high-value TEXT trail in git; keep the multi-MB PNGs out of history
but make them tamper-evident with a tracked manifest.
1. Create tracked dir `docs/qa/reverify-2026-07/` and copy in: `REVERIFY-ROUTINE.md`, both
   `reverify-2026-07-1{3,4}.jsonl`, both `SUMMARY-2026-07-1{3,4}.md`, and this PLAN. (These are text,
   diff-able, and are the actual audit record.)
2. Add `docs/qa/reverify-2026-07/EVIDENCE-INDEX.md`: one row per evidence PNG — filename, `sha256`, and
   the one-line claim it proves. (Integrity-checked reference without bloating the repo with binaries.)
3. Leave the originals in the untracked `Case Study/` dir (the working copies) — the tracked copy is the
   durable backup. Commit `docs(qa): track the 2026-07 cutover re-verify audit trail + evidence manifest`.
   *(Offer at run time: if the owner wants the PNGs themselves in git, commit them too — default is
   manifest-only.)*
- **Exit:** the audit trail survives a working-tree wipe (it's in `origin`); PNG integrity is pinned.

---

## Phase F — Consolidate + adversarial spot-check (report FROM the log · G10/G11)
1. **G10:** re-run 3 random PASS cells from `reverify-2026-07-14.jsonl`; divergence ⇒ HALT.
2. Render `SUMMARY-2026-07-14.md` FROM the JSONL (pass rate, per-surface, mock-vs-real parity result);
   spot-check its counts vs the file.
3. In `SUMMARY-2026-07-13.md`: flip the "Not observable read-only" rows to their live verdicts; flip the
   **security-bl caveat** to RESOLVED (C5 passed); note Phase B/D/E outcomes.
4. **G2 end fingerprint:** re-record branch tip + preview hash + DB counts; assert == the phase start
   fingerprints. Log the closing `{phase:"F-end", …}` line.

---

## Phase G (LAST) — Passdown + memories + push
> Per the owner's standing instruction, the passdown update is the **final** step.
1. `SESSION_PASSDOWN.md`: record Phases A–F outcomes (real-backend build id + mode, 3-token map commit,
   the 4 live re-verifications + C5 403, DB cleanup result, tracked-backup location). Correct any line the
   G8 probe falsified (mock-vs-real). Leave unrelated content intact.
2. Memories: update `diamond-remediation-state` (loop fully closed), `diamond-preflip-remaining` (bare-token
   + 3-token mapping done; note any residual), and the mock-vs-real fact wherever it's recorded.
3. Commit docs (`SESSION_PASSDOWN.md` + the Phase-E tracked trail). `Case Study/` working copies stay
   untracked. **Push `feat/supabase-cutover`.** No prod deploy (the flip stays owner-gated).

---

## Done criteria (all must hold, verified from the exec log, not memory)
- **B:** 3 tokens mapped; suite+build green; mock==real in tests; committed.
- **A:** a real-backend preview at the current tip, **G8-proven real**, fingerprint logged.
- **C:** C1–C5 PASS with net-zero reverts (one logged cancelled booking allowed); C6 mapped live-or-unit;
  every cell also green on local mock (parity).
- **D:** zero sentinel rows remain; counts reconciled; no non-test row touched.
- **E:** text trail committed to `docs/qa/reverify-2026-07/`; PNG sha256 manifest committed.
- **F:** SUMMARY-2026-07-14 rendered FROM the JSONL; 2026-07-13 caveats flipped; start==end fingerprint;
  adversarial spot-check clean.
- **G:** passdown + memories updated **last**; branch pushed; git clean except untracked-by-convention dirs.
- **Any HALT** (fingerprint drift, surface mis-ID, parity divergence, spot-check divergence) is recorded
  with its cause; the plan is not "done" while a HALT is open.

## Out-of-scope / scope discipline (G13)
- The **prod flip** (merge cutover→main, env flip, CSP, real-iOS) stays owner-gated — not this plan.
- **PAT rotation** (owed, owner "later") — not this plan; but if the PAT is dead at §1.2, HALT.
- Any new defect found mid-run → `out-of-scope-2026-07-14.md`, not scope creep.
