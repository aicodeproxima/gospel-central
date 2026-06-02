# Diamond — Mobile Real-Device Audit Progress

**Durable ledger** (source of truth across context compaction / Claude Code restarts). Plan:
`C:\Users\aicod\.claude\plans\how-does-this-emulator-elegant-lark.md`.

- **Branch:** `feat/mobile-realdevice` off `main` @ `ff2ec0d`
- **Verification:** S24Ultra emulator `emulator-5554` (real `com.android.chrome`, 1440×3120 @ 560dpi
  = 412×915 CSS / DPR 3.5). Loop: `adb shell am start -a android.intent.action.VIEW -d <url>
  com.android.chrome` + `adb exec-out screencap`. mobile-mcp `mobile_*` after pending CC restart.
- **Screenshots:** `.mobile-audit/<phase>/<screen>-<before|after>-<viewport>.png`
- **Status legend:** VERIFIED (screenshot/probe cited) · EXPECTED (untested) · TODO

## Re-anchor ritual (run on every resume / after restart / after compaction)
1. Re-read the **Locked contract** in the plan. 2. Read this ledger. 3. `git log --oneline -10` +
`git status`. 4. Confirm emulator (`adb devices`) + branch before any edit.

## Locked contract (frozen — STOP & reconfirm if any would change)
Calendar: agenda `<md`, grid `≥md`, legend tap-to-open · Branch: `feat/mobile-realdevice` ·
Audit: every screen · Data: mock default-ON + API base `/api`, never localhost · Truth: deployed URL on
emulator then real phone (never localhost dev server, never "code looks right") · Mobile 412×915 + dvh;
desktop ≥xl visually unchanged · No backend wiring / no architecture changes / keep "Built by AccessorySeezin".

---

## Phase log

### Phase 0 — Branch + verification loop — IN PROGRESS
- VERIFIED: branch `feat/mobile-realdevice` created off `ff2ec0d`.
- VERIFIED: emulator `emulator-5554` online (reconnected after adb daemon restart; emulator PID 29772 alive).
- This ledger + `.mobile-audit/` created.

### Phase 1 — Data blocker (MSW) — TODO
Files: `src/components/shared/MSWProvider.tsx`, `src/lib/api/client.ts`, `src/mocks/handlers.ts`.

### Phase 2 — Calendar mobile — TODO
New `src/components/calendar/AgendaView.tsx`; `src/app/(dashboard)/calendar/page.tsx`; layout dvh.

### Phase 3 — Groups/Tree3D — TODO
`src/app/(dashboard)/groups/page.tsx`, `src/components/groups/Tree3D.tsx`, `src/components/layout/MobileNav.tsx`.

### Phase 4 — Rooms & Areas header — TODO
`RoomsTab.tsx` (path TBC — grep before edit).

### Phase 5 — Full mobile sweep + report — TODO

### Final — build/test gate + deploy + device sign-off — TODO

## Out-of-scope items noticed (for user, do NOT act)
- (none yet)
