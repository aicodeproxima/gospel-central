# Diamond — Mobile Optimization Audit (current `main`)

**Objective:** make current `origin/main` Diamond genuinely smooth, reliable, space-efficient, and visually
correct on mobile. Autonomous loop: plan → implement → verify-in-browser → audit → repeat until the success
criteria are met or truly blocked (creds/permissions/irreversible).

## Source of truth & state
- **Branch:** `feat/mobile-optimization` off `origin/main` `ccc65ca`. ⚠️ NOT the stale `feat/mobile-realdevice`
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
ledger created. NEXT: baseline-verify priority screens on device mode @412×915 → concrete defect list → fix.
