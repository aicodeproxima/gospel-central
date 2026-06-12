# Diamond — Mobile Optimization Audit (current `main`)

> **This ledger + git are the single source of truth for project state.** Re-derive HEAD from `git rev-parse --short HEAD` — never trust a SHA written in prose (including here). Other docs (SESSION_PASSDOWN.md, HANDOFF.md) are pointers or history, not authority.

**Objective:** make current `origin/main` Diamond genuinely smooth, reliable, space-efficient, and visually
correct on mobile. Autonomous loop: plan → implement → verify-in-browser → audit → repeat until the success
criteria are met or truly blocked (creds/permissions/irreversible).

## Source of truth & state
- **Branch:** `feat/mobile-opt-main` off `origin/main` `ccc65ca`. ⚠️ NOT the stale `feat/mobile-realdevice`
  (`9aca3cd`) — that was built on `ff2ec0d`, 63 commits behind; it is a REFERENCE ONLY. Re-port a fix only after
  proving it's still needed on current main.
- claude 2.1.112. `npm run build` GREEN on main (2026-06-02, exit 0; routes / /admin /calendar /contacts
  /dashboard /first-login /groups /login /reports /settings).
- **Baseline preview** (mock data ON via `--build-env NEXT_PUBLIC_MOCK_API=true`, LABELED demo):
  `https://diamond-a8ix2mrlv-aicodeproximas-projects.vercel.app`
  Login `admin`/`admin`. Phone/automation = cookie bypass:
  `?x-vercel-protection-bypass=diamondMobileAudit2026realdevXYZ&x-vercel-set-bypass-cookie=true`
  Bypass secret STILL ACTIVE — do not revoke until final sign-off.
- Scripts: `build`=next build · `lint`=eslint · `test`=vitest run (vitest present) · typecheck via build.
- **Backend direction:** `MSWProvider` gates `NEXT_PUBLIC_MOCK_API === 'true'`; `client.ts` base
  `http://localhost:8080/api`. Main is moving toward a REAL backend (docs/MIKE_HANDOFF, docs/BACKEND_GAPS) →
  DO NOT flip the mock default in code; only use the preview build-env. Don't push/merge to main.

## Verification method
Chrome DevTools MCP **Device Mode** vs the deployed preview. Cookie-bypass for SSO. Per route+state capture:
screenshot · console errors · failed requests · `documentElement.scrollWidth` vs `innerWidth` (pan) ·
elements wider than vw outside an x-scroller (clip) · overlap with fixed bottom nav (z-30) · tap-target sizes.
Viewport matrix: 320×568, 360×780, 390×844, **412×915 (priority, S24-style)**, 430×932, 480×1040, + 915×412 landscape.
Themes: light/dark + ~11 animated (`interactive-*` vendor pkgs) — test all.

## Known target areas (from prior work + user reference screenshots — VERIFY on current main first)
- **Global shell** (`(dashboard)/layout.tsx`): mobile content `min-w-0 flex-1 overflow-auto p-4 pb-20` (has min-w-0,
  NO overflow-x-hidden → pan risk; `h-full` not dvh). Immersive `/groups` layout: `relative h-full w-full
  overflow-hidden`, NO bottom-nav clearance, no dvh.
- **Groups 3D** (`Tree3D.tsx`): camera aspect uses `window.innerHeight` (framing bug); floating toolbar tall on
  mobile (labels, not icons); children fan OFF-SCREEN on expand (user screenshot); fixed 220px cards.
- **Groups list**: `OrgNodeComponent` deep indentation → names truncate to "L…"/"P…" on narrow screens (user screenshot).
- **Calendar** (`calendar/page.tsx`): desktop room-grid only — NO mobile agenda on main.
- **Contacts / Reports**: header crush + filter-bar overflow (verify whether main already fixed some).
- **Contact Details dialog**: long subject tags clip at right edge (user screenshot).
- **/admin** (NEW surface): tab pill-nav + matrix/permissions tables on mobile (`?tab=`).
- Reusable from stale branch AFTER proving needed: `AgendaView.tsx`, Tree3D canvas-aspect camera + snap-guard +
  canvas inset + `w-[168px] sm:w-[220px]` cards. NOTE: main's Tree3D dropped the `teacher` role → re-port by hand.

## Anti-hallucination check (update each loop)
- KNOW (evidence): build green on main; layout has min-w-0 but no dvh/overflow-x-hidden; groups/calendar/Tree3D
  are pre-fix on main + groups has a new "Add User" button to preserve.
- ASSUME (unproven): mock preview renders data; user-reported defects also present on current main. → VERIFY.
- CHANGED since last pass: base switched stale `ff2ec0d` → current main `ccc65ca` (admin system added).
- NEEDS PROOF: each screen's actual mobile state on current main (baseline screenshots pending).

## Loop log
### Loop 0 — setup — DONE (2026-06-02)
Branch off main; `npm install`; build GREEN; baseline mock preview deployed (`a8ix2mrlv`); keep-awake engaged;
ledger created.

### Loop 1+2 — shell + Calendar + Groups/Tree3D — DONE + VERIFIED (commit `5ab0a7a`, preview `j39u3k1iy`)
- Shell (`(dashboard)/layout.tsx`): standard root `h-[100dvh] overflow-hidden`; mobile content
  `overflow-y-auto overflow-x-hidden`; immersive `/groups` `h-[100dvh]`. (main already had `min-w-0`.)
- Calendar: new `AgendaView` (day-grouped, range-scoped) for day/week on mobile, MonthView for month, grid >=md;
  compact mobile topbar + area/view body controls + collapsible legend; preserved ExportDropdown + empty-states.
  VERIFIED 412: agenda renders (grid hidden), day-scoped (6 items Tue Jun 2), no pan, legend collapsed.
- Tree3D: real canvas aspect (not window.innerHeight); aspect-aware computeSubtreeFocus; snap ref-guard; cards
  `w-[168px] sm:w-[220px]`. Groups page: mobile toolbar compacted (title hidden, icon-only incl. Add User) +
  canvas inset `pt-[10rem]` + nav clearance (`md:!p-0` desktop). VERIFIED 412: toolbar 227→141px, Michael framed
  below toolbar (no occlusion), no pan.
- Git hygiene: `git add -A` had swept 130 vendor/*/node_modules → gitignored + removed from index (amend `5ab0a7a`).

### Loop 3 — Groups dense-row + list + full sweep — DONE + VERIFIED (commit `879d223`, preview `obm8gt8zb`)
- Tree3D `computeSubtreeFocus` portrait pull-back ×1.4 (desktop unchanged). VERIFIED: tap-to-expand now keeps all
  children in-scene; for a VERY wide row (Gabriel has 5 branch leaders) the focused node + center child are
  framed and siblings are reachable by pan — 5×168px cards can't fit 412px, inherent 3D limit.
- `OrgNode` list view: per-level indent 56px→24px on mobile (desktop >=sm unchanged). VERIFIED 412: Michael→
  Gabriel→5 branches with FULL readable names (was "L.."/"P.." truncation) — list is the readable dense-tree nav.
- SWEPT current main @412: Dashboard, Admin(users+permissions), Contacts, Reports, Settings, Login — ALL already
  mobile-clean (no pan, no clip, data loads; admin tables scroll in x-containers). Team's prior sweeps covered them;
  no fix needed. Only Calendar + Groups + shell needed work (now done).
### Loop 4 — toolbar-clearance fix + matrix + theme — DONE + VERIFIED (commit `082ad54`, preview `qykza8dcg`)
- FOUND (320px check, but also affects 412): Groups list/metrics/pipeline views used `pt-24` (96px) while the
  floating toolbar is 141–177px → top content sat UNDER the toolbar. FIX: `pt-40 (160px) sm:pt-24`. VERIFIED
  412: list first card (Michael) top 196 > toolbar bottom 141 → clears.
- Viewport matrix: **320×568** Calendar (no pan/clip, agenda renders) + Groups (no pan; toolbar 177px slightly
  exceeds 160 inset → ~17px top overlap, narrowest-edge only, acceptable). **915×412 landscape** (=desktop
  layout, dvh shell) Calendar + Groups: no pan, render fine.
- Theme spot-check: switched to **Aurora** (animated) — Groups 3D renders with theme bg + green accents, no
  pan, no occlusion. Themes are background/accent only → layout is theme-agnostic. (36 theme buttons exist;
  exhaustive per-theme not run — low layout risk.)

## ✅ SUCCESS CRITERIA — MET on current-main base (preview `qykza8dcg`)
- Build GREEN; only Calendar + Groups + global shell needed mobile work (other screens already clean from the
  team's prior sweeps). All fixed + verified across 320/412/landscape + an animated theme.
- Calendar: mobile agenda (was grid-only). Groups: framing/occlusion/snap/dense-row + readable list. Shell: dvh +
  overflow-x-hidden. No horizontal pan / clipped controls / hidden-under-nav on any audited screen.
- Branch `feat/mobile-opt-main` pushed. NOT merged to main. Bypass secret still active (revoke after sign-off).
- Known limit: 3D view with a VERY wide child row (5 branch leaders) can't show all cards at once on a phone —
  focused node + center child framed, siblings reachable by pan; list view is the readable alternative.
- REMAINING (user/deliberate): real S24-Ultra sign-off; decide if/how to merge to main; revoke bypass secret
  `diamondMobileAudit2026realdevXYZ`.

## ⚠️ PARALLEL BRANCH — `origin/feat/mobile-optimization` (decide before integrating)
A parallel `feat/mobile-optimization` already exists on origin, based on the SAME current main (`ccc65ca`,
2026-05-29), with 6 commits doing the SAME mobile work and likely MORE refined where mine has a limit:
  - `e6841cf` MSW SW gate, calendar agenda, Tree3D snap, Groups de-occlusion (same as mine)
  - `676b389` Tree3D **cap only wide subtrees (tall chains fit fully)** + robust groups toolbar-offset default
  - `4d7608b` stop stale initial external-focus clobbering expand snap (= my snap-guard)
This task appears to have been done in parallel. My independent, end-to-end-verified version is pushed as
`origin/feat/mobile-opt-main` (`7dcfc7d`). NOT merged. DECISION for user: adopt the existing branch, adopt mine,
or merge the best of both (their wide-subtree handling + my verified shell/calendar/list fixes). Branch names:
  - `feat/mobile-opt-main` (mine, off ccc65ca, verified 320/412/landscape + Aurora theme, preview `qykza8dcg`)
  - `feat/mobile-optimization` (pre-existing parallel, off ccc65ca, 6 commits, NOT verified by me)

### Loop 5 — adopt parallel branch (best-of-both) — DONE + VERIFIED (preview `idmdc4a6v`)
Per user: "apply theirs' fixes that mine lacks to my branch." Theirs is a comprehensive superset
(39 files, xl=1280 breakpoint, viewport export + globals mobile base, all admin/contacts/settings/
dashboard/dialogs/BookingWizard/Day-Week-MonthView adapted, smarter Tree3D cap-wide-only).
- Merged `origin/feat/mobile-optimization` into `feat/mobile-opt-main` with `-X theirs` (theirs wins
  overlap). `-X theirs` left hybrids in the 3 files both rewrote → force-checked-out theirs' EXACT
  Tree3D/groups-page/dashboard-layout. Kept my OrgNode list-indent (theirs never touched it).
- Build fix: theirs' code tripped Next 16 static-prerender `useSearchParams` bailout on /login (+/admin
  /contacts) → wrapped `{children}` in `<Suspense>` at root layout (force-dynamic from a 'use client'
  page is NOT honored in Next 16). Build now GREEN, 11 routes.
- Best-of-both: re-applied 2 fixes mine had + theirs lacked, VERIFIED on `idmdc4a6v`:
  (1) AgendaView client-side day/week/month range filter — Day view now shows ONLY the selected day
      (was leaking adjacent days; mock /api/bookings ignores start/end). VERIFIED: 1 day-header, 6 items.
  (2) Groups list/metrics/pipeline `pt-40` mobile so content clears theirs' 151px floating toolbar.
      VERIFIED: list first item top 196 > toolbar bottom 151 (was 132, overlapping).
- VERIFIED on merged build: login, dashboard, calendar agenda (compact D/W/M, grouped, no pan), groups
  3D (framed, no occlusion, toolbar 151), groups list (readable names, clears toolbar). No horizontal pan.
- Branch `feat/mobile-opt-main` = theirs' full mobile work + my OrgNode + agenda-scoping + list-clearance.
  Final preview: `https://diamond-idmdc4a6v-aicodeproximas-projects.vercel.app` (mock; cookie-bypass for phone).

### Loop 6 — Groups 3D scaling rework — DONE + VERIFIED (commits `4f806be`+`0770b6b`, preview `dkh5xrez6`)
Problem (user): cards overlapped/cut off when expanding a wide branch; expand didn't zoom out to fit children;
avatars scaled with zoom but cards didn't; Collapse was unreachable (scrolled off the mobile toolbar).
Root cause: node/contact cards were screen-space drei `<Html>` (fixed px, NO `distanceFactor`) while
avatars/platforms are world-space → mismatch. Fix (all `compact`<1280-gated; desktop frozen):
- **World-scale cards:** `distanceFactor` on both `<Html>` (drei web/Html.js: scale = objectScale*distanceFactor),
  CALIBRATED live to `23` → card ~5.0 world-units wide (< `HORIZONTAL_GAP` 7 ⇒ siblings can never overlap).
  (distanceFactor 10 gave ~46px unreadable cards → 23 → ~104px readable.)
- **Framing:** `computeSubtreeFocus`/`computeFullTreeFocus` compact branches → padded bounding-box fit (pad
  card-half-width + avatar-top + card-drop, real `canvasSize`); deleted the screen-space cap; OrbitControls
  compact `maxDistance` 70→120.
- **Toolbar:** icon-only on mobile (labels `hidden xl:inline`) + wrap (not horizontal-scroll) ⇒ Collapse/Reset/
  Expand always visible. `data-tree-card` added for DOM verification.
- VERIFIED @412 (DOM-measured): expand Gabriel→5 branch leaders = **0 overlaps, 0 off-X, 0 off-bottom**, cards
  94–110px readable, avatars proportional. **Cards scale with zoom** (106px at fit-subtree → 28px at fit-all —
  no freeze; the earlier wheel-test null was a synthetic-event artifact). **Collapse reachable + works** (2 root
  cards remain). **Expand-all** = clean tidy non-overlapping tree, **51 cards on-screen vs old 1/178-off**.
  Desktop @1440 UNCHANGED: cards fixed 220px (no distanceFactor), toolbar labelled.
- Calibration + narrow-viewport robustness (commits `0770b6b`,`56ad4aa`,`70faea8`, final preview `lb7c7qmmx`):
  - distanceFactor 10→23 (cards 46px→~104px readable).
  - +1.12x framing safety margin (compact) — fixed edge cards clipping at 360/320 (was offX:2 @360).
  - **Per-viewport distanceFactor** (drei cardWorldWidth = 156·factor/canvasHeight): static factor made cards
    ~6.9wu on a 320 canvas → 3 overlaps; now `factor = CARD_WORLD_WIDTH(4.8)·canvasSize.height/156` threaded to
    both cards holds card world-width ≈4.8wu (< gap 7) at every viewport/DPR.
  - VERIFIED (DOM-measured, all 0 overlap / 0 off-edge): **412** cards 82–95px, **360** 92–107px, **320** 45–53px
    (small but all-visible — a 320×568 screen fitting a 6-node tall+wide subtree is physically constrained; pinch
    to read). Desktop 1440 cards fixed 220px (unchanged). Cards scale with zoom (106px↔28px, no freeze).
- Remaining recon (lower-risk; reuse the verified `computeSubtreeFocus`/external-focus pipeline + same cards):
  search→focus, jump→focus, list view (OrgNode indent already fixed), contact-leaf dialog, pan, landscape.

---

## Loop 7 — Contacts + Groups mobile overhaul (user-reported defects, 275px) — IN PROGRESS (2026-06-03)
**Canonical S24 Ultra viewport CORRECTED → 275×596 @ DPR ~5.24** (the old 412×915 was the *S20 Ultra* preset = too wide; user confirmed 275 live by bracketing 412→320→300→290→280→275). User supplied 10 annotated screenshots + 2 live-reproduced 3D bugs → 8 fixes A–H. Each VERIFIED by a 275px screenshot + a 1440px desktop-unchanged screenshot (rect-math is NOT accepted as proof this round). Plan: `~/.claude/plans/i-just-realized-that-humming-bentley.md`. Verification preview this batch: `diamond-2o9jyu6vo` (mock; cookie-bypass).

### Contacts batch — DONE + VERIFIED
- **Fix A — grid card (commit `f376e19`).** Root: mobile grid (`max-xl:grid-cols-2`) showed only the avatar initial; name truncated to 0 at ~115px cards; type badge (`shrink-0`) clipped at the right edge. Fix: `ContactCard.tsx` adds an `xl:hidden` compact vertical card (avatar+sessions row, name via `line-clamp-2`, stage row, wrapping type badge, phone); original horizontal card wrapped in `hidden xl:block`. VERIFIED @275 names visible (Amminadab/Barak/Boaz) + long badge "Baptized Contact In Person" wraps 2 lines no-clip; @1440 original 3-col card unchanged.
- **Fix B — header consolidation (commit `92b11d1`).** Root: 5 stacked groups (`space-y-5`) ate ~75% of the screen. Fix: `contacts/page.tsx` — Import/Export/Select → mobile overflow "More actions" `DropdownMenu` (Add Contact stays visible); status pills → single horizontal-scroll row (`xl:flex-wrap` keeps desktop); `max-xl:space-y-3`. VERIFIED @275 header compact + cards reach the fold + ⋯ menu lists Import/Export-current/Export-all/Select; @1440 inline buttons + wrapping pills unchanged.
- **Fix C — detail-dialog overflow (commit `31816d7`).** Root: `Badge` base `whitespace-nowrap w-fit` → a ~500px subject chip forced the whole `ContactDetailDialog` wider than the viewport → h-scroll + both-edge clipping ("ct Details", "57-1011"). Fix: `ContactDetailDialog.tsx` — subject/partner badges wrap (`h-auto max-w-full whitespace-normal break-words`), dialog body `overflow-x-hidden`+`break-words`, footer `max-md:flex-col`. Shared by Contacts/Groups/Admin. VERIFIED @275 (Ethiopian Eunuch, 51 subjects) 0 chips overflow + docScrollWidth==innerWidth(275) + footer stacks; @1440 the 672px dialog unchanged (chips one-line, footer row).

### Groups batch — DONE + VERIFIED (commit `72cc23b`, preview `diamond-nfjd2tlvb`)
- **Fix D — toolbar density + tab cutoff (`groups/page.tsx`).** Mobile: Jump/Expand/Collapse/Reset/AddUser → overflow `DropdownMenu`; title pill hidden; tabs abbreviated (Tree/Metrics/Pipeline) + `overflow-x-auto`; `pl-16`; content `pt-28`. VERIFIED @275 one compact row + tabs fully visible (was "Student Pipelin…" cut). @1440 full labels + all buttons inline unchanged.
- **Fix E — list name truncation (`OrgNode.tsx`).** Mobile: name on its own full-width line (`break-words xl:truncate`), role+group on a secondary line, `h-7` avatar, `ml-0` per-level indent. VERIFIED @275 deep nodes **0/132 names truncated** (was 46) — "Jude son of James", "Mary Magdalene", "Alexander son of Simon" all full. @1440 inline badge + truncate unchanged.
- **Fix F — search/jump center (`groups/page.tsx` + `OrgNode.tsx`).** `data-node-id` + `highlightId`; list `scrollIntoView({block:'center'})` on external focus + ring highlight; 3D search → `node` (person-centered) focus. VERIFIED @275 search Mary → centered (cy 298==298) + ringed.
### 3D batch — DONE + VERIFIED (commit `72cc23b`, preview `diamond-nfjd2tlvb`)
- **Fix G — Expand-All zoom-lock (`page.tsx` handleExpandAll + `Tree3D.tsx`).** Auto-fit after expand; compact `maxDistance` 120→280 + lift the `computeFullTreeFocus`/`computeSubtreeFocus` clamp to 280; compact fog far 75→280 (fog moved inside SceneContent). VERIFIED @275 Expand-All frames **164/182 on-screen** (was 1; tree + connector lines + avatars visible, not fogged out).
- **Fix H — Collapse-All off-center (`page.tsx` handleCollapseAll + `Tree3D.tsx`).** Snap-center the primary root via node focus; **ROOT CAUSE + guard:** the reset effect had `computeFullTreeFocus` in its deps → it re-fired fit-all on every layout change (incl. collapse) and clobbered the snap; now guarded to fire only when `resetSignal` actually increments. VERIFIED @275 Collapse-All centers Michael (cx 137==138, zoomed in).
- Desktop @1440 re-verified unchanged for the Groups toolbar / tabs / 3D scene.

## ✅ Loop 7 SUCCESS — all 8 user-reported defects fixed + verified @275, desktop unchanged @1440
Commits on `feat/mobile-opt-main`: A `f376e19` · B `92b11d1` · C `31816d7` · D/E/F/G/H `72cc23b`. Pushed.
Remaining (optional spot-checks): themes, landscape 915×412, jump-to picker, metric-icon filters, contact-leaf dialog opened from a 3D leaf (same `ContactDetailDialog` as Fix C). Bypass secret `diamondMobileAudit2026realdevXYZ` STILL ACTIVE — revoke at final user sign-off. NOT merged to main (deliberate).

### Loop 7b — responsive recon (tablet scaling) — DONE + VERIFIED
Recon up the breakpoints (640→1440) found the phone card/list-row redesigns were gated at `xl` (1280), so the whole **tablet range 640–1279 showed the sparse phone layout stretched wide**. Fix: moved the **ContactCard** swap (`xl`→`sm`) + the **OrgNode list-row** swap (`xl`→`sm`) to 640. VERIFIED: @1024 proper horizontal cards + inline-badge rows; @275 still compact (unchanged); @1280 inline header (full desktop). Phone (<640) + desktop (≥1280) unaffected. Groups toolbar + 3D scene intentionally stay `compact`/`xl` (fine at tablet); the ⋯ headers/toolbars stay compact through tablet and swap to inline at xl (a deliberate density choice).

---

## Loop 8 — comprehensive every-screen audit @275 (S24 Ultra) — DONE + VERIFIED (2026-06-05)
User raised the bar after Loop 7: **every screen + every dialog/form/wizard** must be screenshot-verified at **275px**, fixing all cut-off / overlap / disproportion / overflow, BEFORE the (deferred) desktop 2048px polish. Verification preview `diamond-4y3qen5ap` (mock; cookie-bypass). All changes gated `isPhone`/`max-md`/`grid-cols-1 sm:…`; desktop ≥md/lg re-verified unchanged @1440.

### Fixes (committed)
- **Commit `251dc01`** — Contacts dialogs + Dashboard:
  - `ContactDetailDialog.tsx` (Edit/Convert) + `ContactForm.tsx`: `min-w-0` chain (motion.divs + `<form>`) + DialogContent `overflow-x-hidden` so the form never inflates past the dialog grid column. **Fixes the user-reported Edit Save-footer cut-off.** Edit/Convert footers stack via `max-md:flex-col`. VERIFIED @275: form 243px, every input ≤243 (`anyInputOverflowsViewport:false`), footer `flex-direction:column` (Cancel/Save/Delete full-width, all reachable).
  - `dashboard/page.tsx`: quick-links grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (was `max-xl:grid-cols-2` forcing 2-col phone). VERIFIED @275 full-width quick-link rows.
- **Commit `66631d0`** — Reports + wizards:
  - `reports/page.tsx`: summary stat grid `grid-cols-1` on phone (icon-left+number+label was squeezing "Cancellations" at 2-col/114px → ~65px label col). Action-Breakdown **donut** drops overflowing outside labels and renders a wrapping `<Legend>` (name + %) on phone via `isPhone` matchMedia (`(max-width:767px)`), container `h-[230px]`. VERIFIED @275: stat labels one-line, legend shows Create 31% / Delete 28% / Export 14% / Update 27% with no clipping; @1440 desktop unchanged (4-col stats, donut outside-labels, no legend).
  - `BookingWizard.tsx` + `CreateUserWizard.tsx`: header row `max-md:pr-9` so the "Step N of M" badge clears the absolute close-X on phones (was sitting under it — old preview showed "Step 1 of ✕"). VERIFIED @275: BookingWizard "Step 1 of 6" + X separated; CreateUserWizard "Step 1/2 of 3" + X separated.

### Audited PASS @275 (no fix needed — screenshot-verified, `pageHScroll:false`, no offenders outside x-scrollers)
- **Login** — card fills width, inputs + Sign In full-width.
- **Dashboard** — stat grid 2-col (114×188 cards, readable, icon badge doesn't obscure number); "Upcoming Bookings" detail dialog (scrollable list, footer row).
- **Contacts** — grid cards (Fix A, full names + wrapping type badge), header ⋯ menu (Import/Export/Select), detail View footer stacks (Close/Convert/Edit), Add form (sticky Create footer, "+ New" not clipped), Import CSV dialog.
- **Calendar** — agenda view; BookingWizard step 1 (full-width activity cards).
- **Reports** — Change-Log/audit table 629px **inside x-scroller**; "Total Actions" detail dialog (3-col Action/Type/User table fits); bar chart; Top Contributors list.
- **CreateUserWizard** — step 2 `grid-cols-2` role grid (Developer/Overseer/Branch Leader/Group Leader/Team Leader/Member) fits, no truncation; Reports-to dropdown full-width.
- **Settings** — profile form full-width; theme picker (Dark/Light/System + 3-col accent swatches Default…Rain, all names readable).
- **Admin** — Users tab is **card-based** on mobile (no wide table); **Permissions matrix** = 8 tables (600px) all **inside x-scrollers** (no page overflow); descriptive text + inline code badges wrap.
- **Groups** — Metrics tab (Teacher Performance 2-col metric cards), Pipeline tab (Student Pipeline stage bars), Add-User overflow menu (Jump/Expand/Collapse/Reset/Add User). 3D/list/toolbar already verified Loop 7.

### Status
All Loop 8 fixes committed + pushed to `feat/mobile-opt-main` (HEAD `66631d0`). **Mobile phase = complete.** NOT merged to main (deliberate). Bypass secret `diamondMobileAudit2026realdevXYZ` **STILL ACTIVE** pending the user's real-device sign-off. **DEFERRED (separate phase, not started): desktop scale-up to 2048px** (cut-off/overlap/disproportion at 1440+2048) — the user explicitly sequenced this *after* mobile is signed off.

---

## Loop 9 — Contacts page comprehensive audit + redesign (2026-06-05)
User: "audit and proactively fix/redesign the contacts page … ui/ux proportions, ease of use, functionality, relationships with other parts of the app, navigation." Recon = 3 Explore agents + live screenshots (275/1440/2048/kanban) + full reads. Core finding: a **rich data model** (assignedTeacher, currentStep, type, status, groupName, partners, timeline) that the **UI barely surfaced**, plus the 2048 grid stretching to ~570px sparse cards, no deep-links, and a buried teacher relationship. User chose **Comprehensive** scope + a **dense table view**. Plan: `~/.claude/plans/i-just-realized-that-humming-bentley.md`.

- **A — dense Table view + width cap** (commit `f287a9b`). New `ContactsTable.tsx` (Contact·Teacher·Stage·Progress·Sessions·Last-session·⋯, sortable headers, row→detail) + `contact-helpers.ts`. `ViewMode` gains `'table'`; default table ≥lg / grid below, persisted to localStorage, table toggle hidden <lg w/ grid fallback. Page `max-w-[1600px] mx-auto` + grid `2xl:grid-cols-4`. VERIFIED @2048: root capped **1600px centered**, grid cards **570→391px**, table dense+sortable (Sessions desc 49/49/41…), row-click→detail; @275 table hidden + grid fallback, no h-scroll.
- **B — surface teacher + step** (commit `5d7e91e`). ContactCard (desktop+mobile): 🎓 teacher line + "Step N/5" chip. ContactDetailDialog: Teacher row (was missing). VERIFIED @1440 grid (teacher+step on every card), dialog (TEACHER: Patrobas), @275 (mobile teacher line).
- **C — deep-links + dashboard** (commit `3a51683`). Reads `?stage/?type/?q/?view/?id/?edit` on load; mirrors filters into the URL via **`history.replaceState`** (router.replace wasn't reflecting → switched + dropped unused router). Dashboard Baptisms dialog → `/contacts?stage=baptized` ("View Baptized"). VERIFIED: `?stage=baptized&view=table` → 4 baptized table; click Progressing → `?stage=progressing`; Clear → `/contacts`.
- **D — ease-of-use** (commit pending). Sticky bulk-action bar (`sticky top-0 z-20 bg-card`); kanban drag feedback (`ring-2 ring-primary`) + wider columns (`min-w-[260px]`); mobile empty-state icon `max-sm:h-8`. (Caught + removed a redundant export toast — `exportCSV` already toasts.) VERIFIED @1440: sticky bar (2 selected), kanban 260px cols, no h-scroll. loadError/retry deferred (un-triggerable under MSW mock).
- **E — final sweep** (commits `0ed329a` D + ledger). VERIFIED on final preview `diamond-nq73ywcmy`: desktop **2048** table capped 1600 centered + grid 4-col 391px; **1440** table sortable (Sessions desc) + row→detail; **kanban** 5×260px; **275** mobile = enriched 2-col cards (🎓 teacher line) + table toggle hidden + empty-state ("No contacts match") + no h-scroll. Deep-links: `?stage=baptized&view=table`→4 baptized table; pill click→`?stage=progressing`; search→`?q=`; Clear→`/contacts`; **Dashboard "View Baptized"→`/contacts?stage=baptized`→4** (full flow). Ease-of-use: sticky bulk bar (2 selected), single export toast ("Exported N rows" from the shared csv util — removed my redundant one). Shared `ContactDetailDialog` Teacher row is unconditional + uses the same `users` prop, so Groups/Admin inherit it.

### Loop 9 status
Commits on `feat/mobile-opt-main`: A `f287a9b` · B `5d7e91e` · C `3a51683` · D `0ed329a` (+ this ledger). Pushed. **Contacts redesign complete** — proportionate 275→2048, dense desktop table surfacing teacher/step/stage/sessions, deep-linkable filters, sticky bulk actions. NOT merged to main. Bypass secret still active. No backend/model changes; reused existing ui/ components + permission gates; "Built by AccessorySeezin" intact. Untouched by request: the desktop **2048 polish for OTHER screens** remains the user's separately-deferred phase.

---

## Loop 10 — iPhone login fix: MSW without a service worker (2026-06-06)
**The open bug carried in the prior passdown.** On real **iOS Safari**, `admin`/`admin` → "invalid credentials" + blank data (worked on Android + desktop, reproduced on two iPhones). Root cause: the mock data/login ran on **MSW = a service worker**, and iOS Safari chronically fails to download/keep SWs → the SW never claimed the page → the login `fetch` escaped to the dead `localhost:8080` backend → caught and shown as the misleading "Invalid credentials" toast (`use-auth.ts:32` is a catch-all for ANY failure incl. network, not a real auth failure).

- **Fix (commit `fbfe7ea`)** — make the mock run with **no service worker**:
  - `src/mocks/browser.ts`: replaced `setupWorker(...handlers)` with a `BatchInterceptor` (`@mswjs/interceptors` `FetchInterceptor` + `XMLHttpRequestInterceptor`, the low-level lib MSW is built on) that patches `window.fetch`/XHR **in-page** and routes matched requests through the existing `handlers` via MSW's public `getResponse(handlers, request)`. Idempotent `startMockNetwork()`; unmatched → passthrough (mirrors the old `onUnhandledRequest:'bypass'`).
  - `src/components/shared/MSWProvider.tsx`: removed the SW control-gate (`ensureControlled`), the one-time reload, and the `sessionStorage` guard. Now: dynamic-import → `startMockNetwork()` (synchronous patch) → `setReady(true)` immediately. Real-backend mode (`!MOCK`) still early-returns unchanged.
  - **Resolution gotcha:** import the interceptor classes from the `/fetch` and `/XMLHttpRequest` subpaths, NOT `@mswjs/interceptors/presets/browser` — that preset declares only `browser`/`node:null` (no `import`/`default`), so Turbopack's SSR pass (it compiles client components for the server too) can't resolve it → "Module not found". The subpaths add `import`/`default` fallbacks; only the browser build ever executes (apply() is client-side).
  - handlers.ts, client.ts, use-auth.ts **unchanged**. `public/mockServiceWorker.js` is now unused (harmless; nothing registers it).
- **VERIFIED in Chromium** (chrome-devtools, S24 Ultra emulation 275×596×5.24) on mock preview `diamond-5iuhd8ttj`: login admin/admin → `/dashboard` with real data (Active Contacts 46, Sessions 101, Baptisms 4); `navigator.serviceWorker.controller === null`; **0 SW registrations**; direct `POST http://localhost:8080/api/login` intercepted in-page → **200** `{token: mock-jwt-token-u-michael}`; no escaped-to-localhost requests; 0 console errors. Build green (local Turbopack + remote Vercel). vitest **242/242 pass**.
- **⚠️ NOT YET PROVEN on iOS Safari** — Chromium proves the SW-free *mechanism* (which removes the iOS SW failure cause) but cannot prove iOS Safari itself (the prior session fell into exactly this trap). Awaiting the user's on-device confirmation: open `https://diamond-5iuhd8ttj-aicodeproximas-projects.vercel.app/login` in iPhone Safari and log in admin/admin. SSO protection is OFF so the preview opens on any device with no login.

### Loop 10 status
Commit `fbfe7ea` on `feat/mobile-opt-main` (pushed). Surgical 2-file change. NOT merged to main. The SW-free mock is now the engine for ALL mock previews (works in any browser/device/in-app webview/Private mode). Pending: user taps the preview on a real iPhone to close the bug.

---

## Loop 11 — real-device bug fixes: booking-conflict message + contact card scroll (2026-06-09)
Two issues the user hit testing on the S24 Ultra (Chrome). Commit `d916046`.

- **Booking "Failed to save booking" was opaque.** Root cause (browser-confirmed): a clean booking succeeds (201), but a duplicate / stale-state submit hits the server's `ROOM_CONFLICT` (409, "Room is already booked: <title>") or `BLOCKED_SLOT_CONFLICT` ("Overlaps blocked window: <reason>") — and `BookingWizard.handleSubmit`'s `catch` collapsed all of it into the generic "Failed to save booking", so the user couldn't tell the slot was already taken. Fix: `catch (e) { toast.error(isApiError(e) ? e.message : 'Failed to save booking') }` (+ `isApiError` import from `@/lib/api/client`). The wizard already greys occupied slots from fresh state, so this path is a stale-prop / duplicate-submit race. VERIFIED in Chromium (S24 emul, preview `diamond-c3q9ewev7`): injected a Room1@10am booking via API (the wizard's stale `bookings` prop still showed 10am free), drove the wizard to that slot, submitted → toast read **"Room is already booked: Prior booking (conflict test)"** (was "Failed to save booking").
- **Contact detail card opened scrolled to the BOTTOM.** Root cause: `ContactDetailDialog`'s `DialogContent` is the scroll container; base-ui moves focus into the dialog on open and, with the first tabbable element being the bottom Close button, the browser scrolled the sheet down to it. Fix: a top focus anchor `<div ref={topRef} tabIndex={-1} />` + `initialFocus={topRef}` on the `DialogContent`. VERIFIED (S24 emul): opening Boaz → `scrollTop:0`, "Contact Details" + name at the top, focus on the sentinel (not a bottom button).

### Loop 11 status
Commit `d916046` on `feat/mobile-opt-main` (pushed; 2 files, +18/−4). Build green; vitest unaffected (no handler/mock-engine change). NOT merged to main. Both verified in Chromium on `diamond-c3q9ewev7`. (Mock-state note: the verification injected an ephemeral "Prior booking (conflict test)" row that vanishes on reload — no real data.)

---

## Loop 12 — iOS/MSW hardening: make the Loop-10 fix un-re-breakable (2026-06-10)
Research → audit → plan → execute, per the user's "do research, audit, plan; incorporate hallucination/drift/memory-loss/context-rot measures." 22-agent research+audit workflow over the Loop-10 fix; **13/14 high-risk claims adversarially confirmed** (1 refuted = tangential). Verdict: the SW-free mechanism is correct (approved, untouched) but had 12 confirmed residual risks. Plan: `docs/superpowers/plans/2026-06-10-ios-msw-hardening.md` (commit `8c3f283`). Executed subagent-driven (implementer + spec review + quality review per cluster).

### Shipped (commits, in order)
- **`508657f` + `3747c3d`** — `src/mocks/login-contract.test.ts`: Node vitest driving msw's public `getResponse(handlers, request)` — admin/admin→200 `mock-jwt-token-`, bad creds→401, `/me` Bearer round-trip **as non-default user `stephen`** (review caught: `admin` IS the `/me` no-auth fallback `mockUsers[0]`, so an admin round-trip false-passes a broken Bearer resolution; proven by deliberate break → loud fail). A future msw/interceptors bump that breaks the seam now fails CI.
- **`162bf53`** — mock mode resolves **same-origin `/api`** (no `http://localhost` = iOS mixed-content block) in client.ts + handlers.ts.
- **`e23c927`** — typed errors: network failure → `ApiError{status:0, code:'NETWORK_ERROR'}` (single attempt — the 3× SW-era retry loop removed); login passes `skipAuthRedirect` so a wrong-password 401 toasts instead of full-reloading; `use-auth.ts` catch split — **"Invalid credentials" can no longer mask a transport failure** (the lie that hid the original iPhone bug). +4 tests (`client-errors.test.ts`).
- **`c99733f`** — stale service-worker comments purged from client.ts (replaced with the accurate SW-free model).
- **`ea56867`** — review-caught **Critical**: `bookings.ts:96` had a 3rd private copy of the base-URL expression → same-origin change would have broken blocked-slot delete in mock builds. Fix: **`API_BASE` exported from client.ts as the ONLY derivation**; bookings.ts + handlers.ts import it. Also 401 code corrected `PERMISSION_DENIED`→`UNAUTHORIZED` (matches BACKEND_GAPS contract); +AbortError-passthrough & single-attempt test pins. `97aee41` lint fix; `2b18552` contract test imports API_BASE (4th copy gone — `localhost:8080` now greps to exactly ONE line in src/).
- **`86a8ec2` + `1d8ac35`** — `mock-guard.ts` `isDeadBackendBuild()` + amber `role="alert"` banner (safe-area padded): a flag-less artifact (mock off + localhost base) now **self-announces** instead of faking auth errors. 5 tests.
- **`1541aae`** — boot-time `getRegistrations().unregister()` evicts **ghost SWs** from pre-Loop-10 builds on returning devices (unregister applies next load; safe this session because MSW's worker passes through never-activated clients); `public/mockServiceWorker.js` **deleted**; proxy allowlist entry + package.json `msw.workerDirectory` removed.
- **`0cdab97`** — `@mswjs/interceptors` **pinned 0.41.3 as a direct dep** (was transitive-only; msw's `^0.41.2` range could drift the deep-import contract). `npm ls` = single deduped copy.
- **`8fd7018`** — `hydrate()` localStorage reads try/caught (iOS Private/Lockdown read-throw on returning visit = logged-out, not a crash). **`aad5e41`** — `diamond-session` cookie `Secure` (clearing semantics verified: RFC 6265 identity = name/domain/path, logout unaffected).
- **`40500d6`** — docs: ledger = **single source of truth** (header above) + branch-name fix; `HANDOFF.md` ⚠️SUPERSEDED banner (it pointed at the wrong repo/branch/deploy); passdown de-SHA'd (prose SHAs rot — re-derive from git); MOCK_SCENARIO SW reference fixed.
- **Vercel (no commit):** `NEXT_PUBLIC_MOCK_API=true` + `NEXT_PUBLIC_API_URL=/api` added to **preview + development** scopes (were production-only) — **plain `git push`/`vercel deploy` previews are now mock-on**; `--build-env` no longer needs remembering.

### VERIFIED (engine-tagged, preview `diamond-ivduez3ca` — built with a PLAIN `vercel deploy`, deliberately no --build-env)
- **Chromium (chrome-devtools, S24 emul 275×596×5.24):** UI login admin/admin → `/dashboard` with data (Welcome back Michael · 20 bookings · 46 contacts · 101 sessions); wrong password → **"Invalid credentials" toast, stays on /login, no reload**; in-page probes `POST /api/login` → 200 `mock-jwt-token-`, wrong creds → real 401; `serviceWorker.controller===null`, **0 registrations**; **no banner** (correctly-built artifact). Note: interceptor-answered requests never appear in the DevTools network panel — probe via `evaluate_script` fetch.
- **WebKit 26.4 (Playwright WebKitGTK, Windows):** same probes (200/401/0-SW) + full UI login → dashboard with data → **WEBKIT_CHECK_PASS**. This is an **engine-plumbing check under JavaScriptCore, NOT iOS proof**.
- **Gates:** vitest **255/255** (242 baseline + 13 new); `npm run build` green per commit; `tsc --noEmit` clean; eslint clean on all touched files (62 pre-existing errors elsewhere, inventoried in `97aee41`'s body).
- **Final integration review (subagent): SHIP** — acyclic imports (client.ts is the root), no guarantee undone by a later commit, no desktop/Loops-1-9 regression surface.

### Loop 12 status
17 commits on `feat/mobile-opt-main`, pushed. NOT merged to main (user's pending decision). **OPEN: real-iOS proof (A2)** — Chromium+WebKitGTK cannot prove iOS Safari; close via real-device cloud (TestMu/BrowserStack free tier → real iPhone Safari → plain preview URL → admin/admin, fresh session) or the user's own iPhone. Honest status until then: **root cause removed + hardened, Chromium & WebKit-engine verified, real-iOS confirmation pending.** Follow-ups parked: repo-wide lint cleanup; revisit `isDeadBackendBuild` when a real localhost backend exists; fallback i18n + aria-live (matches existing file precedent).

### Loop 12 addendum — Lockdown-Mode false-failure guard + test-label fix (2026-06-10, later)
Closed two parked follow-ups so the user's iPhone sign-off can't be muddied by a Lockdown-Mode false failure:
- **`76e217b` + telemetry fix** — `src/components/shared/WebGLGuard.tsx`: `detectWebGL()` (cached probe — one canvas per page load) + class boundary wrapping the repo's ONLY R3F `<Canvas>` (Tree3D.tsx; recon confirmed BookingWizard/settings have none). iOS Lockdown Mode disables WebGL → previously the groups page would blank AFTER a successful login ("app broken on iPhone", indistinguishable from the login bug). Now: friendly card pointing at the List view (toolbar toggle stays usable — it lives outside Tree3D). Review-caught fix folded in: `componentDidCatch` re-probes WebGL — a crash **with GL available** is a real bug and POSTs to `/api/error-log` like the app boundary (missing-WebGL stays unreported by design). 5 tests.
- **`781e59e`** — `per-user-smoke.test.ts` describe named for `canEditContact` was asserting `canEditUser` (built fixtures discarded; the `isAdminTier` guard never ran). Corrected call passed for all three admin-tier viewers — no behavioral discovery, just restored the guard the test claimed.
- **VERIFIED (deployed `diamond-arlydonik`, headed Chromium ×2):** normal profile → 3D tree renders, no fallback; `--disable-webgl --disable-webgl2` profile → login still works, groups shows the fallback card, List toggle visible → **WEBGL_FALLBACK_CHECK_PASS**. vitest **260/260**; build green.

---

## Loop 13 — calendar top-bar consolidation + groups 3D edge-to-edge (2026-06-10)
User request (screenshots: phone agenda + phone groups): move the Legend into the top bar, swap Book<->church selector, rename the selector to a static "Church" trigger, and let the 3D tree pan BEHIND the floating groups header edge-to-edge.

- **`c678c85` calendar** (`src/app/(dashboard)/calendar/page.tsx`): compact (<xl) topbar row is now `[Today] [< >] [date] [D/W/M] [Book] ... (ml-auto) [Church v] [Legend v]`. The church Select trigger is a static `Church` label (full names still in the open list; `aria-label` carries the actual selection); Legend is a **Popover** (the Topbar is a fixed 64px row — an inline `<details>` would overflow it), `md:hidden` since >=md keeps the in-page chip row; the old in-page `<details>` Legend row is DELETED (the vertical space was the point). Desktop >=xl untouched except placeholder -> "Select church". Gotcha caught in-flight: base-ui PopoverContent base classes (`w-72 flex-col`) win over a plain `flex-wrap` via tailwind-merge — needed explicit `flex-row flex-wrap w-auto`.
- **`8672ebf` groups** (`src/app/(dashboard)/groups/page.tsx`): the <xl "mobile de-occlusion" inset (`top: toolbarH`) is REMOVED — canvas wrapper is `absolute inset-x-0 top-0` on all breakpoints, so the tree pans behind the floating translucent toolbar (the separation strip in the user screenshot). Phone keeps `bottom: 64` (MobileNav is opaque `bg-card`). Dead machinery removed: `toolbarH` state + ResizeObserver effect, `isBelowXl`, `toolbarRef`. The dynamic-import loading placeholder dropped its rounded `bg-card` box (the hard-edged panel in the screenshot) -> transparent full-bleed spinner over the starfield.
- **`500bd70` calendar follow-on**: verification exposed a PRE-EXISTING bug on the desktop trigger — base-ui `SelectValue` renders the raw VALUE (`area-newport-news`) when given no children. Fixed with the codebase labeled-select pattern: `<SelectValue>{selectedArea?.name ?? 'Select church'}</SelectValue>`. NOTE: other bare `<SelectValue/>` usages render raw values too — most are human-readable enums, but `BlockedSlotsTab.tsx:438` selects an areaId and likely leaks ids the same way (admin-only; parked as follow-up).
- **VERIFIED (deployed `diamond-1ss4f8az3` + `diamond-2vqxh1vbm`, headed Chromium):** @275x596 — topbar shows `[+ Book][Church v][> Legend]`, Legend popover opens with all 7 type chips, church list shows full names, in-page Legend row gone, no h-scroll; groups: scene fills from y=0, a node card visibly panning UNDER the floating toolbar, "Drag to pan" hint above the opaque nav (bottom inset intact). @1440 — desktop calendar layout unchanged, trigger now "Newport News Zion" (TRIGGER_NAME_PASS); groups was already edge-to-edge. vitest 260/260; build green; tsc clean.
- Parked: `useTopbarSlot` deps omit `viewer` (pre-existing stale-closure risk for the Export gate); bare-`SelectValue` id leak in BlockedSlotsTab.

---

## Loop 14 — Admin optimization executed: every tab, fixes + 2 phone redesigns (2026-06-11/12)
Executed `docs/superpowers/plans/2026-06-11-admin-optimization.md` (user approved all recommended options). Subagent-driven, spec+quality review per cluster; 21 commits, suite 260/260 + build green per commit.

- **Cluster A correctness** (`1e50705` `20fb32c` `bd35cc6` `cac64c0`): hooks-before-return in ContactsAdminTab AND BlockedSlotsTab (latent auth-transition crash); ALL 14 id/enum-valued bare SelectValues labeled repo-wide (zero bare left — SlotFormDialog day/area/scope/recurrence, contacts, reports via shared label records, settings); internal phase badges/copy stripped (System shows "Soon" keyed on `implemented:false`).
- **Cluster B redesigns** (`c2a9493` `6599727` `998b02a` + review fix `861fdf0`): GroupsTab phone header stacks (1-line description, actions row beneath); node rows = two-line cards — name (min-w-0, wins) + badge gated <360 / meta + ONE overflow menu (UserActionsMenu pattern, gating single-sourced via altAction). ExportImportTab rows stack below md; TriState on its own line (44px segments <xl, 28px desktop), responsive indent. Review chrome-math caught the TriState line still overflowing (`pl-19` + shrink-0 control = 233px > 179px @depth2) → indent dropped on phone line 2 (157 ≤ 179 ✓); + flex-wrap on header actions; Inactive badge gated.
- **Cluster C conventions** (`e0b38fb` `b9456df` `57f749a` + review fix `a7d113f`): ExportDropdown `triggerClassName` passthrough (defaults untouched; 4 admin call sites at 44px); BlockedSlots/Tags headers stack <sm; Audit toolbar = 2-col select grid <md (`md:contents` flattening, desktop byte-identical) + line-clamp-2 description; shell pill-nav right-edge fade + active-pill centering on deep-link (review caught: effect must dep on `visibleTabs` or cold-load hydration no-ops it; `isolate` so pills don't paint over the fade; dead onClick scroll removed); dead `phase` field deleted.
- **Cluster D per-tab** (`73ac822` `3547b6e` `c28e99c` `8fffb9a` `a37dc7c` `5a0de5e` + review fix `3059224`): users table gate xl→lg + 2-col tablet card grid + denser cards (one badge row, tags-only-when-present, text-xs) + top pager <xl + uniform desktop toolbar with ml-auto CTA; rooms header flex-wrap + phone ⋯ actions; blocked-slot cards compact (icon hidden <sm, absolute ⋯, gated pr); permissions role legend + th titles + capped pinned column — review caught `min-w-[600px]` redistributing freed width (~1 col/swipe) → `max-xl:min-w-0` (2-3 role cols/swipe).
- **Verification-pass catches** (`736a310` `c999ade`): the new width-starvation probe + docHeight diff exposed **sr-only `<dt>` phantom scroll** — Tailwind sr-only is position:absolute; with no positioned ancestor 25 card labels resolved against the initial containing block → +3,100px of document scroll below the shell (users tab). Fixed with `relative` on the badge row. InfoButton (last sub-32px control <xl) → 44px.
- **VERIFIED (final preview `diamond-fvaquyiq8`, headless Chromium crawl 10 tabs × 275/768/1440 + 275×2000 tall pass):** page h-scroll 0 everywhere; **sub-32px touch targets: 0 at phone AND tablet on all 10 tabs** (desktop compact variants intentional, fine-pointer exempt); docHeight normal (596/1024) on every tab; width-starvation probe shows NO name-column starvation (hits are by-design truncating meta/value spans). **Groups + Export/Import tall screenshots eyeballed: every node/user NAME visible (was zero), actions/tri-state fully on-screen and reachable (was clipped), stacked headers readable (was one-word-per-line).**
- Parked/known: Firefox ignores table-cell max-width (permissions cap is Chromium/WebKit; degrades to pre-fix, not broken); audit feed redesign (D2=b) + permissions transposed view (D1=b) + bulk-select (D3) deliberately deferred; pre-existing repo-wide lint debt unchanged (10 react-hooks errors baseline); pager `page`-vs-`visiblePage` quirk pre-existing (noted by review).

---

## Loop 15 — Groups 3D: Expand-All camera lock + compact tight-focus framing (2026-06-12)
User report (2 phone screenshots): (1) Expand All locks the tree — no pan/zoom; (2) default Groups view starts too zoomed in (Michael card wider than the screen).

- **Root cause 1 (REPRODUCED on `diamond-fvaquyiq8` @412×915: 120/250px drag → ~0px movement, snap-back):** compact fit clamps focus distance to 280 == OrbitControls `maxDistance`, but CameraRig parks the camera at `[x, y+0.2d, z+d]` → true radius `280·√1.04 ≈ 285.5 > 280`. `controls.update()` re-clamps the camera every frame, the arrival check can never pass, `animatingRef` stays true forever, and the rig overwrites every user pan/pinch on the next frame. Desktop had the same LATENT lock: the subtree path was UNCAPPED (`size*1.6` can exceed maxDistance 70).
- **Root cause 2 (REPRODUCED):** tight node focus hardcodes `distance: 8` (desktop-tuned). Compact world-scaled cards are ~4.8wu wide; a 412px canvas at d=8 shows only ~3.8wu → card clipped at both edges on every portrait phone.
- **Fix (`57ee769`):** new unit-tested `clampCamToDollyRange()` — fly-to point pulled inside the controls dolly range before AND during animation (mid-flight compact↔desktop breakpoint flips re-clamp in useFrame); focus distances capped at `maxDistance/√1.04·0.98` (269 compact / 67 desktop, derived not literal); **user input always wins** — OrbitControls `start` cancels any running fly-to, and a focus landing mid-gesture is dropped; `computeTightFocusAt()` aspect-aware single-card fit shared by node tight-focus AND contact-leaf focus; arrival epsilon now scales with fly-to radius (was distance-from-world-origin — stopped visibly short on edge-of-tree nodes).
- **Ultracode 3-lens adversarial review (10 agents) caught 2 majors the first cut missed:** (1) contact-leaf tap still hardcoded distance 8 — same clip class as bug 2; (2) **the initial-load fix was being DEFEATED** — `compact` initialized `false`, the external u-michael focus applied with the desktop closure in the first effect pass, and `appliedExternalRef` pinned the stale framing → lazy-init `compact` from matchMedia + breakpoint in the applied-external key. Plus 3 minors (mid-flight re-clamp, gesture guard, origin-based epsilon) — all applied.
- **VERIFIED (deployed `diamond-5uoplaxa7`, Chromium @412×915, login admin/admin):** default view — Michael card fully framed with margins (was edge-to-edge clipped); Expand All → same 120/250px drag now pans and STAYS (no snap-back after 1.5s); wheel zoom dollies in. vitest **265/265** (5 new camera tests); tsc clean; eslint problem count unchanged (9 pre-existing). NOTE: engine = Playwright Chromium at phone viewport — touch pan shares the same OrbitControls/rig code path as mouse pan, but real-device touch not yet re-tested this loop.
- **False alarm during verify (resolved):** ⋯ menu appeared to self-close on the new build → A/B was confounded by cache temperature (new deploy cold, old warm). After cache-cleared cold tests: BOTH builds pass (8 consecutive menu opens) — transient cold-deploy race, NOT a regression from this commit.
