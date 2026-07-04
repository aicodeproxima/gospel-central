# Gospel Central (formerly "Diamond") — Session Passdown (cold-start for the next session)

> **RENAME (2026-06-27): the app is now "Gospel Central".** GitHub repo `aicodeproxima/gospel-central` (was `Diamond`; old path redirects), Vercel project `gospel-central`, prod URL **`gospel-central.vercel.app`** (legacy `diamond-delta-eight.vercel.app` still resolves). Internal storage keys were renamed `diamond-*` → `gospel-central-*` WITH migration; the proxy still accepts the legacy `diamond-session` cookie. The local worktree dir `C:\Users\aicod\Diamond`, historical/QA docs, and this file's siblings named `*diamond*`/`MOBILE_AUDIT_PROGRESS.md` keep the old name (records). **Do NOT re-introduce "Diamond" as the app's display name.**

> **OVERHAUL IN PROGRESS (2026-07-03, session 1 ending — cold-start here):** the app is mid-way
> through the user's full overhaul packet ("Gospel Central Overhaul and Deliverables - Final").
> **Approved plan:** `C:\Users\aicod\.claude\plans\structured-scribbling-steele.md` — 13 locked
> decisions, phase specs, the anti-hallucination/drift/context-rot protocol (rules 1–15), AND the
> **MODEL-ROUTING & DELEGATION PROTOCOL** (D1–D8 + per-item routing table: Fable 5 orchestrates
> inline and NEVER delegates permissions/store-shapes/seed-identities/dependency-adds/git/deploys;
> sonnet does spec'd volume work; opus the hard components; haiku read-only sweeps; 4 marked
> ultracode gates). READ THE PLAN + LEDGER BEFORE ANY EDIT; re-read the routing ROW before any
> dispatch (D6) — never dispatch from memory.
> **Progress ledger:** `OVERHAUL_PROGRESS.md` (repo root, untracked, append-only — THE resume point;
> per-phase tier records live there).
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
> - **PENDING at this pause (RESUME HERE):** e2e chromium 50 pass + **E4 NOW PASSES**; the ONLY red is
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
> **NEXT: Phase 7 — Settings** (Alerts page: `relatedUserIds` on AuditLogEntry at every push site + per-type
> toggles + Sidebar/MobileNav red badge vs `alertsLastSeenAt`; **v4 prefs migration = force Marble +
> 'default'→'basic' rename, NON-DELEGABLE Fable inline w/ blob unit tests**; feedback form UI-only;
> **regenerate the FULL Playwright visual baseline set once — Marble default changes every page**). Then
> **Phase 8 Reports/Admin** (audit-export per-row timestamps, exceljs multi-sheet export, teacher/member
> performance reports + anomaly flags, GL+ export gate everywhere, BookingType close-out grep sweep) →
> final overhaul ultracode gate (correctness/permissions/packet-completeness) + docs sweep + full e2e.
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
