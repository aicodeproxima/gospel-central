# Diamond — Mobile Real-Device Audit Progress

**Durable ledger** (source of truth across context compaction / Claude Code restarts). Plan:
`C:\Users\aicod\.claude\plans\how-does-this-emulator-elegant-lark.md`.

- **Branch:** `feat/mobile-realdevice` off `main` @ `ff2ec0d`. HEAD: `86c56e9` (Phase 1 data fix).
- **Verification loop (CHANGED 2026-06-02):** Chrome **DevTools MCP Device Mode** against the deployed
  Vercel preview. The Android emulator was ABANDONED — even tuned (1080×2340@420, 8 cores, -gpu host) it
  was too slow/ANR-crashy for Diamond's continuous-render R3F/Three.js page on the Intel Iris Xe iGPU
  (GL ES *translator* path). New loop is desktop-speed + autonomous:
  - `emulate` viewport `412x915x3.5,mobile,touch` + mobile UA → exact S24 Ultra CSS viewport (DPR 3.5).
  - `navigate_page` to preview URL **with cookie bypass** `?x-vercel-protection-bypass=<secret>&x-vercel-set-bypass-cookie=true`.
  - Inspect via `evaluate_script` / `take_snapshot` / `list_network_requests` / `list_console_messages`;
    prove with `take_screenshot`.
  - **REAL S24 ULTRA still required** for final sign-off + the things desktop can't fake: Android URL-bar
    `dvh` physics and the WebGL Tree3D page on a real GPU. (Back-pocket: tune-emulator, cloud farm.)
- **Screenshots:** chrome-devtools `take_screenshot` CANNOT write into the diamond-live repo (workspace-root
  restriction). Save to an allowed root or rely on inline + the network-200 log as durable evidence.
- **Status legend:** VERIFIED (screenshot/probe cited) · EXPECTED (untested) · TODO

## CRITICAL GOTCHA — Vercel SSO blocks the service worker (cost ~30 min)
The bypass **header** (`x-vercel-protection-bypass` via CDP extraHttpHeaders) bypasses SSO for *page*
requests but NOT for the **service-worker script fetch** (`/mockServiceWorker.js`) — that runs in a
separate context and 401s → MSW `worker.start()` rejects → app hangs forever on "Loading…".
**FIX: use the COOKIE bypass** (`x-vercel-set-bypass-cookie=true` in the URL). Once the cookie is set,
same-origin SW fetches carry it → 200 → MSW registers. Always use the cookie form for MSW+SSO previews.

## Re-anchor ritual (run on every resume / after restart / after compaction)
1. Re-read the **Locked contract** in the plan. 2. Read this ledger. 3. `git log --oneline -10` +
`git status`. 4. Confirm branch + that the DevTools MCP browser is reachable (`list_pages`) before any edit.

## Locked contract (frozen — STOP & reconfirm if any would change)
Calendar: agenda `<md`, grid `≥md`, legend tap-to-open · Branch: `feat/mobile-realdevice` ·
Audit: every screen · Data: mock default-ON + API base `/api`, never localhost · Truth: deployed URL via
DevTools Device Mode then real phone (never localhost dev server, never "code looks right") · Mobile 412×915
+ dvh; desktop ≥xl visually unchanged · No backend wiring / no architecture changes / keep "Built by AccessorySeezin".

---

## Phase log

### Phase 0 — Branch + verification loop — DONE
- VERIFIED: branch `feat/mobile-realdevice` created off `ff2ec0d`.
- Verification loop pivoted from emulator → DevTools MCP Device Mode (see above). Emulator abandoned.

### Phase 1 — Data blocker (MSW) — ✅ VERIFIED (2026-06-02)
- **VERIFIED on 412×915/DPR3.5 mobile viewport** against deployed preview (cookie bypass):
  - Login form renders; `admin`/`admin` → redirect `/dashboard`; `swController: true` (MSW active).
  - Dashboard populated with real data: Upcoming Bookings **20**, Active Contacts **46** (12 progressing),
    Sessions This Month **104**, Baptisms **4**. Bottom nav Home/Calendar/Contacts/Groups/Settings.
  - Network proof (all MSW-served): `POST /api/login 200`, `GET /api/bookings 200`, `GET /api/contacts 200`,
    `GET /api/areas 200`. Zero "Failed to fetch".
- Build: `npm run build` clean (Next 16.2.3, all 9 routes). Commit `86c56e9`.
- Files edited:
  - `MSWProvider.tsx` — mock default-ON (gate flipped to `=== 'false'` opt-out); after `worker.start()`
    wait for `navigator.serviceWorker.controller`, else reload once (sessionStorage `msw-reloaded-once`).
  - `client.ts:1` — API base default `http://localhost:8080/api` → relative `/api`.
  - `handlers.ts:15` — same `/api` default (must match client).
- Login creds (mock): `admin`/`admin` (u-michael, role DEV). Other users: stephen, overseer1, branch1-4.

### Phase 2 — Calendar mobile — ✅ VERIFIED (2026-06-02, DevTools Device Mode + desktop regression)
Commits `7ddbfcd` (feature) + `cda8b3b` (fixes). Deployed `diamond-aoidrii01-…vercel.app`.
- New `src/components/calendar/AgendaView.tsx`: day-grouped booking list (time · room name · type color ·
  title), **range-scoped** to the active day/week/month (mock `/api/bookings` ignores start/end → must
  filter client-side, same as the grid does via isSameDay; else "Day" showed every date).
- `calendar/page.tsx`: agenda for day/week on mobile, MonthView for month; grid intact ≥md. Compact mobile
  topbar (Today/nav/`mobileDateLabel`/Book); area selector + view tabs moved into page body; legend →
  `<details>` on mobile, inline row ≥md.
- `(dashboard)/layout.tsx`: shell `h-[100dvh] overflow-hidden`; **mobile col `min-w-0`** (it was a flex item
  with min-width:auto → expanded to 715px content-min-width → Book pushed off-screen; min-w-0 constrains it
  to 412); mobile content `overflow-y-auto overflow-x-hidden`.
- VERIFIED 412×915 (probe+screenshot): agenda renders (grid `display:none`), scoped to selected day, legend
  collapsed, area+tabs in body, Book on-screen, `horizPan:false`, titles truncate w/ ellipsis, room names
  shown. VERIFIED 1280 (screenshot): sidebar + full toolbar + full 7-pill legend + room-column grid all
  unchanged. Build clean both commits.

### Phase 3 — Groups/Tree3D — ✅ VERIFIED (2026-06-02, DevTools Device Mode; real-GPU/touch sign-off pending on phone)
Commits `27947c8` (camera) + `7061abe` (toolbar/inset). Deployed `diamond-3bjsxmap5-…vercel.app`.
- `Tree3D.tsx`: framing uses the REAL canvas aspect (`useThree().size`), not `window.inner*`;
  `computeSubtreeFocus` is now aspect-aware (fits WIDTH on portrait); **snap-to-fit fixed** via a ref guard on
  the external-focus effect — expanding a node recomputes `layout`, which used to re-fire the effect and yank
  the camera back to the initial Michael snap. Guard fires only on an actual id/mode change.
- `groups/page.tsx`: mobile toolbar compacted (title hidden, icon-only buttons <md; **227px→141px**); 3D canvas
  inset `pt-[10rem]` + bottom-nav clearance below md (`md:!p-0` keeps desktop full-bleed).
  GOTCHA: the ResizeObserver ref-measure FAILED — the dashboard double-renders `{children}`, so the shared
  ref bound to the hidden desktop copy (offsetHeight 0). Used a fixed inset instead.
- `(dashboard)/layout.tsx` immersive: `h-[100dvh]`.
- VERIFIED 412×915 (screenshot+probe): Michael's full avatar+platform+card render below the compact toolbar
  (no occlusion); tap-to-expand snaps to fit parent+child (Michael→David Park) in the band between toolbar and
  nav. VERIFIED 1280 (screenshot): full toolbar (labels back) + full-bleed canvas + original framing unchanged.
- DEFERRED → Phase 5 / real phone: scale the fixed 220px node cards for DENSE subtrees (a node with many
  side-by-side children) on mobile; confirm WebGL perf + pinch-zoom on the real S24 Ultra.

### Phase 4 — Rooms & Areas header — TODO
`RoomsTab.tsx` (path TBC — grep before edit). Header `flex items-center justify-between` crushes title.

### Phase 5 — Full mobile sweep — ✅ VERIFIED (2026-06-02, DevTools Device Mode 412×915)
Commit `00f9ebd`. Swept EVERY screen; each passes: data loads · no horizontal pan · no clipped content
(probe: `scrollWidth == vw` AND zero visible elements wider than vw outside an x-scroller) · responsive.
- **Login ✅ · Dashboard ✅ · Calendar ✅(P2) · Contacts ✅ · Groups ✅(P3) · Reports ✅ · Settings ✅**
- Fixes this phase (Contacts + Reports): headers stack on mobile (`flex-col sm:flex-row`) instead of crushing
  the title beside action buttons; filter bars stack full-width (`w-full sm:w-[Npx]`); Reports audit table
  wrapper `overflow-hidden`→`overflow-x-auto` (5-col table scrolls instead of clipping under overflow-x-hidden).
- **Phase 4 (Rooms & Areas) = N/A**: no `RoomsTab`/admin-tabs exist in this tree (unmerged round-2 work). The
  header-crush CLASS it described WAS real on Contacts/Reports and is fixed here.
- Dialogs already safe (`max-w-[calc(100%-2rem)]` base — `sm:max-w-xl` only ≥640px). Dashboard/Settings grids
  use `sm:` breakpoints → 1-col on mobile. The Contacts kanban + Reports table use `overflow-x-auto` (scroll, not clip).
- DEFERRED (cosmetic / real-phone only): Tree3D 220px card scaling for very dense subtrees; Reports table
  card-redesign (it scrolls now, acceptable).

### Final — build COMPLETE on branch; MAIN-SYNC DEFERRED (user decision pending) — 2026-06-02
- Build clean every phase (`next build` + TS, no errors). Full mobile build done on `feat/mobile-realdevice`
  (pushed to GitHub, HEAD `f5036bd`). Final preview: `https://diamond-jg4n0ga5x-aicodeproximas-projects.vercel.app`
  (login admin/admin; phone = cookie-bypass URL). Tree3D dense-card polish: `w-[168px] sm:w-[220px]` (VERIFIED 168 on mobile).
- ⛔ NOT merged to main. ⛔ Bypass secret `diamondMobileAudit2026realdevXYZ` NOT revoked. Both pending the decision below.

## ⚠️ OPEN DECISION — this branch's base is 63 commits behind real main (RE-RAISE AT SESSION END)
Built on stale `ff2ec0d`. Real `origin/main` (`ccc65ca`) has an admin system, permissions, security fixes,
prior mobile work, and a real-backend cutover in progress (MIKE_HANDOFF / BACKEND_GAPS). Overlap vs current main:
- Calendar mobile agenda: ABSENT on main → P2 still needed.
- Tree3D camera: main STILL uses `window.innerHeight` (the bug) → P3 still needed.
- `min-w-0` mobile col: ALREADY on main → my version redundant.
- MSW mock-default-ON + `/api` base (P1): main still `=== 'true'` + `localhost:8080`, BUT main is moving to a
  REAL backend → my mock-default change is likely the WRONG direction for main; re-decide on sync.
USER CHOSE (2026-06-02): "fully build out before we sync; remind me at the end." → DO NOT merge until the user
picks an integration path (re-port the needed fixes onto current main / full rebase / etc.). Reusable artifacts:
`src/components/calendar/AgendaView.tsx` + the Tree3D canvas-aspect/snap-guard/canvas-inset approach.
- Also deferred: Reports audit table → mobile card layout (currently scrolls via overflow-x-auto, acceptable).

## Gate note (correction)
- This repo has **NO test script** (`package.json` scripts = dev/build/start/lint only). The gate is
  `npm run build` (+ `lint`) + DevTools-Device-Mode verification — do NOT claim a passing test count.
- `npm ci` fails (lockfile out of sync: missing `@esbuild/*@0.25.12`); use `npm install`.
- Use PowerShell (not Git Bash) for npm — Git Bash mangles args on this machine.

## Out-of-scope items noticed (for user, do NOT act)
- **Dashboard layout renders `{children}` twice** — `(dashboard)/layout.tsx` renders the page in BOTH the
  desktop-main branch and the mobile branch (one is `display:none` per breakpoint), so every page exists 2× in
  the DOM. Pre-existing, works correctly, but doubles DOM nodes for heavy pages (calendar ≈28 bookings ×2).
  Potential perf refactor: render children once and toggle chrome via CSS. NOT touched (would risk desktop).
