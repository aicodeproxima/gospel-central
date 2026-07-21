# Gospel Central (formerly "Diamond") — Session Passdown (cold-start for the next session)

> **🏆🟢 LATEST — FABLE 5 (2026-07-21): REV3 item 20 SHIPPED as `2b10382` + RLS migration
> 0018 APPLIED — THE REV3 BACKLOG IS CLOSED, 20/20 PROD-VERIFIED.** The user-approved BL
> cross-branch reversal landed across all four sources of truth in one commit + one applied
> migration: (1) `buildManageableScope` seeds from ALL Branch Leaders (kind stays 'branch' —
> `kind==='all'` surfaces remain Overseer/Dev); (2) the 4 old-policy test pins (permissions
> matrix ×2, critical-scenarios, per-user-smoke) flipped DELIBERATELY with dated notes;
> (3) mock gates auto-widen via `viewerManageableUserIds`, five contact-write audit sites emit
> `crossBranch`, /alerts renders the amber chip; (4) PERMISSIONS.md rows + the visibility≠edit
> callout carry the dated reversal. **0018** adds `manageable_user_ids()` (BL = union of every
> branch subtree), `audit_log.cross_branch`, an `audit_row()` that computes the flag, and moves
> contacts_update + set_contact_teacher/inactive/active + reassign_contact + convert_contact
> from `subtree_user_ids` to `manageable_user_ids`. **Proof chain:** verify-schema showed the
> 12 new markers MISSING pre-apply -> applied via sbq/PAT -> **94/94**; REAL backend (RLS, REST
> as branch1): the C5-baseline cross-branch PATCH returned the row + `cross_branch=true` audit
> rows, reverted net-zero; PROD mock (user's Chrome, branch1): `?edit=` on VB "Aaron" opened
> "Edit Contact", save -> "Contact updated", amber cross-branch chip on /alerts; probes
> reverted, admin session restored. Gates: tsc, vitest 685/685, chromium 80+2 isolation-green,
> webkit 82, mobile+tablet 21/21. **Plan B is COMPLETE — REV3 20/20.** Next candidates live in
> the pre-flip runbook (`docs/FLIP-PRECONDITIONS.md`): username->email shim, mock-parity patch
> (`Case Study/archive/wt-mock-parity-uncommitted-2026-07-17.patch`), CSP, real-iOS check.


> **🏁🟢 LATEST — FABLE 5 (2026-07-21): REV3 item 19 SHIPPED + PROD-VERIFIED as `27e0d0f` —
> 19/20 closed; #20 (BL cross-branch) is the ONLY remaining item.** The REV3 repro is dead:
> Week + Virginia Beach survive a reload (verified live in the user's Chrome; date deliberately
> snaps to today — Jul 20-26 week shown on Jul 21). Mechanics: the explicit Day/Week/Month
> toggle now WRITES `calendarDefaultView` (the Groups groupsDefaultView pattern) and the mount
> effect restores it; the church rides new `gospel-central-booking` (zustand persist v1,
> partialize = selectedAreaId ONLY, rehydrated id validated against live areas w/ first-area
> fallback); programmatic view jumps (month->day click) do NOT write the pref; selectedDate and
> modal state never persist. **NEW `docs/STATE-PERSISTENCE.md`** = the page×state matrix + the
> 5 rules future features must follow (view toggles persist via their *DefaultView pref; dates
> never; validate rehydrated ids; query-ish filters stay in the URL; modal state ephemeral).
> Gates: tsc clean, vitest 685/685, chromium 81+2 / webkit 81+1 isolation-green (known
> load-flake class), mobile+tablet 21/21. e2e sees unchanged defaults (fresh localStorage).
> The duplicate-marble chip landed upstream as `0a61008` (user-run side task). Device state
> restored post-verification (Day + Newport News). **#20 next** — scope unchanged from the
> 07-19 block below (permissions + PERMISSIONS.md dated note + test-pin flips +
> viewerManageableUserIds mock gates + RLS 0018 through verify-schema BEFORE apply +
> crossBranch audit flag; PAT in Claude project memory, proven working).


> **🏁🟢 LATEST — FABLE 5 PASSDOWN (2026-07-19): REV3 item 4 SHIPPED + PROD-VERIFIED as
> `d4559ed` — 18/20 REV3 items now closed; only #19 and #20 remain.** This block supersedes
> everything below on Plan-B state; it also reconciles the three Kimi K3 commits
> (`27ab8db` feedback delivery + migration 0016 · `37d226e` wizard-login fix + migration 0017 ·
> `422ced5` mock per-device persistence + real passwords) into the standing docs.
>
> - **Item 4 (one canonical edit surface):** `ContactDetailDialog` gains `initialMode`; the
>   Contacts page's single `openDetail(id, mode)` opener states the mode at every entry point
>   (pencil + gated `?edit=` → straight to edit; row/card/kanban click → view; a prior edit can
>   never leak into a plain view). `ContactForm` is CREATE-only. #6 nuance closed: partner
>   suggestions now list ANY active user. Decision-10 security posture unchanged (member `?edit=`
>   still falls back read-only — e2e-pinned). PROD-VERIFIED journeys (admin, real Chrome):
>   `?edit=` → "Edit Contact" prefilled · row-action Edit → phone save round-trip API-confirmed
>   then REVERTED (the mock persists per-device now — leave devices net-zero!) · post-edit row
>   click → "Contact Details" view · Add Contact → "New Contact"/"Create Contact" · "Cleme" →
>   Clement suggested as partner. e2e: the sibling session's "REV3 #4" describe in
>   `contacts.spec.ts` rides the same commit — assertions verified against this implementation.
> - **Gates at ship:** tsc clean · vitest 660/660 (xlsx flake since de-flaked upstream by
>   `bf4e8a8`) · chromium 90/90 · webkit 74 + 3 isolation-green (known load-flake class) ·
>   mobile-pixel5 + s24 + tablet-touch 21/21. One environment collapse mid-matrix ("Could not
>   determine Node.js install directory", webkit exit 127) resolved on its own — machine
>   contention with concurrent sessions; re-run clean.
> - **verify-schema.mjs EXTENDED with 0016+0017 markers and run: 84/84 OK** against live
>   (12 tables / 43 functions / 25 policies / auth==public 132) — mechanical proof both new
>   migrations are APPLIED. The `sbp_` PAT Kimi couldn't find IS in Claude project memory
>   (`reference_supabase_gospel_central`) and works — item 20's RLS migration is unblocked.
> - **CLAUDE.md truthed up (rode `d4559ed`):** mock is PER-DEVICE PERSISTENT (`gc-mock-v1`
>   snapshot; reload/logout no longer reseed) + passwords are REAL (seeded default `admin`;
>   wizard/convert accounts need their issued temp password) + the PROVEN reseed recipe
>   (naive clear+reload gets overwritten by the pagehide snapshot — stub setItem first).
> - **REMAINING Plan B:** **#19** (persistence matrix: booking-store `persist` w/ `partialize`
>   for view/areaId — NOT selectedDate; fold `dashboardYourGroupOpen`-style keys into the
>   preferences store; write the page×what-persists matrix into docs/) and **#20 LAST**
>   (BL cross-branch — APPROVED reversal: permissions.ts `buildManageableScope` + PERMISSIONS.md
>   dated note + test-pin flips + `viewerManageableUserIds` mock gates (NOT
>   `viewerSubtreeUserIds`) + RLS migration 0018 added to verify-schema.mjs BEFORE apply +
>   `crossBranch: true` audit flag; mock and RLS flip TOGETHER; PAT in memory).
> - **Known cosmetic debt spotted in passing:** Settings `THEME_OPTIONS` lists `marble` twice →
>   React duplicate-key warning in test logs (pre-existing; one-line fix when convenient).
> - Commit-subject flub on `5632bdd` (subject says "#13 rename fallout", body has the real
>   item-3-follow-up description) — content correct, not worth a force-push.

> **🔑🟢 LATEST-1 — OPUS 4.8 PASSDOWN (2026-07-19, session 3): the `xlsx-export` flake is CLOSED —
> `npm run test` is fully green again for the first time since Phase 8.** Scope was exactly one
> test file; no product code touched. Landed as **`bf4e8a8`** (+ a merge of `origin/main`).
>
> **⚠️ GROUND-TRUTH CORRECTION — the block below is STALE.** It claims `main == origin == prod ==
> 7910a06`. When I started, `origin/main` was already **`df7367b`**, two commits ahead:
> `c03eefd` (the passdown block below) and **`df7367b` fix(users): created accounts get a home
> location and a valid parent** — a real fix from the 2026-07-19 account-creation audit that is
> **NOT described anywhere in this passdown**. If you need its detail, read `git show df7367b`;
> it added `src/mocks/create-user-integrity.itest.ts` (+229). Re-derive tips live before trusting
> any SHA in this file — this checkout is shared and moves under you.
>
> - **The bug:** `buildReportWorkbook` dynamically imports exceljs — **deliberately**, to keep it out
>   of the main bundle (`9a8c992`). Whichever test runs FIRST pays the whole one-time import+transform
>   of a large library; the other 15 hit the module cache. Measured first-test vs rest: **612ms vs
>   ~1ms** idle · **21.3s vs ~1-115ms** full-suite-under-load · **>34s** at 24 procs on 20 cores.
>   The cost is contention-scaled with **no natural ceiling**, so under a loaded run it blew the 5000ms
>   default as `Test timed out in 5000ms` while every assertion was still perfectly fine.
> - **The fix:** a suite-level timeout — `describe('buildReportWorkbook', { timeout: 60_000 }, …)`.
>   **Set on the `describe`, NOT on the first `it`, on purpose:** which test pays the import is an
>   artifact of execution order, so a per-test timeout silently stops protecting the suite the moment
>   someone reorders or prepends a test. 60s (not the 30s first tried) is deliberate over-provisioning
>   — I measured a >34s case that blew 30s. This suite has no legitimate hang mode (no I/O, no network),
>   so a generous ceiling costs nothing and a tight one just reintroduces the flake.
> - **DO NOT "optimize" this later:** making the exceljs import static would fix the timing and silently
>   regress bundle size — the dynamic import is the point. No assertion was weakened.
> - **How it was verified (worth copying):** rather than waiting for load to maybe reproduce, a
>   control/treatment pair with a temporary 6s probe — **without** the option the suite fails with the
>   reported string verbatim (`Test timed out in 5000ms`), **with** it the same test passes at 7088ms.
>   That proves the mechanism instead of hoping. Then re-run under 24-way CPU saturation: passed at
>   11896ms where the 30s version had failed at 34267ms.
> - **Gates at ship (post-merge with `df7367b`):** `npm run test` **678/678 across 43 files**, green
>   both idle AND under saturation; `tsc --noEmit` and `eslint` exit 0 (run UNPIPED — piped exit codes
>   lie, per repo memory). Note the count moved 668 → 678 because `df7367b` added tests: **never assert
>   a fixed test count**, and beware that a `| head -N` on a vitest run SIGPIPEs it into reporting a
>   TRUNCATED pass count as if complete (it reported "35 files/619" mid-run — nearly quoted as a gate).
>
> **WHERE TO PICK UP (in order):**
> 1. **Land `bf4e8a8`** if it hasn't been merged — it is test-only and `xlsx-export.test.ts` is
>    untouched on main, so it merges clean.
> 2. **REV3 remaining: #4, #19, #20** (user order: **#4 before #20**) — full scope in Kimi K3's block below.
> 3. **⚠️ #4 MAY ALREADY BE IN FLIGHT.** At the time of writing, the shared checkout
>    `C:\Users\aicod\Projects\_src\diamond-live` had **UNCOMMITTED** work matching #4's exact scope:
>    `ContactForm.tsx` (-151 lines), `ContactDetailDialog.tsx`, `contacts/page.tsx`, `e2e/contacts.spec.ts`,
>    plus `scripts/verify-schema.mjs` and `docs/qa/propagation*`. **Do not start #4 by rebuilding it** —
>    check `git status` in that checkout and ask the user whose work it is first. This is the
>    concurrent-session hazard this file keeps warning about, live.
> 4. **Still on the user** (unchanged): rotate the `re_...` Resend key, and delete the synthetic
>    `public.feedback` test rows (query in the block below).
>
> **🔑🟢 PREVIOUS — OPUS 4.8 PASSDOWN (2026-07-19, session 2): the Phase-7 feedback carry-forward is CLOSED
> and DELIVERING FOR REAL. [SHA claim below is stale — see the correction above.]**
> Five commits, all Co-Authored-By Claude Opus 4.8. Everything below was driven and confirmed on
> deployed prod in a browser, not from gates alone.
>
> - **`27ab8db` feat(feedback): real delivery.** The Settings card had been toast-only since Phase 7 —
>   `handleSendFeedback` fired "Thanks — your feedback was received." with **zero network calls** and
>   cleared the form. Proven on prod by patching `window.fetch`/XHR/`sendBeacon` and clicking Send:
>   `probeCalls: []`. Every submission since Phase 7 was silently discarded.
>   Fix = `src/app/api/feedback/route.ts`, a Next route **deliberately ABSENT from `src/mocks/handlers.ts`**
>   (see the NON-OBVIOUS ARCHITECTURE note below) + migration `0016_feedback.sql` + a localStorage outbox
>   (enqueue-before-fire, idempotent via `clientRequestId`, 24h expiry, cleared on logout) + toasts that
>   report what ACTUALLY happened. Form now clears ONLY on a confirmed 2xx.
>   Adjacent fixes the design review surfaced: `csv.ts` CSV-formula-injection guard (plain negative
>   numbers exempt so metrics don't become text cells) and `alerts.ts` — `alertCategory`'s
>   `return 'account'` catch-all silently made ANY new `AuditEntityType` an always-on alert bypassing
>   every toggle; now an exhaustive `Record` that **fails the build** until a category is chosen.
> - **`2504e54` + `7207572` test(feedback): the regression gate.** 8 e2e specs pinning each branch of
>   "the toast must describe what actually happened" — the part that regressed and that **no** existing
>   gate could see. Every request is intercepted, so the suite NEVER writes to the real table (load-bearing:
>   the route is real, an un-intercepted run would file a production row per execution). Bonus guard:
>   `page.route()` sits AFTER the in-page MSW patch, so an interception firing at all proves MSW didn't
>   shadow the route — add a `/feedback` handler to the mock and these tests stop seeing requests.
>   De-flake: `loginAs` resolves before Next commits the client-side nav, so `goto` raced it
>   (`ERR_ABORTED / frame was detached`); settle + 3 attempts, `--repeat-each=3` → 24/24. No assertion touched.
> - **`e4b4d76` fix(users): POST /users was an enumeration oracle.** Uniqueness probes ran BEFORE
>   `resolveViewer`, so **anonymous** callers could enumerate the whole 132-user directory by status code:
>   `{username:'admin'}` → 409 "Username already taken" vs `{username:'zzz_nobody_here'}` → 401. Live-verified
>   on prod with no credentials at BOTH `27ab8db` and `2504e54`. Reordered to authenticate → authorize →
>   validate → conflict, so only a caller permitted to create users can learn a name is taken. **Parity fix,
>   not a new rule** — the real backend was never vulnerable (`create_user` in `0003_admin_rpcs.sql` raises
>   PERMISSION_DENIED before the insert). Guard `src/mocks/create-user-enumeration.itest.ts` pins the ORDER
>   (each cell sends a payload that WOULD 409 and asserts an earlier gate refuses it); verified to FAIL 6/8
>   against the pre-fix handler before being accepted.
> - **`7910a06` fix(feedback): the notification email was lying about storage.** Caught by READING a
>   delivered email instead of trusting the 201: every notification said "Stored: NO — this email is the
>   only copy" while the row existed with `delivered_email=true`. `notify()` ran before `store()` with a
>   hardcoded `stored=false` — the same lying-status bug this route exists to remove, reintroduced one layer
>   down in my own code. Now store → notify with the real value → flip `delivered_email` only once Resend
>   accepts. Idempotency now covers the EMAIL too (`store()` reports `isNew` + the existing row's
>   `delivered_email`), so a replayed outbox entry can't page the devs twice for one complaint.
>
> **NON-OBVIOUS ARCHITECTURE (the thing that makes this work — don't undo it):** prod runs the in-bundle
> MSW mock, so an MSW handler or a Supabase migration alone reaches NOBODY. `src/mocks/browser.ts` passes
> unmatched requests THROUGH to the network, and `src/app/api/[...path]/route.ts` hard-404s under `IS_MOCK`
> — so a **specific** route segment is the only path that reaches a server, and it works in BOTH modes and
> survives the flip untouched. Adding `/feedback` to `handlers.ts` would silently break real delivery.
> Identity is **self-asserted** in mock mode (browser holds `mock-jwt-token-*`, not a Supabase session):
> recorded as `submitter_verified=false` and labelled that way in the email — never an authenticated claim.
> Feedback text is deliberately kept OUT of the audit log (BL+ readable, searchable, CSV-exportable, feeds
> `/alerts`); its own table has an overseer/dev-only select policy and NO insert policy.
>
> **PROD ENV NOW SET (Production rows, previously none):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
> (Sensitive), `RESEND_API_KEY` (Sensitive), `FEEDBACK_TO_EMAIL` = nntechdev1@gmail.com,
> `FEEDBACK_FROM_EMAIL` = `Gospel Central <feedback@accessoryseezin.com>` (the Resend account's only
> VERIFIED domain — `onboarding@resend.dev` can only deliver to the account owner). Migration `0016`
> applied to `imjsdsepmhgazracegog`. **Env changes need a REDEPLOY** (`vercel redeploy <url>`, never
> `vercel --prod` from this checkout — a concurrent session's WIP is usually uncommitted here).
>
> **FULL-CHAIN PROOF as a real non-admin user (UI only, 2026-07-19):** signed in as `member42`
> (Tychicus, Member — nav correctly hid Reports/Admin) → Settings → typed a bug report → picked a
> category → Send. Row landed as `Tychicus / member`, `submitter_verified=false`, `delivered_email=true`;
> Resend `last_event: delivered`; email body reads `Stored: yes — public.feedback`. User confirmed they
> saw the toast and that its short duration is intended — **do NOT "fix" the toast timing.**
>
> **OPEN / ON THE USER:**
> - **Rotate the `re_...` Resend key** — it was pasted into a chat transcript in plaintext.
> - **Test rows in `public.feedback`** (mine + Tychicus's realistic sample). Delete the synthetic ones when done:
>   `delete from public.feedback where subject in ('Verification after the fix','Offline failure test','Idempotency proof','Success toast capture','Email path probe');`
> - ~~**`xlsx-export` flake**~~ — **CLOSED, see LATEST above (`bf4e8a8`).** `task_2bfca52a` is done;
>   the "treat 667/668 as green-with-known-flake" caveat is RETIRED — `npm run test` is now fully green.
>
> **🔑🟡 PREVIOUS — KIMI K3'S PASSDOWN (2026-07-18)** [its "UNCOMMITTED follow-up fix" shipped as
> `5632bdd`; REV3 #4/#19/#20 remain]: **REV3 item 3 SHIPPED + PROD-VERIFIED; the
> tier-2 highlight follow-up fix is GATE-GREEN but UNCOMMITTED — user is holding the commit.**
> Kimi K3 picked Plan B up after the prior session was rate-limited mid-item-3. State: `main`
> local == origin at **`77d7b19`**; the working tree holds the UNCOMMITTED follow-up fix +
> the CLAUDE.md verification directive (+ `src/lib/version.ts` build churn — exclude per
> wave-1 convention). Remaining REV3: **#4, #19, #20** (user order: #4 before #20).
>
> - **Item 3 (tiered prefix search + yellow highlight) SHIPPED as `77d7b19`** (11 files incl.
>   new `tree-search.test.ts`; version.ts excluded). Gates at ship: tsc clean, vitest 614/614,
>   build clean, e2e 171+2 batch flakes (both passed in isolation).
> - **PROD VERIFICATION via Playwright MCP on gospel-central.vercel.app (the mandated gospel
>   journey):** Groups PASS — "Abidan" resolves the CONTACT with prefix mark + ancestor chain;
>   "iel"/"Newport" → "No matches found"; "barn" → tier-1 Barnabas then tier-2 contacts with
>   "• via Barnabas". Calendar PASS — "iel" → nothing, "gam" → Gamaliel with yellow "Gam" mark
>   (screenshot `.playwright-mcp/rev3-item3-calendar-gam.png`), "member" → nothing.
>   **Contacts FAILED BY EYE — a bug every gate missed:** default "B" search tier-2 rows
>   (e.g. *Elizur Ben-Shedeur*, matched via partner Barnabas) highlighted the surname "B" in
>   "Ben-Shedeur" and swallowed the "via \<partner\>" line — the `?? prefixMatch` fallback in
>   ContactsTable.tsx/ContactCard.tsx. The tier-1/tier-2 filter + ordering itself was verified
>   CORRECT against live seed data (partners confirmed via in-page `/api` fetch).
> - **FOLLOW-UP FIX (UNCOMMITTED, green, awaiting user's go):** new
>   `nameHighlightRanges`/`partnerHighlightRanges` in `src/lib/utils/text-match.ts` keep the
>   highlight in lockstep with each searchField's filter semantics (default = full-prefix
>   only; scoped contact/branches = word-start; other fields = none). ContactsTable +
>   ContactCard take `searchField` from the page; the "via" line exists ONLY in the default
>   tiered search. +4 unit pins (incl. the exact prod case). Gates: tsc clean,
>   **vitest 618/618**, build clean, **e2e 170+3 webkit batch flakes** (booking B4 /
>   reschedule / permissions B11 — all pass in isolation; same known flake class as waves
>   2a/2b). Commit scope: the 5 fix files + CLAUDE.md; exclude version.ts. After committing:
>   push, poll `/version.json`, re-drive the "B" journey (Table AND Grid) on prod.
> - **CLAUDE.md updated (UNCOMMITTED, rides with the fix):** USER DIRECTIVE 2026-07-18 —
>   always verify fixes with UI automation (Playwright / real-browser MCP) as the source of
>   truth, from the user's perspective; headless only for genuinely invisible changes. The
>   browser-automation bullet now names Playwright MCP a full peer (the condemned pattern is
>   unwatched headless scripts, not Playwright itself).
> - **chrome-devtools MCP CONFIGURED** in `~/.kimi-code/mcp.json` (timestamped backup kept;
>   `chrome-devtools-mcp` v1.6.0 verified via npx; `--headless=false`). **Needs `/reload` or a
>   new session to enter the toolset** — this session used Playwright MCP. Gotcha: MCP-relative
>   screenshot paths (`./x.png`) resolve against the SESSION cwd (career-automation), NOT the
>   repo — pass absolute paths into the repo's `.playwright-mcp/`.
> - **Supabase keys now in `.env.local` (gitignored, verified):** `SB_SECRET` (Data-API secret,
>   RLS-bypass — probed 200), `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
>   (anon JWT — probed 200; the real-backend env pair is COMPLETE locally; mock mode untouched
>   while `NEXT_PUBLIC_MOCK_API=true`), `SB_PUBLISHABLE` (200), `SB_SERVICE_ROLE` (200).
>   **Management API returns 401 with ALL of them** — item 20's RLS migration +
>   `scripts/verify-schema.mjs` still need a **`sbp_...` PAT** (Supabase dashboard → avatar →
>   Account Settings → Access Tokens → Generate). Ask the user when #20 starts.
> - **Plan B remaining:** #4 (consolidate contact edit onto ContactDetailDialog; ContactForm
>   create-only — also closes the #6 nuance), #19 (persistence matrix: booking-store persist
>   view/areaId w/ partialize + docs matrix; NOT selectedDate), #20 (BL cross-branch — APPROVED
>   policy reversal: permissions.ts `buildManageableScope` + PERMISSIONS.md + test pins +
>   `viewerManageableUserIds` mock gates (NOT `viewerSubtreeUserIds`) + Supabase RLS migration
>   verified by verify-schema.mjs FIRST + `crossBranch: true` audit flag; mock and RLS flip
>   TOGETHER).
> - **Session mechanics worth keeping:** wave commit style = `fix(rev3): wave N — items ...`
>   with the full gate summary in the body. `docs/qa/propagation*` ride commits whenever the
>   harness regenerates them (fingerprint anchors to HEAD). e2e batch flakes (calendar slot
>   clicks / settings networkidle under parallel load) are a KNOWN class — re-run the red ones
>   in isolation before believing them. Vercel deploys main in ~60s; poll `/version.json` for
>   the new short SHA before any prod drive.

> **🧹 LATEST — REPO/GIT/VERCEL/SUPABASE CLEANUP EXECUTED (2026-07-17, after REV3).** The
> "local == online 1-for-1" invariant now HOLDS: branch topology is exactly **`main` +
> `feat/supabase-cutover`** both sides (16 locals + 9 remotes retired behind 6 `archive/*` tags —
> 5 pushed; `archive/stash-dropdown-1` is LOCAL-only, GitHub GH001-rejected its 955MB untracked
> parent), worktrees 5→1, stashes dropped, `C:\Users\aicod\Diamond` clone DELETED after salvage,
> `git status` clean (gitignore now covers the local-only artifact dirs). **Salvage highlights:**
> stash@{1} secretly held the ONLY copy of the Meeting-1 Zoom recordings/transcripts/notes →
> extracted to `Case Study/archive/stash1-untracked-2026-07-04/` (877MB); an uncommitted 93-line
> mock-parity diff from the wt-mock-parity worktree → `Case Study/archive/wt-mock-parity-uncommitted-2026-07-17.patch`.
> **New tools:** `scripts/verify-schema.mjs` (80/80 file-derived markers green vs live Supabase,
> G8-tested; the survey's "19 triggers" was wrong — file-derived 14 confirmed) and
> **`docs/FLIP-PRECONDITIONS.md`** (dated `vercel env ls` evidence: Production has NO Supabase
> rows — `MOCK_API=false` alone = outage; ordering + post-flip probes + rollback). The
> bash-guard's mobile-opt-main/admin-system push rules are RETIRED. `feat/supabase-cutover`
> carries no unique commits (ancestor of main) and lives on ONLY as the real-backend preview
> channel — fast-forward it to main after work lands. Cutover-era "on the other branch" claims
> below this block are historical. Exec log: `Case Study/audit/cleanup-2026-07-17.jsonl`.
> Prior context: Plan C (`8869646`) shipped the /groups dock-clearance fix the same day.

> **✅🔁 LATEST-1 — REV2→REV3 VERIFICATION RUN COMPLETE (2026-07-17).** All 20 findings in
> `Things to work on/Things to work on REV2 07142026.txt` verified LIVE on prod (main @ 9c2d30b,
> Playwright, admin + branch1 sessions) → deliverable written:
> **`Things to work on/Things to work on REV3 07172026.md`** + 9 evidence PNGs in
> `Things to work on/rev3-evidence/`. **Score: 2/20 PATCHED (#6 partners unrestricted,
> #12 contacts-under-teacher), 17 OPEN, 1 PARTIAL (#19 state persistence).** Each OPEN item
> carries live repro + root cause + file:line + fix direction — a fix session can start cold from
> REV3 alone. Highlights: #8 star trail root cause is GoldStarTrail fixed-divs × `:root zoom:0.9`
> (proven 100→90 px, NOT the canvas); #15 expand-all centers the ROOT'S whole 17.8k-px subtree
> container (block:'center') = the "random name"; #11 default marble on /groups measures ~2.5:1
> contrast (AA needs 4.5); #7 wizard-created contact gets NO groupName (E2E proven); #20 = APPROVED
> policy change (user 2026-07-17: BLs alternate physically between branches) with live baseline
> 403-cross/200-own — scope = permissions.ts buildManageableScope + PERMISSIONS.md + test pins +
> `viewerManageableUserIds` mock gates (NOT viewerSubtreeUserIds = read scope) + Supabase RLS
> migration, all four sources together. **Step 5 adversarial cross-check ran and its 5 corrections
> are APPLIED** (wrong mock-helper name in #20, #14 render-site undercount 4→7+2, #9 12:00pm
> end-marker wording, line drifts #2/#4/#13, #11 wording). Docs stay UNTRACKED (repo convention).
> The plan-named file `REV3 07152026` was superseded by the current-date name per user instruction.
> Historical run ledger below (Entries 1–4).
>
> - **Entry 1 — Step 1 setup + Step 2 #14 code-map (DONE).** GROUND-TRUTH DRIFT: prod is now
>   **main @ `9c2d30b`** (built 2026-07-17T04:54Z; plan said 94fa544 — stale). Checkout branch is
>   now **main**; old cutover tip `a6e8bed` IS an ancestor of HEAD (branches converged; Dock&Glide
>   nav is live on prod). Diffed `a6e8bed..HEAD`: ALL changes are nav-chrome → **every recon verdict
>   in the plan table remains valid** (re-checked: settings still has NO groupsDefaultView control
>   (#10); `nav.groups` still 'Groups' (#13)). **#14 mapped:** the rename target is
>   `contact.currentStep` rendered as literal "Step {n}" at ContactDetailDialog.tsx:490,
>   OrgNode.tsx:366, Tree3D.tsx:427, dashboard/page.tsx:336 (field: contact.ts:70). The i18n keys
>   `wizard.step`/`misc.step` are wizard PROGRESS counters (BookingWizard.tsx:670,
>   CreateUserWizard.tsx:212) — different concept, flag in REV3, presumably NOT renamed.
>   Session: Playwright on prod, authenticated as Michael/Dev (persisted profile), desktop viewport.
>   Early live: version footer `v1.0.0 · 9c2d30b` (#17); "Your Group" expanded, no collapse control (#18).
> - **Entry 2 — Step 3 "Groups (desktop)" (DONE). All 8 verdicts live-confirmed:**
>   **#1 OPEN** — contact "Abidan Ben-Gideoni" visible in tree, search "Abidan" → "No matches found"
>   (evidence: rev3-evidence/groups-01-search-misses-contact.png). **#3b OPEN** — "iel" matches
>   Gabriel/Gamaliel mid-name (substring); "Newport" returns users via church metadata; no highlight.
>   **#4 OPEN** — Pipeline→First Study→Ahira Ben-Enan opens the Groups "Contact Details" dialog
>   (status-button row), NOT ContactForm (groups-04-pipeline-contactdetails-modal.png). **#8 ROOT
>   CAUSE REVISED + PROVEN**: it is NOT ParticleBackground (its geometry checks out) — it is
>   **GoldStarTrail.tsx** (marble default theme): fixed divs at `left:clientX px` under
>   `:root{zoom:0.9}` paint at ×0.9 — measured live: spawn@100→renders@90, 300→270, 600→540.
>   Trail lands at 90% of cursor pos, drift grows toward bottom-right. Fix: divide by effective
>   zoom (precedent: BookingSearchBar /rootZoom) or exclude the class from zoom. **#11 OPEN,
>   root-cause refined**: /groups ALWAYS renders a dark starfield backdrop when
>   backgroundStyle='none' (groups/page.tsx:368-376 `bg-[#04071a]`) while DEFAULT marble keeps
>   near-black text; ContactLeaf `bg-card/40` → white@~0.3 over near-black = card rgb(79,81,95)
>   vs text rgb(14,13,13) = **contrast ~2.5:1 (WCAG AA needs 4.5:1)** — fails on the DEFAULT
>   theme, not just exotic combos (groups-15-expandall-scrolljump.png shows it). **#12 PASS** —
>   contacts nested under own teacher incl. Members (Gamaliel→Samson, Simeon Niger→Adam etc.).
>   **#13 OPEN** — dock nav label "Groups" (H1 is "Organization", tab is "Org Tree"). **#14 live** —
>   "Step N" labels render throughout list view (21× "Step 4" etc.). **#15 OPEN + mechanism
>   sharpened**: Expand click → scrollTop 0→7490/17875, centers "Simeon Niger" — requestFocus(root)
>   scrollIntoView(block:'center') centers the ROOT'S WHOLE ~17.8k-px subtree container, so
>   viewport lands mid-tree = the "random name".
> - **Entry 3 — Groups-mobile + Contacts + Calendar page-groups (DONE):**
>   **#2 OPEN (proven numerically @275×596):** search input rect x64–137 vs List/3D/overflow
>   cluster x134–207 = geometric overlap; input squeezed to ~57px visible; NO magnifier collapse
>   (groups-02-mobile-275-default.png). **#3a OPEN:** "B" under default All-fields returns 40
>   contacts incl. Abidan Ben-Gideoni/Ahira Ben-Enan (word-start matcher hits "Ben-" +
>   church metadata); DEFAULT Table view has ZERO `<mark>` highlights; Grid view highlights
>   name-only (12 of 40 cards) with `bg-primary/25` (theme tint, NOT yellow)
>   (contacts-03a-searchB-grid-highlight.png). **#5 OPEN:** New Contact form "Assigned teacher"
>   renders 73 options EXPANDED on mount; Status properly collapsed
>   (contacts-05-teacher-list-preexpanded.png). **#6 PASS w/ nuance:** partner (Branches) field
>   has NO hierarchy scoping ("Jose" → Josephs across branches incl. mid-string matches); nuance:
>   plain members (Clement) get no SUGGESTION in ContactForm (leaders+teacher-tag filter,
>   ContactForm.tsx:135-147) though free text accepts anyone; ContactDetailDialog offers ALL users
>   — inconsistency to flag. **#3c OPEN:** calendar search "iel" → "Gamaliel | Member" substring,
>   0 marks; roleLabel matching pinned in code (BookingSearchBar.tsx:93-101). **#9 OPEN (live):**
>   "All day" selects only 9/32 slot buttons = 8:00am–12:00pm morning block
>   (calendar-09-allday-morning-only.png). **#7 OPEN (end-to-end):** booked Bible Study on NN Zion
>   (Room 2, Joseph, new contact "Rev3 Testcontact") → created contact has groupName ABSENT +
>   no locationId (confirm step has no church field either); teacher DID set (u-branch-1).
>   Mock reseed on reload auto-cleaned the test contact (verified gone). **#19 evidence:**
>   contacts view=grid PERSISTED across reload (localStorage contacts.view); calendar Week→reload→
>   back to Day (live view/date/church NOT remembered — only the pref default is).
> - **Entry 4 — Alerts + Settings + #20 baseline (DONE). STEP 3 COMPLETE — all 20 items verified live:**
>   **#16 OPEN:** alert rows show only details + actor + timestamp ("Created Group Meeting
>   booking | Michael | Jul 13, 5:11 PM") — no target/entity/reason (model has
>   entityType/entityId/before/after/reason unshown). **#10 OPEN:** Settings has "Calendar
>   Preferences → Default View" but NO Groups equivalent (full page text swept). **#17 OPEN:**
>   About = v1.0.0 · 9c2d30b · built Jul 17 2026 · main; version still 1.0.0 → bump package.json
>   (generate-version.mjs derives the rest). Settings also lists the backgroundStyle picker
>   (None/Galaxy/Prismatic Burst/Light Pillar/Floating Lines/Liquid Chrome/Beams) = the "combo"
>   axis for #11. **#20 baseline (as branch1, BL Newport News):** PUT VB contact → 403
>   PERMISSION_DENIED; PUT own-branch NN contact → 200; GET sees all 70 contacts (READ-all).
>   Baseline for the APPROVED relaxation. Signed back in as admin (browser left on /dashboard).
>   Own-branch probe note wrote notes='rev3-authz-probe' to mock contact Abel — in-memory only,
>   wiped on any reload (already reloaded since).
> - **Resume pointer:** next = Step 4 write REV3 → `Things to work on/Things to work on REV3
>   07172026.md` (structure: header + 20 items, original wording + Verdict/Live
>   verification/Root cause/Fix direction), then Step 5 adversarial cross-check agent, final
>   passdown entry. Evidence set (9 PNGs) complete in `Things to work on/rev3-evidence/`.

> **✅✅✅ PRIOR — CUTOVER RE-VERIFY CLOSURE PLAN EXECUTED + BOTH CAVEATS RESOLVED (2026-07-14). Branch tip `074e8ca` (pushed).**
> Supersedes everything below that conflicts. All 5 owner-approved follow-ups (a–e) done; the whole
> re-verify loop is closed. Anti-drift exec log + summary:
> `Case Study/audit/remediation-verify/reverify-2026-07-14.jsonl` + `SUMMARY-2026-07-14.md` (also backed
> up TRACKED under `docs/qa/reverify-2026-07/`).
>
> - **(B) `035e3a2`** — mapped the 3 residual bare PG tokens `WEAK_PASSWORD`/`MISSING_FIELDS`/`CYCLE` →
>   `VALIDATION_ERROR`/400 in `supabase.ts` (completes `758acb0`; enumerated ALL migration raise-tokens vs
>   the map — these were the only gaps). +4 unit tests, full suite **570 green**, clean build. Mock parity
>   confirmed by inspection (mock `validationError` already returns the same `{VALIDATION_ERROR,400}` shape).
> - **(A) real-backend build PROVEN + mock-vs-real record CORRECTED:** the `feat/supabase-cutover`
>   **git-auto Vercel preview runs the REAL Supabase backend** (branch-scoped `MOCK_API=false`), NOT mock —
>   G8-probed on `gospel-central-ohya1yj5d-…vercel.app` @`035e3a2`. The `758acb0` session's "auto-preview is
>   mock" was an UNPROBED assumption — always PROBE: `/api/me` id UUID = real (vs `u-michael` = mock); an
>   unknown `/api/*` route returns 501 JSON on real (vs the HTML shell on mock, since MSW is SW-free/in-browser).
> - **(C) 6 live cells on `035e3a2` (write→revert):** C1 188 (teacherless→`assignedTeacherId` null), C2
>   68/77 (`stage_change` timeline row, real actor), C3 219 (title ends "— {subject}", live-observed), C4
>   497/264 (cancel audit row carries the verbatim reason + real actor, migration 0013; restored). **C5 =
>   THE HEADLINE: a BL cross-branch contact-reassign now returns 403/PERMISSION_DENIED (was 400/UNKNOWN
>   pre-`758acb0`), zero mutation — validates the whole A/B/deploy chain live.** C6 tokens = unit-proven
>   (they fire only in edge RPC paths standard REST can't cleanly reach — Supabase Auth owns password
>   validation → native 422; create-user defaults empty fields).
> - **(D) DB cleaned:** hard-deleted 6 test rows via `sbq.mjs`+PAT (5 inactive test contacts + `user888`
>   incl. its `auth.users` row + cancelled test booking `6c6c070f`); reconciled to the clean baseline
>   **67 contacts / 132 users / 105 bookings**. SELECT-first, sentinel-scoped; audit-log history left intact.
> - **(E) audit trail BACKED UP tracked** under `docs/qa/reverify-2026-07/` (text trail + `EVIDENCE-INDEX.md`
>   with sha256 of the 5 evidence PNGs; the PNGs themselves stay untracked — regenerable).
> - **BOTH CAVEATS RESOLVED (follow-up run, `074e8ca`):**
>   - **CYCLE is LIVE-PROVEN** — the "unit-only" caveat is gone. `CYCLE` *is* reachable:
>     `PUT /users/:id { parentId }` → `reassign_user` (router:266). Probed live @`035e3a2`: reparenting
>     Joseph under his own descendant `group1` → **400 / `VALIDATION_ERROR` / `CYCLE: new parent is within
>     the target subtree`**, `parentId` unchanged (zero mutation). Self-parent identical. Was 400/UNKNOWN.
>   - **WEAK_PASSWORD / MISSING_FIELDS are unreachable BY CONSTRUCTION** (not "edge paths" — that framing
>     was imprecise): `POST /users` synthesizes username/email/password (router:228-230; `genUsername`
>     :47-48 is what produced the `user888` artifact), convert does the same (:220-222), reset-password
>     uses a server temp pw (:234), change-password uses GoTrue `auth.updateUser` NOT the RPC (:238-241
>     → the native 422 I saw). Only a direct `rpc()` bypassing the router raises them. Their map entries
>     are deliberate **defense-in-depth — do NOT delete as dead**; both comments now say so.
>   - **C1/C3 re-driven through the UI on the CURRENT build** (`035e3a2`), each screenshot showing the
>     `v1.0.0 · 035e3a2` fingerprint in-frame: 188 Grid card `TEACHER Unassigned` + no church name; 219
>     full wizard create → `… — {subject}` and edit (leader→Agabus) **preserves the suffix**.
>   - **Bonus — real parity gap found + fixed (`074e8ca`):** the mock returned **403** for a
>     self-parent/cycle reparent while real raises `CYCLE` → **400/VALIDATION_ERROR`**. A cycle is bad
>     input, not a permission failure → `handlers.ts` now uses `validationError` (the cross-branch SCOPE
>     check stays 403, mirroring the RPC's separate PERMISSION_DENIED branch). RED→GREEN: flipped the pin
>     + added a true-cycle test asserting zero mutation. Also killed **fictional RPC names** in two
>     comments (`set_password`/`move_org_node` → `reset_user_password`/`reassign_user`). Suite **571 green**.
> - **No open blockers.** **`sbp_` PAT rotation still owed** (user: later). **Shared-checkout hazard bit
>   again** — the branch advanced `ee4da06→86e77fb→758acb0→ee0d1f4→035e3a2→074e8ca` across concurrent
>   sessions; re-derive `git rev-parse origin/…` live before any commit. The prod flip stays owner-gated.

> **✅✅ PRIOR — AUDIT-FINDINGS REMEDIATION SHIPPED + RE-VERIFY RUN COMPLETE (2026-07-14).**
> This block supersedes anything below that conflicts. Session model: Fable 5 + ultracode; every
> decision below marked "user-locked" came from an explicit AskUserQuestion answer — do NOT re-litigate.
>
> **WHERE WE ARE:** the 526-action UI audit is **COMPLETE (526/526, resume-pointer prints "section
> COMPLETE — do not loop")** and its 50 non-Done findings are **REMEDIATED**. Branch
> **`feat/supabase-cutover`**, tip **`601d5a1`** (pushed; **0 behind / 28 ahead of origin/main** —
> main is FULLY merged in as of `1ad1c58`, do NOT redo that merge). **`REMEDIATION.md` (repo root,
> tracked) is the authoritative finding → commit → evidence ledger — read it before touching any
> audit finding.** Memory: `diamond-remediation-state`, `diamond-remediation-branch-divergence`.
>
> **Session commits (all pushed):** `1ad1c58` merge main→cutover (closed findings 94/96, 68/77-mock,
> 282, 393 with zero new code) · `48fadc4` includeInactive contract + audit cancel-reason (78/151/497,
> migration **0013**) · `15f2269` Invalid-Date guard + past-slot retirement + subject-bearing titles
> (223/292/219) · `ca0d713` Escape scoping / delete a11y / strict slot-0 Main-Branch / Unassigned
> label (92/149/102/188) · `19c075f` reports month-bound + cosmetics + seed hygiene
> (509/516/349/132/518/145/147) · `dc4ee4c` **SECURITY**: BL contact-reassign target scoped to own
> branch on ALL 3 surfaces (helper + MSW gate + migration **0014**) · `c5d3183` contact RESTORE flow
> (151 wave-2: mock endpoint + migration **0015** + Admin UI Restore control) · `e9d9af9` seed edge
> cases c-68..c-71 + orphan booking + VB closed day (awakens dormant findings 51/61/62/64/236/303/420)
> · `fb13257`+`601d5a1` closure docs + remediation-verify workflow. Regression pins:
> `src/mocks/remediation-wave1.itest.ts` + a permissions matrix test. Gates green throughout
> (final: vitest 547/547, clean build).
>
> **5 PRODUCT DECISIONS (user-locked 2026-07-13):** (1) past bookings = grey elapsed slots +
> allow-with-amber-notice (retroactive entry stays legal, NO backend reject); (2) booking titles =
> subject-bearing "Bible Study: {leader} with {contact} — {subject}" for create AND edit; (3) partner
> slots keep nulls, Main-Branch purple follows DATA slot 0 strictly (no auto-promotion); (4) audit
> `reason` populated on cancel on BOTH backends; (5) Reports month card bounded through-now,
> Cancellations stays action='cancel'-only, seed delete-wording clarified.
>
> **LIVE SUPABASE (ref `imjsdsepmhgazracegog`): migrations 0013/0014/0015 APPLIED + marker-verified
> this session (0012 confirmed already live; booking mutations verified WORKING live, so the old
> "0009 UNAPPLIED" warning below is RESOLVED).** DDL path that works: Management API + `sbp_` PAT +
> **curl with a browser User-Agent** (python urllib → Cloudflare 1010). Real-backend E2E proofs done
> on preview: contact delete→hidden→dimmed-via-includeInactive→restore→back; cancel with typed
> reason → audit row carries `reason` verbatim + REAL actor. PAT rotation still owed (user: later).
>
> **✅ RE-VERIFY RUN COMPLETE (2026-07-14).** The `remediation-verify` browser re-verification is
> DONE. Final: **19/21 Fixed-verified (90.5%), 0 Still-broken, 0 Regressed, 2 Blocked** — both
> Blocked are mock-only seed rows (seed-edge-cases contacts + the 236 VB full-day closure) absent
> from the real backend, and BOTH have Fixed-verified mock-local counterparts (JSONL lines 8–9) run
> on a local `NEXT_PUBLIC_MOCK_API=true` dev server, so every REVERIFY-ROUTINE checklist branch has a
> passing verdict. Artifacts: **`Case Study/audit/remediation-verify/reverify-2026-07-13.jsonl`** (21
> lines) + **`SUMMARY-2026-07-13.md`** (rendered FROM the JSONL) + 5 evidence PNGs. Start==end
> fingerprint `v1.0.0 · fb13257` → run VALID. REMEDIATION.md's last closure checkbox is now ticked;
> the ledger is fully closed.
>
> **⚠️ SURFACE CORRECTION (proven live, supersedes the earlier "MOCK-ON preview" wording): the CLI
> preview `gospel-central-ghonounep-…vercel.app` runs the REAL Supabase backend, NOT the mock** —
> despite the `--build-env NEXT_PUBLIC_MOCK_API=true` deploy flag. Agents proved it: server 501s from
> the catch-all route, UUID ids, state PERSISTS across reloads, and `admin`/`admin` 401s (login shim
> = `admin`/`gospelseed1`). That is exactly why the two mock-only seed checks (converted badge, VB
> closure) had to run on a LOCAL dev mock. (Why `--build-env` didn't take was not chased — out of
> scope; noted for the record only.)
>
> **FOLLOW-UPS (not blocking closure):**
> - `task_630bc486` **DONE** — CSV-import `createdBy:'import'` uuid-parse fix landed as commit
>   `717ebb5` (fast-forwarded into this branch); the finding-188 caveat is resolved on-branch (the
>   fb13257 preview predates it, so the preview itself still 400s on CSV import — expected).
> - `task_a8313c10` **DONE** — landed as commit `758acb0` (bare PG tokens now map to real HTTP status:
>   `pgErrorToApiError` recovers a colon-less token → `PERMISSION_DENIED`→403 / `NOT_FOUND`→404 /
>   `UNAUTHORIZED`→401 / `*_CONFLICT`→409). Unit-pinned in `supabase-errors.test.ts` (RED→GREEN), full
>   suite 566 green + clean build; migrations untouched. **Residual:** 3 bare tokens
>   (`WEAK_PASSWORD`/`MISSING_FIELDS`/`CYCLE`) are still absent from `TOKEN_TO_CODE` → 400/UNKNOWN
>   (separate small code chip if wanted). **Live 403 re-probe is PENDING** a real-backend preview of
>   `758acb0`+ — see `Case Study/audit/remediation-verify/PLAN-not-observable-2026-07-14.md` Step 4b
>   (the `ghonounep`/`fb13257` preview predates the fix, so it would still show the old 400).
>
> **Branch tip now `758acb0` (pushed; local == origin).** This session's commits (feat/supabase-cutover,
> oldest→newest): `717ebb5` CSV-import fix (concurrent session) · `ee4da06` remediation-verify brief →
> real-backend reality + folded finding 132 into the booking group · `86e77fb` re-verify closure
> (REMEDIATION.md tick + passdown) · `758acb0` bare-PG-token → HTTP-status fix (concurrent session,
> task_a8313c10; full suite 566 green). `src/lib/version.ts` + `docs/qa/propagation*` build/test churn
> restored; `Case Study/` audit artifacts (JSONL + SUMMARY + PLAN + 5 evidence PNGs) stay UNTRACKED.
>
> **RE-VERIFY TOOLING (reusable):** routine = `Case Study/audit/REVERIFY-ROUTINE.md`; orchestration =
> `.claude/workflows/remediation-verify.js` (named `remediation-verify`; args `{targetUrl, date,
> only?}`, tolerates stringified args; SEQUENTIAL browser agents — one Chrome; verdict files are
> named `reverify-*.jsonl` ON PURPOSE so `resume-pointer.py`'s `findings*.jsonl` glob never sees
> them). The hourly `gospel-central-app-testing` scheduled task should keep reporting COMPLETE — if
> it ever proposes re-auditing from action 1, that's a bug, stop it.
>
> **ORACLE DOC:** 13 stale/refuted claims corrected via `doc-tool.mjs apply
> audit/corrections-remediation-2026-07-13.json` (items 102, 132, 151, 245, 258, 264, 292, 325, 349,
> 426, 429, 497, 518) — byte-exact, still 526 items, pointer unaffected. Notable REFUTED finding:
> 264's "cancel morphs into a prefilled create wizard" is a ~100ms exit-animation flash, NOT a real
> state — don't "fix" it.
>
> **PREVIEW-URL GOTCHAS:** the full branch alias exceeds the 63-char DNS label and does NOT resolve —
> use `vercel list gospel-central --scope aicodeproximas-projects` (newest Preview row) or the stable
> truncated alias `gospel-central-git-feat-supabase-be50b6-aicodeproximas-projects.vercel.app`.
> **Branch previews run the REAL backend** (login `admin`/`gospelseed1` — the username→email shim
> works; mock creds `admin`/`admin` 401 there). Mock-mode checks need a CLI preview with
> `--build-env NEXT_PUBLIC_MOCK_API=true`.
>
> **NEXT STEPS (in order):** (1) ✅ DONE — re-verify run harvested: 19/21 Fixed-verified, 0
> broken/regressed, REMEDIATION.md closure box ticked, `SUMMARY-2026-07-13.md` rendered FROM the
> JSONL (both mock-only Blocked branches covered by mock-local counterparts); (2)
> the deliberately-NOT-fixed list at the bottom of REMEDIATION.md (TSV import, Active-Now semantics,
> phone column…) is decided — reopen only if the user asks; (3) the PROD FLIP remains user-gated
> (CSP pass, real-iOS check, merge cutover→main + env flip — see the 2026-07-07 block below, minus
> its resolved 0009 item); (4) rotate the `sbp_` PAT when the user says so.

> **✅ PREVIOUS — SUPABASE CUTOVER NEARLY FLIP-READY (2026-07-07).** Branch **`feat/supabase-cutover`**
> tip **`c05099b`** (pushed; NOT on main). Everything below is verified this session; memories
> `diamond-phase-c-auth-state` + `diamond-preflip-remaining` are the authoritative record.
> - **Phase C auth = TRUE httpOnly** (`cfc1297`): all Supabase access moved SERVER-SIDE behind a Next
>   route handler (`src/app/api/[...path]/route.ts` → `supabase-router.ts` with an injected
>   `@supabase/ssr` server client, `cookieOptions.httpOnly:true`). Browser holds NO token — **audit
>   C-2 genuinely CLOSED** (verified: `sb-*` cookie invisible to `document.cookie`, app works, logout
>   server-revoked). `supabase.ts` browser client REMOVED; `client.ts` real mode = same-origin
>   `fetch('/api/*')`; `auth-store` real hydrate = `GET /api/me` (skipAuthRedirect). Mock mode
>   byte-identical (MSW; the route handler 404s in mock).
> - **Phase D RLS validated 15/15** (per-role read-scope + write-deny escalation + BL cross-branch deny
>   + KO-3/4/5/6) via a Node per-role JWT harness. **Observability 0008 APPLIED + verified** (login
>   audit + error_log write end-to-end).
> - **Read-parity DONE — 6/6 VALUE-PARITY clean, RUN VALID** (harness `C:\Users\aicod\Projects\_qa\
>   gospel-central-parity\`, run `run-20260707-final`). Adapter is faithful (no type-coercion / null /
>   camel-snake bugs). It caught + we FIXED: (a) **`users.locationId` NULL on real** — a church-feature
>   flip-blocker (empty per-church KPIs); backfilled 129 users (75 NN + 54 VB); (b) blocked-slot
>   `HH:mm:ss`→`HH:mm` normalize (`c05099b`).
> - **Write-parity DONE — 2026-07-09** (`_qa/gospel-central-parity/write-harness/`,
>   run-write-20260709000850). 3 sequential UI-driven passes (Core-5 writes: create-contact,
>   edit-stage, create-booking, complete-booking, create-user), RUN VALID, byte-identical across
>   passes, self-cleaning (DB back to 132/67/105). **4/5 round-trip clean** (incl. create-user →
>   the shown temp password logs in 200, wrong pw 401). **FOUND A HIGH FLIP-BLOCKER:** every UPDATE
>   to `bookings` 400s with `invalid input value for enum booking_status: ""` — complete/cancel/
>   restore/reschedule/edit ALL dead on real (INSERT ok). Root cause = `booking_completion_sideeffect()`
>   (0002) `coalesce(old.status,'')` casting '' to the enum. **FIX `fd72edf` = migration
>   `0009_fix_booking_completion_enum.sql` (UNAPPLIED — needs the `sbp_` PAT, then re-run the sweep).**
> - **Write-path gaps ALL resolved:** create-user showed a FAKE client-generated password that was never
>   sent (real login-breaker) → FIXED `c50f85a`; convert-contact temp password → FIXED `7b62ce3`;
>   `set_contact_teacher` + cascade deactivate/restore → VERIFIED on real (guarded, net-zero).
> - **REMAINING before the prod flip:** (0) **[NEW, HIGH] apply migration `0009` + re-run the write
>   sweep** — booking mutations are dead on real until the trigger fix lands (needs the `sbp_` PAT);
>   (1) **CSP** defense-in-depth — do CAREFULLY (test every page +
>   all 16 themes; a strict CSP can break framer-motion + WebGL backgrounds); (2) **iOS-Safari plain-link
>   — PARKED** (user's real iPhone); (3) **the flip itself** — merge `feat/supabase-cutover` → `main`
>   (fold in `ebc0e24`), set PROD Vercel env `NEXT_PUBLIC_MOCK_API=false` + Supabase keys, redeploy,
>   verify. User-gated. `origin/main` still = `ebc0e24` (mock). Re-derive HEAD live (shared checkout).

> **RENAME (2026-06-27): the app is now "Gospel Central".** GitHub repo `aicodeproxima/gospel-central` (was `Diamond`; old path redirects), Vercel project `gospel-central`, prod URL **`gospel-central.vercel.app`** (legacy `diamond-delta-eight.vercel.app` still resolves). Internal storage keys were renamed `diamond-*` → `gospel-central-*` WITH migration; the proxy still accepts the legacy `diamond-session` cookie. The local worktree dir `C:\Users\aicod\Diamond`, historical/QA docs, and this file's siblings named `*diamond*`/`MOBILE_AUDIT_PROGRESS.md` keep the old name (records). **Do NOT re-introduce "Diamond" as the app's display name.**

> **🔀 PROJECT PIVOTED TO SOLO + SUPABASE BACKEND (2026-07-06).** Michael/"Mike" is OFF the project; the
> backend is now OURS, built on **Supabase** (project `imjsdsepmhgazracegog`). This SUPERSEDES every
> "Mike's Go backend / don't touch `gospel-experience` / needs Mike coordination / backend gaps are
> Mike's job" statement anywhere in this file, CLAUDE.md, or the docs. Memory:
> `diamond-solo-supabase-backend` + `reference_supabase_gospel_central` (creds).
>
> **✅ BACKEND LIVE + VALIDATED (Supabase).** `supabase/migrations/0001–0007` applied via the Management
> API (a `sbp_` PAT): 10 snake_case tables, 12 enums, **RLS on ALL tables**, org-tree scope functions
> (descendant closure over `users.parent_id`; the Decision-10 READ-all / WRITE-own-branch split), ~13
> triggers (booking-conflict guard w/ America/New_York tz, generic audit-emission, contact completion
> side-effects), ~18 SECURITY-DEFINER RPCs. Seeded 132 users / 2 areas / 15 rooms / 67 contacts / 105
> bookings (current-week dates so the calendar isn't empty). **All seed users log in by EMAIL
> `<username>@diamond.org` / `gospelseed1`.** **11/11 role-simulation validation passed.** The
> **KO-3/4/5/6 authz gaps are now CLOSED by RLS** (member `/metrics`→403, member sees only own+assigned
> contacts, audit `relatedTo` viewer-enforced) — no longer deferred, no longer "Mike's job".
>
> **✅ FRONTEND CUTOVER — PHASE B DONE + VERIFIED (reads + writes).** Branch **`feat/supabase-cutover`**
> (pushed; NOT on main). `src/lib/api/supabase.ts` (browser client + deep camel/snake + P0001→ApiError
> map) + `src/lib/api/supabase-router.ts` (every REST `api.*` call → supabase-js query/RPC, returns
> camelCase so UI is unchanged), dispatched from `src/lib/api/client.ts` `request()` when
> `NEXT_PUBLIC_MOCK_API!=='true'` (dynamic import — supabase-js only loads in real mode). **Verified
> in-browser** on preview `gospel-central-b7us0erk7-…vercel.app`: login (username→email shim), RLS
> scoping (admin 67 contacts / member1 1 / member has no Reports+Admin nav), create + soft-delete
> contact. Branch-scoped Vercel env (`MOCK_API=false` + `SUPABASE_URL`/`ANON_KEY` on the
> feat/supabase-cutover **preview only**) keeps prod + all other previews on the mock.
>
> **✅ (C) AUTH CUTOVER — DONE + PREVIEW-VERIFIED (`cf6ed94`, 2026-07-06).** `@supabase/ssr`
>   cookie sessions: `supabase.ts` → `createBrowserClient` (session in `sb-*` cookies, NOT localStorage);
>   `auth-store.ts` mode-split (mock path unchanged; real path = no token persistence, no
>   `gospel-central-session` mirror, hydrate = getSession + cached-profile + `/me` refresh,
>   onAuthStateChange, signOut on logout); `proxy.ts` real-mode gate = `createServerClient` +
>   `getUser()` (validates + refreshes, was presence-only). VERIFIED on preview `dnlvmb67d`
>   (chrome-devtools): login admin/gospelseed1 → dashboard @cf6ed94; ONLY `sb-…-auth-token` cookie
>   (no legacy cookies, no ls token); hard-reload holds; Sign Out clears all; signed-out /dashboard
>   → 307 `/login?next=`; wrong pw → "Invalid credentials". **NOT httpOnly** (impossible with the
>   browser-side data plane — supabase cookies are JS-set; C-2 is REDUCED [no ls token/hand-rolled
>   mirror], fully closing it = server-proxying the data plane, a separate decision).
>   **⚠️ Migration `0008_auth_observability.sql` (login audit mirror RPC + error_log table) is
>   COMMITTED but NOT APPLIED — needs the `sbp_` PAT** (`SB_PAT=… node scripts/sbq.mjs --file
>   supabase/migrations/0008_auth_observability.sql --tx`). Frontend degrades gracefully (RPC 404
>   swallowed; error-log POST no-ops) until applied. ALSO FIXED: Phase B had broken
>   client-errors.test.ts 5/5 (vitest is env-less → dispatch went to the unconfigured supabase
>   router); client.ts now reads NEXT_PUBLIC_MOCK_API lazily + the test stubs it. Suite 535/7 todo.
>
> **⏳ REMAINING (recommended order) — see `~/.claude/plans/front-end-and-back-spicy-moth.md` (3AgentScan
> REVISE + anti-corruption measures) + `docs/SUPABASE_BACKEND_PLAN.md`:**
> - **(D) Validation gate before flipping the PROD flag:** reuse the persisted UI-audit harness
>   (`C:\Users\aicod\Projects\_qa\gospel-central-audit\harness\`) for per-role RLS + read-parity + KO
>   re-probes + start/end fingerprints; bait self-test; ledger-rendered go/no-go.
> - **Write-path gaps** (router spec flags, functional but rough): temp-password surfacing on
>   create-user/convert/reset; a `set_contact_teacher` path is wired (0007) but untested in UI; cascade
>   deactivate; the mock's exact list-filter parity (soft-deleted contacts fix already landed).
>
> **PROD MOVED (still mock-on) — `origin/main` = `ebc0e24`** (2026-07-06: a CONCURRENT session's
> booking-time-display fix — "end-time click sets the END, not an extra 30-min block", touching
> `WhenStep.tsx`/`availability.ts`/`BookingWizard.tsx` — atop the completed 8-phase overhaul `5e6f30f`;
> still mock backend. History below is the UI record). **NONE of the Supabase work is on `main`.**
> `feat/supabase-cutover` (8 commits ahead, tip `5bb6734`) branched at `5e6f30f` and does NOT contain
> `ebc0e24` — fold it in when the cutover eventually lands on main (clean: their files vs my api layer
> don't overlap). Re-derive `origin/main` live before any main-targeting action — this checkout is a
> shared moving target. ~~The backend migrations are ALSO committed on `feat/mobile-opt-main` (push
> guard-blocked). NEVER push feat/mobile-opt-main / feat/admin-system (bash-guard hook).~~
> **[2026-07-17: both branches retired+archived; the hook rules are gone — see LATEST.]** **Rotate
> the `sbp_` PAT + `sb_secret` key** — used this session; user said they'd rotate later. The MSW mock
> stays PERMANENT dev/test/demo infra (CLAUDE.md), NOT removed by the cutover.
>
> **MOCK-ERA OPEN ITEMS (now LOW priority — the mock is the dev/demo layer; the real backend is Supabase):**
> 1. `dc549c7` (the `u-michael` booking-audit-actor fix, `task_fd3f9baa`, on its own worktree branch, not
>    on main) is a **mock** fix — only relevant if polishing the mock. The Supabase audit trigger already
>    attributes every row to `auth.uid()` correctly, so this is moot for the real backend.
> 2. ~~**Feedback form** is toast-only (Resend delivery deferred)~~ — **CLOSED 2026-07-18 (`27ab8db`).**
>    Real delivery via `src/app/api/feedback/route.ts`, a Next route deliberately ABSENT from the MSW
>    handlers (prod runs the mock, so an MSW handler would answer in-page and reach nobody). Writes to
>    `public.feedback` (migration 0016) + Resend REST. Works in BOTH mock and Supabase mode and survives
>    the flip untouched. ~~Email is dark until `RESEND_API_KEY` + `FEEDBACK_TO_EMAIL` are set in Vercel~~
>    — **email is LIVE as of 2026-07-19** (all 5 Production env rows set; `last_event: delivered` confirmed
>    end-to-end from a real Member account). Email-body honesty fixed in `7910a06`. See LATEST.
> 3. ~~Backend-authz gaps (Mike's Go-backend job)~~ → **CLOSED.** The KO-3/4/5/6 gaps `docs/BACKEND_GAPS.md`
>    documented (contacts CRUD ungated; `/contacts`,`/audit-log`,`/metrics/teachers` unscoped; `relatedTo`
>    caller-honored) are now ENFORCED by Supabase RLS + RPCs (validated 11/11). `BACKEND_GAPS.md` /
>    `MIKE_HANDOFF.md` now read as the CONTRACT WE BUILT TO, not a handoff to anyone.
>
> **DURABLE LESSON (this overhaul):** run the **full `npm run e2e` per phase, not just vitest** — a rename
> or a UI-add can pass every unit test yet break an e2e selector or the mobile 44px tap floor. The Phase-7
> `default`→`basic` rename and the Alerts "View all" link both did exactly that; only the capstone e2e
> caught them.
>
> **Reference (plan + protocol, still authoritative if reopening any surface):**
> `C:\Users\aicod\.claude\plans\structured-scribbling-steele.md` (13 decisions, phase specs, rules 1–15,
> the model-routing/delegation protocol D1–D8). **Progress ledger:** `OVERHAUL_PROGRESS.md` (repo root,
> untracked, append-only — per-phase tier records). Trust `git` + prod `/version.json` over any SHA here.
>
> **DONE + DEPLOYED (verify prod SHA vs `git rev-parse origin/main`, don't trust this list blindly):**
> - **Phase 0** foundation: 6-status contact model, booking outcome statuses w/ status-gated metrics
>   (PATCH /bookings/:id/status; side-effects on the →completed edge; auto-promotion first_study→
>   unbaptized @2 completed), 35-study curriculum (`src/lib/curriculum.ts`), User.gender, Combobox/
>   Select dropdown fixes, i18n en/es parity test.
> - **Phase 1** seed = 2 churches (NN 75 / VB 54; Joseph + Simon Peter BLs; ex-BLs = VB TLs keeping
>   branch2/3/4 logins; all 6 statuses in BOTH churches; persona manifest `docs/qa/stable-personas.md`).
> - **Phase 2** dashboard: church toggle + set-default (`dashboardChurchId` pref), Completed-only
>   month KPIs, Your Group = DIRECT relationships only (directReports; members see team-mates;
>   GL+-gated CSV/TXT member export via `canExportMemberList`), leaderboards. Refinements: fruit
>   board = top 10 by count, LAST 30 DAYS, APP-WIDE (no hierarchy/church scoping), ties earliest-
>   first; Baptisms KPI = current MONTH (church-scoped). Seeded baptisms are 2024-dated → prod
>   correctly shows 0 baptisms/empty fruit board until real in-window fruit.
> - Calendar legend: "Baptized Persecuted" removed.
> - **Phase 3** calendar (deployed `bb92f07`): BookingCard = teacher-gender bg (blue/pink) + baptism
>   top-border (contact LIVE stage) + C./T.("L.")/activity/time/status lines; Day/Week/Month/Agenda/
>   SearchBar re-keyed (calendar is BOOKING_TYPE_CONFIG-free); legend = 8 chips (2 genders + 2
>   borders + 4 statuses); confirm-step status controls gated canSetBookingStatus (verified on prod:
>   member negative + admin No-Show transition e2e); gender editable (Settings + EditUserDialog,
>   handler 400-guard); Day+Week header/body = ONE grid + subgrid rows (0px stagger at hostile
>   widths); `bookingStatusI18nKey()` helper.
> - **Phase 4** wizard (deployed `2e15dfd`; ledger has the full ultracode-gate record): NEW
>   WhenStep.tsx (Compact Time Range asset) + activity picker folded onto the always-first When
>   page; steps = when→room→leader→contact→subject→confirm (study, 6) / 4 non-study; duration
>   selector GONE (derives from the picked start→end range); slot-click prefills day+START only;
>   self-conflict fix (getDaySlots excludeBookingId) — teacher-only edit VERIFIED saving on prod;
>   baptized in-person now stores BAPTIZED_IN_PERSON; room step range-gates rooms, leader step
>   busy-gates teachers; NEW server TEACHER_CONFLICT 409 (POST+PUT — cross-area teacher
>   double-booking had NO catching layer); getDaySlots frees cancelled windows; formComplete gate
>   on Create/Save; cancel-overlay stale-state fix; step-badge/X overlap fixed; e2e/booking.spec
>   rewritten (7 tests) + wizard-when visual baselines (1440/412/275) COMMITTED. Suite 440/7 todo.
>   The user's own commit `1e2db93` (Settings toggle-to-revert swatches) rode this deploy train.
>
> - **Phase 5** contacts (deployed `0cd6905`; full ultracode-refuter record in the ledger):
>   Decision-10 permissions — members edit/delete OWN CREATIONS only (assigned-teacher = view-only),
>   TL+ write MANAGEABLE scope (creator OR teacher; BL own-branch; Overseer/Dev all); new
>   canDeleteContact + canManageRetention (GL+); page/admin write gates use buildManageableScope;
>   bulk stage/delete + kanban drag gate per row; Decision-13 export = GL+ (canExportMemberList).
>   Prefix search (text-match.ts prefixMatch + HighlightedText) with matched-letter highlighting +
>   scoped-field dropdown + leader-name filters; ContactCard rebuilt from crm-compact-grid asset;
>   ContactDetailDialog = main-branch purple + derived GL/TL + 6-status badges + 35-study
>   Foundation/Growth checklist (click-toggle, edit-gated) + retention section; convert stamps
>   retainUntil (+6mo), GET flags retentionExpired. **CRITICAL refuter fix (verified on prod):** the
>   `?edit=<id>` deep-link opened the ungated ContactForm for ANY contact — now gated on canEditAny
>   + a defensive `canEdit` prop on ContactForm; assigned-teacher options scoped to manageable ∪
>   self. Suite 459/7 todo; e2e chromium 51 + mobile 14.
>
> - **Phase 6 G1+G2** groups (deployed `2758eab`; verified on prod): List view is now the DEFAULT +
>   first in the toggle (`groupsDefaultView` pref, default 'list', one-time legacy-localStorage
>   migration); Search/Jump auto-EXPAND the found person (`expandPath`); clickable Student-Pipeline
>   sections (6 statuses + Primary Curriculum Foundation-complete/In-Growth + Study Milestones 1-4/5-10
>   + Baptism Readiness) and Teacher-Metrics cells → shared `ContactListPopup` → existing
>   ContactDetailDialog; "Baptized Since Studying" is now n/m; org-metrics gained totalMembers +
>   totalContacts; teacher-header/toolbar overlap fixed. **Semantic correction (user, 2026-07-04):** a
>   contact's "Branches" = up-to-3 PREACHING PARTNERS (`preachingPartnerIds`), NOT church — Branch
>   search + All-Branches filter now match partner names; church stays under All fields (in CLAUDE.md).
>   Suite 473/7 todo.
> - **ContactCard "Branches" = preaching partners on the cards** (deployed `c282893`): my Phase-5
>   ContactCard had shipped `contact.groupName` (the church/LOCATION) under "Branches"; correct display
>   is `resolvePartnerNames(users, contact).slice(0,3)` with partner[0] purple (main branch). VERIFIED
>   on prod (Aaron -> Patrobas[purple], Agabus, Simeon Niger; no church names). NOTE: the card resolves
>   partners via the `users` list ONLY -> free-text / custom-entity partners won't render on the card
>   (the detail dialog + contacts search index resolve those too); fine for seed data (all real users).
>
> **LEDGER NOTE:** `OVERHAUL_PROGRESS.md` (untracked-local) was LOST in a branch switch this session and
> **reconstructed from `git log`** — it's a table of the deployed phase SHAs + the full Phase-6 G1+G2
> entry. git is the true record; per-phase pre-6 detail lives in the commit messages.
>
> **DROPDOWN WORK — the full story (was mislabeled "do-not-touch WIP"; user asked me to fix + ship it):**
> A prior team's dropdown/alignment work sat UNCOMMITTED in the working tree and the user believed it
> was on prod. FORENSICS (this session): it was NEVER committed to ANY branch / stash / dangling commit
> (searched `git log --all -S floating-portal-zoom` = empty) — those agents verified against
> `localhost:3000` (proven by their console logs in `Assets/Kimi Assets/.playwright-mcp`), so it worked
> locally but the commit+push never happened. NOTHING was lost.
> - **ContactCard partners fix: SHIPPED** (`c282893`, on prod — see DONE list above).
> - **The base-ui portal counter-zoom was BROKEN and is being replaced.** ROOT CAUSE (verified by live
>   DOM injection on prod + a built localhost repro): `:root{zoom:0.9}` at ≥1280 + a
>   `zoom:1.1111` (`--floating-portal-zoom`) on the base-ui **Portal** wrapper. The Portal wraps
>   base-ui's `Positioner`, whose fixed/absolute coords the CSS `zoom` then SCALES — throwing Select/
>   Popover/DropdownMenu popups off their anchor (EditUserDialog Role options rendered at y -329,
>   entirely off-screen top; E4 e2e timed out). Below 1280 (zoom 1) it was fine; prod (no counter-zoom)
>   positions correctly. **FIX (in working tree, NOT yet committed at this pause):** removed the
>   `style={{ zoom }}` from all 3 base-ui portals (select/popover/dropdown-menu) + deleted the orphaned
>   `--floating-portal-zoom` var from globals.css. popover.tsx & dropdown-menu.tsx are now BYTE-IDENTICAL
>   to prod; select.tsx keeps only `align:"start"`. VERIFIED on built localhost @1440×676 (the broken
>   dims): Role options now y 310–436, all on-screen, click selects "Branch Leader". Considered
>   moving the zoom to the Popup instead (keeps 100% size) but rejected it — it inflates width 11% and
>   risks bottom-overflow via `max-h-(--available-height)`; removal is the clean, prod-proven, no-side-
>   effect fix. Dropdowns render at 90% (uniform with the whole zoomed app).
> - **KEPT (genuine improvements, still in tree, shipping WITH the fix):** BookingSearchBar's OWN-portal
>   `/rootZoom` positioning + keyboard-nav hardening; Combobox padding; PredictiveInput app-rendered-
>   suggestions rewrite; StepSubjectPicker suggestion-select; select.tsx `align:"start"`.
> - **[RESOLVED — shipped `2617fa9`/`8d3376c`; historical narrative only, NOT a resume point]:** e2e chromium 50 pass + **E4 NOW PASSES**; the ONLY red is
>   the `wizard-when-desktop.png` VISUAL baseline (6% diff) — the diff image is a uniform sub-pixel
>   SHIFT of the whole When dialog (content intact, not a broken layout — a zoom:0.9 re-baseline, not a
>   regression). NEXT STEPS: regen visual baselines (`npx playwright test e2e/visual.spec.ts
>   --project=chromium --update-snapshots`) → re-run visual+mobile green → commit the dropdown fix by
>   EXPLICIT path (globals.css, ui/{select,popover,dropdown-menu}.tsx, shared/{Combobox,PredictiveInput,
>   StepSubjectPicker}.tsx, calendar/BookingSearchBar.tsx — NOT `tmp/` or the qa/propagation*.json
>   artifacts) → deploy → prod-verify dropdowns at ≥1280 across Select/Popover/DropdownMenu/Combobox/
>   PredictiveInput/BookingSearchBar. Then update ledger.
>
> **PHASE 6 COMPLETE — G3 SHIPPED + PROD-VERIFIED** (`83b9fd5` node design, `e8776a4` counter-zoom
> re-fix + baselines; deployed, HEAD==origin/main==prod). Asset gate resolved by USER APPROVAL to derive
> the node design from the plan text + Decision-12 (no asset files existed). Branch Rail cards for all
> roles in BOTH views via new `src/components/groups/node-colors.ts` (role rail HEX + a HEX map paralleling
> PIPELINE_STAGE_CONFIG + derived BL variant); leaders carry totals strips ("N members · N contacts") +
> metric icons; contact leaves colored by 6-status + render under ANY role; connectors behind nodes via
> scene render order (NEVER CSS z-index in drei Html); tightened gap constants + collision tests; +15-contact
> & overseer-with-contact personas. Opus TL prototype → 3× opus judge panel → sonnet role conversion (its
> mandatory fixes: WCAG-safe labels, overseer totals, ≥44px metric hit-area). Suite 478/7 todo. **VERIFIED
> ON PROD `e8776a4`:** /groups list-first; expand-all → all 5 roles + contacts-under-any-role; totals strips
> render; status colors correct (Elisha red/Needs-Help, Repentant-Thief green/Baptized, Jacob
> yellow/Potential, Barak grey/First-Study); E4 dropdown surface clean (`select-portal` no zoom, Role
> options on-screen). **NOTE:** G3 had RE-INTRODUCED the base-ui portal counter-zoom (twice-killed now);
> `e8776a4` removed it again + baked a guardrail comment into globals.css:903 — do NOT reintroduce it.
> NOT re-verified on prod: 3D view (WebGL GPU caution — list view covers the same OrgNode DOM); the
> concurrent session verified 3D + es-275px on a deployed preview (identical code+seed).
>
> **PHASE 7 COMPLETE — SETTINGS SHIPPED + PROD-VERIFIED** (`3b70cba` foundation + `a96eb10` Alerts UI +
> `b552f11` mobile-nav fix; deployed, HEAD==origin/main==prod `b552f11`). Fable-orchestrated (v4 migration +
> relatedUserIds finish inline; haiku audit-site enumeration; sonnet Alerts UI). Shipped:
> - **v4 prefs migration (NON-DELEGABLE):** ColorTheme `'default'`→`'basic'` (attribute-less DOM behavior
>   preserved), new-user default + one-time FORCE = Marble for every pre-v4 blob (Decision 8), `migrate()`
>   extracted to exported `migratePreferences()` w/ 7 blob unit tests (incl. a refuter-found fix: sanitize a
>   removed literal left in `previousColorTheme`). **PROVEN ON PROD** against a real returning session:
>   persisted blob migrated to `version:4`, `colorTheme:'marble'`, `data-theme=marble`.
> - **relatedUserIds audit plumbing:** optional field on AuditLogEntry + a `pushAudit()` choke point whose
>   input type makes it compile-time REQUIRED (omission-proofing); all 40 handler sites converted (each
>   deriving affected users) + seed + a producer-coverage test. GET /audit-log gained a `relatedTo` filter +
>   API param — the data path the Alerts feed uses. (NOTE: the sonnet plumbing agent collided with a stray
>   delegated agent on handlers.ts and died mid-run; Fable finished the last 14 sites inline. 3 booking
>   handlers still hard-code the actor as `'u-michael'` — pre-existing, flagged as a separate task, untouched.)
> - **Alerts feature:** new `/alerts` per-user feed (relatedTo-scoped, toggle-filtered, day-grouped, mark-seen
>   on load), `src/lib/utils/alerts.ts` + `use-alerts` hook (refetch on nav so the badge stays live), red
>   unseen badge on Sidebar + MobileNav, Settings Notifications card → Alerts + "View all" link. Feedback
>   card added (toast-only; Resend + a `/feedback` audit row DEFERRED). i18n en+es (parity green).
> - **FULL visual baseline set regenerated** (10 snapshots — Marble changes every page).
> - Suite **504/7 todo**; tsc + build clean. **VERIFIED ON PROD `b552f11`:** Marble default (fresh + migrated
>   sessions), Alerts nav badge shows unseen count → /alerts feed renders → badge CLEARS on visit; feedback
>   form + renamed card present; theme picker = Marble/Basic/Ocean (no "Default"); mobile 275px 7-item BL+ nav
>   fits unclipped, no pan. NOT run: local full e2e (skipped at user direction — browser-truth verified on
>   prod instead); real iOS Safari (standing rule).
>
> **PHASE 8 — Reports/Admin: COMPLETE + prod-verified. OVERHAUL PHASES 0–8 ALL SHIPPED (HEAD `8fc051d`).**
> - ✅ **Decision 13 GL+ export floor** (`320b7ad`, security): `canExportImport` had no GL+ floor → a Member/TL
>   whose group's `exportImportEnabled` override was on could export. Added the floor; matrix flipped + PERMISSIONS.md.
> - ✅ **Audit-export timestamps: ALREADY RESOLVED** (reproduce-first) — `exportAuditCSV` timestamps every row.
> - ✅ **BookingType close-out** (`2c3c83a`): deleted orphaned `utils/colors.ts`. `BOOKING_TYPE_CONFIG` kept.
> - ✅ **exceljs multi-sheet export** (`9a8c992`): dynamic-imported `exceljs@4.4.0`; pure `buildReportWorkbook`
>   (4 styled sheets) + "Export .xlsx" on /reports. 15 tests.
> - ✅ **Teacher/member performance reports** (`9a8c992`): pure `performance-metrics.ts` + `PerformanceReports`
>   in a /reports "Performance" tab (anomaly flags). 15 tests. Both sonnet-built (disjoint files), Fable-wired.
> - ✅ **Final capstone ultracode gate** (`b5bf52f`+`8fc051d`): 3-lens adversarial audit (8/10 confirmed) →
>   fixed 4 real Phase-7/8 defects (xlsx enum labels, no-show window no-op, over-broad alert toggle, CSV
>   timestamp guard); documented the 4 KNOWN backend-authz gaps (Mike's — NOT fixed in the mock). **Full e2e
>   58/2-skip/0-fail** — it caught + I fixed a 44px tap-target regression (Alerts "View all" link) and a stale
>   S3 theme e2e (post-rename). Suite **535/7 todo**.
> **CARRY-FORWARD (optional, non-blocking):** feedback `/feedback` audit-row + Resend wiring (Phase-7 deferred);
> the 3 hard-coded `'u-michael'` booking audit actors — concurrent task `task_fd3f9baa` (isolated worktree) is
> fixing these in handlers.ts, WILL NEED MERGING; the documented backend-authz gaps await Mike's Go cutover.
> **LESSON (durable): run the FULL e2e per phase, not just vitest** — a rename or UI-add can pass unit tests
> yet break an e2e selector or the mobile 44px tap floor (both happened this session, caught only at the
> capstone e2e).
>
> **Phase 6 G1/G2 detail below (ROUTING REFERENCE — G1/G2 are DONE; kept for G3 + context): G1 quick wins** (list-view
> first in the nav toggle + `groupsDefaultView` pref migrating localStorage `gospel-central-tree-view`
> once; teacher-performance header vs toolbar overlap at ~640–900px; re-verify the Phase-0
> contact-delete + Groups-icon commit across tree AND list views) → sonnet. **G2** (starts AFTER
> Phase 5 — popups reuse the now-redesigned ContactDetailDialog): StudentPipeline re-key to 6
> statuses + clickable pipelines w/ contact-list popups (Primary Curriculum ×2 / studies 1–4 /
> studies 5–10 / baptism-readiness), TeacherMetrics "1/5" count + clickable icons → shared popup,
> org-metrics.ts member+contact totals per TL+ leader (D1 MUST say: totalSessions is already
> Completed-gated — extend from contact fields, never recompute from raw bookings), org search
> auto-expand → sonnet. **G3** node redesign PROTOTYPE-FIRST: Branch Rail assets for
> Overseer/GL/TL/Member/Contact + derived BL variant (Decision 12) → ONE role opus, then Fable
> in-browser + ultracode judge, then sonnet converts the rest; tree-layout gap constants + collision
> tests + connector z-order (scene layer, NEVER CSS z-index in Html) + contacts-under-ANY-role
> (buildOrgTree; seed a 15-contact persona; org-tree.test case) → **Fable inline (R3 scene-core)**.
> Gate: Fable browser at 3 widths. **CRITICAL /groups gotcha: keep chrome-devtools/Chrome MCP OFF
> repeated /groups reloads — 2 WebGL contexts exhaust the GPU pool browser-wide → node cards stop
> mounting; recover via a separate Chrome process. Use Playwright DOM .click() on WebGL, not
> browser_click (drag-start).**
> Operational gotchas (carry): run `node scripts/generate-version.mjs` before local e2e (UpdateBanner
> overlay intercepts topbar clicks on version mismatch, and it caused a false e2e failure this
> session); prod /version.json is PRETTY-PRINTED (multi-line — don't single-line-grep it; parse with
> python json); stale chrome-devtools-MCP Chrome can hold the profile lock across sessions (kill only
> PIDs whose CommandLine matches chrome-devtools-mcp\chrome-profile); MSW is SW-free/in-browser so a
> Node fetch to `/api/*` returns the HTML shell, not JSON — probe via an in-page evaluate, never node;
> React controlled inputs ignore synthetic `.value=`+input events in devtools — use the native value
> setter or a fresh `?q=` URL load to test filters; the two `docs/qa/propagation*.json` files are
> per-run artifacts — never commit them.
>
> **Session-2 operational notes:** DESKTOP FREEZE LIFTED (verify 3 widths: ≥1280 / 412×915 /
> 275×596@5.24). Frontend-to-main deploys are user-authorized but the permission classifier demands
> a fresh in-chat "yes" EACH session — ask once, then proceed. Deploy flow: commit on
> feat/mobile-opt-main → checkout main → merge --ff-only → `git push origin main` ON ITS OWN LINE
> (bash-guard H4 false-positives on chained pushes) → checkout back → poll /version.json for the
> SHA. If the poll times out, run `npx vercel ls gospel-central --scope aicodeproximas-projects` —
> the GitHub→Vercel webhook has silently DROPPED a push before (fix: empty retrigger commit).
> Local `npm run build` rewrites src/lib/version.ts → `git checkout -- src/lib/version.ts` before
> committing. WebKit e2e project: pre-existing Secure-cookie-on-http blocker (chip task_17530de7);
> gate on chromium+mobile+visual. base-ui Selects need REAL pointer clicks in automation (synthetic
> .click() no-ops). Suite at session end: 424 pass / 7 todo; branch ~60 commits ahead of its origin
> counterpart (intentional — prod = origin/main).

> **MULTI-MODEL ORCHESTRATION — HOW IT ACTUALLY RUNS (operational card; full protocol = the plan's
> "Model routing & delegation protocol" section, which WINS on any conflict):**
> - **Session prerequisite:** the MAIN LOOP must be **Fable 5 with ultracode on** (user sets via
>   /model; the orchestrator cannot switch its own model mid-session). If you cold-start on a lower
>   model, tell the user before doing overhaul work — the whole routing design assumes the smartest
>   model holds full context and reviews everything.
> - **Dispatch mechanics:** cheaper tiers run as SUBAGENTS via the Agent tool's `model` param or
>   Workflow `agent(prompt, {model, effort})` — valid values `fable` / `opus` / `sonnet` / `haiku`.
>   KNOWN GOTCHA: subagents cannot see these params on their own tool surface — a subagent auditing
>   the harness will confidently (and wrongly) report they don't exist; it happened, it was refuted
>   with run metadata. Don't let an agent talk you out of the routing table.
> - **Who does what:** Fable inline = permissions/matrix/PERMISSIONS.md, persisted-store shapes &
>   migrations, seed identities, ANY package.json dependency add, all git/deploys, ledger/passdown,
>   all diff reviews + browser verification, and anything ≤2 files/<50 lines (D8 — dispatch overhead
>   beats savings on trivia). sonnet = spec'd volume implementation (one ≤3-file cluster per agent,
>   disjoint files across parallel agents). opus = the genuinely hard components (per routing table).
>   haiku = READ-ONLY enumeration; its reports get re-grepped before anyone edits from them.
> - **The gate every delegated edit passes (D3), in order:** agent returns → `git status` (no
>   unexpected index/HEAD movement; agents NEVER commit) → hunk-by-hunk `git diff` review → tsc +
>   FULL vitest → if any `e2e/**` file was touched, RUN the touched spec (e2e is invisible to
>   vitest) → if `src/lib/i18n.ts` was touched, the en/es parity test must be in the run. Failed
>   gate = fix inline or re-dispatch WITH the failure text; never accept an agent's own "it's green".
> - **No agent→agent handoffs (D5):** sequential work routes through the orchestrator, which
>   re-verifies outputs against the repo first. Before ANY dispatch, re-read that item's ROW in the
>   plan's routing table (D6) — never dispatch from memory of it.
> - **Ultracode (Fable + Workflow fan-outs)** is reserved for: the 4 marked phase gates (Phase 4
>   booking-regression, Phase 5 permission-bypass refuters, Phase 6-G3 prototype judge, Phase 8
>   close-out audit) and plan→grill→decide on real design forks. Two precedents shipped this
>   session: the 2-church seed design (3 designers → 3 adversarial grills → judge, 7 agents) and
>   the routing-protocol grill itself (opus risk lens + sonnet economy lens; 7 risk fixes applied,
>   1 economy claim refuted). Phase 2 ran fully under this protocol — the per-item tier record is
>   in the ledger and each phase MUST append one (D6).

> This is the action-oriented handoff. `HANDOFF.md` is the authoritative packet (Mike + new devs); `MOBILE_AUDIT_PROGRESS.md` is the durable historical ledger. Where any doc disagrees with code, **code wins** (`src/lib/api/*`, `src/mocks/handlers.ts`). Trust `git` + live browser over any SHA/claim written here.

---

## 0. FIRST 60 SECONDS (re-anchor ritual — before ANY edit)
```
cd C:\Users\aicod\Projects\_src\diamond-live   # the ONLY correct repo. NOT C:\Users\aicod\Diamond (older worktree, do not edit)
git fetch --all --prune
git branch --show-current        # expect: feat/mobile-opt-main
git rev-parse --short HEAD       # ground truth — trust THIS, not any SHA in a doc (was 9d49f62 at handoff)
git log --oneline -8
git status --short               # expect clean (only untracked scratch: "Background Ideas/", "Diamond Quotes.txt", "Organization Tree Ideas/")
```
**Anti-hallucination (in force):** re-Read the real file region before every edit; grep helpers/constants before reuse; label status **VERIFIED** (cite screenshot/DOM/tool output) or **EXPECTED** (untested); "fixed" needs observed browser behavior on prod, not a clean diff; if memory disagrees with git/screenshots, trust the evidence.

---

## 1. IDENTITY, BRANCH & DEPLOY
- **App:** Gospel Central — Bible-study room-booking + discipleship/org-management (church). **Frontend-only**; mock backend is PERMANENT (Mike's Go backend `gospel-experience` is the planned flag-flip cutover, NOT a code removal).
- **Repo:** `C:\Users\aicod\Projects\_src\diamond-live`, GitHub `aicodeproxima/gospel-central`. **Branch `feat/mobile-opt-main`** is the work branch; `main` is prod.
- **Hosting:** Vercel project `gospel-central` (team `aicodeproximas-projects`, **Project ID `prj_3kVmKXbbTlGBZGsXn3np062CtxAY`**), **git-connected** — pushing `main` auto-builds Production (~40–90s) and repoints the prod alias. Prod domains: **`gospel-central.vercel.app`** (primary) + `diamond-delta-eight.vercel.app` (legacy, still live). No `vercel --prod` CLI deploy.
- **FRONTEND-to-main is AUTHORIZED** (user, 2026-06-18; standing authorization 2026-06-25). "The whole front end is ours to change." **Mike owns the BACKEND only** — coordinate backend, don't push backend changes.
- **DEPLOY FLOW (what actually works):** commit on `feat/mobile-opt-main`, then:
  ```
  git checkout main
  git merge --ff-only feat/mobile-opt-main
  git push origin main            # RUN UNCHAINED — alone, while ON main
  git checkout feat/mobile-opt-main
  ```
  Then verify: poll `curl -s https://gospel-central.vercel.app/version.json` until `.commit` == the pushed SHA (the version manifest == deployed commit — see §3).
- **DEPLOY GOTCHAS:** (a) the `~/.claude/hooks/bash-guard.ps1` H4 rule false-positives when `git push origin main` is CHAINED in one command with anything containing `feat/mobile-opt-main` (greedy regex spans `&&`) — keep the push on its own line. (b) The auto-mode permission classifier may demand a fresh in-chat "yes" for `git push origin main` EACH new session — it won't accept a memory/self-edit as authorization. Frontend-to-main IS user-authorized; just re-confirm in chat if it blocks. `origin/feat/mobile-opt-main` intentionally lags `origin/main` (feature-branch push often blocked) — prod = `origin/main`.

---

## 2. WHAT SHIPPED MOST RECENTLY (2026-06-27, all live on prod, verified)
1. **Version stamp (Tier 1) + "update available" detector (Tier 2)** — commits `dda84ed` + `6031401`. Settings ▸ **About** card (Version/Build/Built/Branch) + sidebar footer `v<ver> · <shortSHA>`. A global `UpdateBanner` polls `/version.json` and prompts "Reload" when the deployed commit ≠ the running bundle. `package.json` version = **1.0.0**.
2. **"Built by AccessorySeezin.com" attribution REMOVED** (user request) — the sidebar footer shows the version stamp instead. Do NOT re-add. (Overrides the global "attribution on every app" default for THIS client app.)
3. **Full rename Diamond → Gospel Central** — commit `da03bbd` (code + storage-key migration) + `9d49f62` (live docs) + infra (repo/project/domain renamed via `gh` + Vercel dashboard). All connections re-verified end-to-end.

---

## 3. ARCHITECTURE QUICK-FACTS (verify against code before relying on)
- **Stack:** Next.js 16.2.3 (App Router, Turbopack) · React 19.2.4 · TS 5 · Tailwind v4 (CSS-first `@theme`, NO tailwind.config) · shadcn/ui + `@base-ui` · framer-motion 12 · zustand 5 · next-themes · MSW `^2.13` (`@mswjs/interceptors` pinned **exact 0.41.3**) · R3F/drei/three (Groups 3D) · recharts. 11 `vendor/interactive-*-background` `file:` deps (don't let `git add -A` sweep their node_modules).
- **MSW is SW-FREE** — `src/mocks/browser.ts` patches `window.fetch`/XHR in-page via `BatchInterceptor` (import from `/fetch`+`/XMLHttpRequest` subpaths, NOT `presets/browser`). Unmatched (non-`/api`) requests pass through. No service worker (MSWProvider evicts ghosts). Prod runs `NEXT_PUBLIC_MOCK_API=true` (set in Vercel env for all scopes). `API_BASE` (only in `src/lib/api/client.ts`) = env `NEXT_PUBLIC_API_URL` → `/api` in mock → localhost fallback.
- **Auth is mock + client-side.** Seeded logins, all **password `admin`**: `admin`(Dev/Michael), `overseer1`(Gabriel), `branch1`(Joseph, Branch Leader), `group1`(Elizabeth), `team1`(Jude, Team Leader), `member3`(Ananias, member+teacher — `member1` is NOT teacher-tagged). Wrong pw = real 401; logout **resets the mock to seed** (can't create-a-user-then-relogin-as-them). Contacts are owner-scoped. Seed: `src/mocks/scenario-church-week.ts` (re-seeds to the CURRENT week every load).
- **Version system (new):** `scripts/generate-version.mjs` runs as the **`prebuild`** npm hook (fires on Vercel + local build) and writes BOTH `public/version.json` (served, gitignored artifact) AND `src/lib/version.ts` (`APP_VERSION`, baked into the bundle) from ONE run. Commit source = `VERCEL_GIT_COMMIT_SHA` ‖ `git rev-parse HEAD` ‖ `'unknown'`. `next.config.ts` sends `/version.json` `no-store`. `src/proxy.ts` PUBLIC_PREFIXES includes `/version.json` (else the auth gate 307s it → detector breaks). `src/lib/version-check.ts` = `isUpdateAvailable()` + fetch. Banner mounted in `Providers` after `<ThemeEffects/>`.
- **Rename migration:** `src/lib/stores/migrate-storage.ts` copies legacy `diamond-*` localStorage keys → `gospel-central-*` before the zustand stores hydrate. `src/proxy.ts` accepts BOTH `gospel-central-session` and legacy `diamond-session` cookies; `auth-store.ts` clears both on logout. tree-view reads legacy as fallback.
- **`src/proxy.ts`** = the Next 16 middleware (renamed from `middleware.ts`; shows as "Proxy" in build output) — server-side auth gate via `diamond-session`/`gospel-central-session` cookie + a PUBLIC_PREFIXES allowlist.

---

## 4. VERIFICATION (how to test — prod is the source of truth)
- **NO local dev server for casual checks; verify on the deployed prod URL.** Primary tool = **Chrome MCP** (`mcp__Claude_in_Chrome__*`) in the user's real, signed-in Chrome (has a persisted session). Fallback = chrome-devtools MCP (separate Chrome — may need a fresh `admin`/`admin` login) for faithful device emulation. **Hard-reload after a deploy** (open tab serves the previous cached JS until reload).
- **Version-stamp proof = 5-way cross-source-of-truth, all must equal:** `git rev-parse origin/main` == `vercel inspect <prod alias>` deployed commit == `GET /version.json .commit` == Settings About-card SHA == sidebar SHA.
- **Tests:** `npm test` (vitest unit + integration, ~338 pass/7 todo) · `npm run test:integration` · `npm run e2e` (Playwright: chromium + `mobile-s24`) · `npm run e2e:update` (regen visual baselines — do this whenever brand/layout changes; visual specs are chromium, skip-in-CI).
- **e2e cold-start is slow** (`npm run e2e`'s 120s webServer timeout often trips on this heavy app). Reliable pattern: start the dev server in the BACKGROUND, poll, then run playwright (it reuses the server):
  ```
  # background:  NEXT_PUBLIC_MOCK_API=true NEXT_PUBLIC_MOCK_DATE=2026-06-22T12:00:00 npm run dev
  # poll ready:  curl --retry 40 --retry-delay 5 --retry-all-errors --retry-connrefused -s -o /dev/null -w "%{http_code}" http://localhost:3000/login
  # run:         npx playwright test <spec> --project=chromium
  # (foreground `sleep` is blocked here; use curl --retry or `ping -n N 127.0.0.1` as a timer)
  ```
- **Device widths:** Galaxy **S24 Ultra** — verify at BOTH `412×915` (standard) AND the narrow **`275×596` @ DPR 5.24** (Samsung display-size zoom; the project's worst-case). Tap targets ≥44px, no horizontal page pan, no iOS-specific claims from Chromium.
- **`src/lib/version.ts` churn:** a local `npm run build` rewrites it (tracked + build-overwritten). After a local build, `git checkout -- src/lib/version.ts` before committing (deploy's prebuild regenerates it with the real main SHA).

---

## 5. OPEN / DEFERRED (nothing blocking; pick up as prioritized)
- **Real iOS Safari proof of the SW-free MSW fix still PENDING** — Chromium/emulators can't prove it; needs a physical iPhone tap (login admin/admin → dashboard with data).
- **Backend authz gaps = Mike's, do NOT "fix" in the mock** (masks the real gap): contacts-family (`POST/PUT/DELETE /contacts`, convert), `PUT /users/:id/username`, `GET /audit-log`, `PUT /contacts/:id {assignedTeacherId}`, `PUT /bookings/:id`+cancel. Full list: `docs/qa/out-of-scope-findings.md`, `docs/BACKEND_GAPS.md`.
- **Settings component-internal dual-shell** — the theme/background picker double-renders responsively (separate from the already-fixed `(dashboard)/layout.tsx` dual-mount). Needs its own pass.
- **Calendar/wizard minors:** no UI Delete affordance (only soft-cancel; DELETE handler unreachable), wizard blocked-slot tooltip reads "Occupied by: undefined", a few 275px tap targets <44 (Close-X ~36, duration btns ~40).
- **Secondary docs still say "Diamond"** (optional sweep, not done): `docs/MIKE_HANDOFF.md` and the GitHub repo *description*. Historical/QA docs (`docs/qa/*`, `AUDIT_REPORT.md`, `MOBILE_AUDIT_PROGRESS.md`) are intentionally left as records.
- **QUEUED (not run):** Settings cross-page propagation stress test (16 workflows) — approved plan `C:\Users\aicod\.claude\plans\peaceful-weaving-sundae.md`; report-only, `audit-anti-drift`, browser UI. Run when the user asks.
- **`MEMORY.md` compaction** — the auto-memory index is over its load limit; a task chip (`task_a8b25a29`) was spawned for it.

---

## 6. GOTCHAS (durable)
- **Browser bundle cache after deploy** — the same tab serves OLD JS until a hard reload; hard-refresh before verifying (this is literally what the Tier-2 update banner exists to surface).
- **Grep/ripgrep has NO lookahead** — `(?!…)` silently returns no matches; use alternation + post-filter.
- **`@base-ui` DropdownMenu/Select** don't open from a synchronous `.click()` in an eval — use a real pointer click (chrome-devtools `click` on a snapshot uid) or async click + await the portal.
- **SPA nav can briefly show the prior page / a stale tab-context title** — confirm `location.pathname` + a page selector (or re-`get_page_text`) before asserting.
- **PowerShell is the default shell** — no `&&`/`||`, consumes `--`; use the Bash tool for POSIX (git chains, curl retry loops).
- **Playwright `browser_click` acts as drag-start on `draggable`/WebGL surfaces** — use the element's real DOM `.click()`. Keep Claude-in-Chrome OFF `/groups` (WebGL/GPU). Repeated reloads of `/groups` (2 WebGL contexts) can exhaust the GPU pool browser-wide → node cards stop mounting; recover via a separate Chrome process.

---

## 7. POINTERS
- **Authoritative packet:** `HANDOFF.md` (repo root) — status, stack, deploy, QA evidence, backend handoff.
- **Backend cutover:** `docs/MIKE_HANDOFF.md`, `docs/BACKEND_GAPS.md`. **Testing:** `docs/TESTING.md` (3-tier suite). **Permissions:** `docs/PERMISSIONS.md`.
- **Auto-memory:** `project_diamond_mobile_audit.md` (cross-session status — the DONE entries at the bottom are the recent history; file keeps its old name deliberately).
- **Email:** "email me / email it to me" → **accessoryseezin@gmail.com** (send via Gmail-web as aicodeproxima@gmail.com; classifier blocks novel recipients).

## 8. WORKFLOW CONVENTIONS
- Commit + push without asking; one commit per coherent step; end messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Investigate + plan before non-trivial changes** (the user asks for this explicitly). **Honest status** — tie every "verified" claim to the exact engine/surface tested; surface failures immediately.
- Stage app source only — never commit the scratch dirs (`Background Ideas/`, `Organization Tree Ideas/`, `Diamond Quotes.txt`).
- Records keep the old name (local `C:\Users\aicod\Diamond` worktree, dated QA/audit docs); only LIVE current-state docs (`CLAUDE.md`, `HANDOFF.md`, this file) carry "Gospel Central".
