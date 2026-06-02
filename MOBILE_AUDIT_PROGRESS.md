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

### Phase 2 — Calendar mobile — IN PROGRESS
New `src/components/calendar/AgendaView.tsx`; `src/app/(dashboard)/calendar/page.tsx`; layout dvh.
Reuse (grep-confirm before use): `useBookingStore`, `bookingsApi`, `BOOKING_TYPE_CONFIG`, `tBookingType`,
date utils (`formatHour12`/`formatTimeRange`). NO `useRooms` hook — confirm room-name source in page.tsx.

### Phase 3 — Groups/Tree3D — TODO
`src/app/(dashboard)/groups/page.tsx`, `src/components/groups/Tree3D.tsx`, `src/components/layout/MobileNav.tsx`.
Headline bug: `Tree3D.tsx:629` aspect uses `window.innerHeight` → blank tree. Snap: `computeSubtreeFocus:569`
ignores aspect; focus effect deps include `layout` → re-fires. NOTE: Tree3D WebGL is the ONE screen desktop
emulation can't fully validate — sanity-check layout in DevTools, but real-phone confirm before "done".

### Phase 4 — Rooms & Areas header — TODO
`RoomsTab.tsx` (path TBC — grep before edit). Header `flex items-center justify-between` crushes title.

### Phase 5 — Full mobile sweep + report — TODO

### Final — build gate + deploy + device sign-off — TODO
- REVOKE bypass secret `diamondMobileAudit2026realdevXYZ` after sign-off
  (PATCH protection-bypass, body `{"revoke":{"secret":"…","regenerate":false}}`).

## Gate note (correction)
- This repo has **NO test script** (`package.json` scripts = dev/build/start/lint only). The gate is
  `npm run build` (+ `lint`) + DevTools-Device-Mode verification — do NOT claim a passing test count.
- `npm ci` fails (lockfile out of sync: missing `@esbuild/*@0.25.12`); use `npm install`.
- Use PowerShell (not Git Bash) for npm — Git Bash mangles args on this machine.

## Out-of-scope items noticed (for user, do NOT act)
- (none yet)
