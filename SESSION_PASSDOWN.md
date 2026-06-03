# Diamond Mobile — Session Passdown (cold-start for the next session)

> Companion to `MOBILE_AUDIT_PROGRESS.md` (the durable ledger). Read BOTH first. This file is the
> action-oriented "how to pick up + how to keep testing Groups". Last session ended with context nearly full.

---

## 0. FIRST 60 SECONDS (re-anchor ritual — do this before ANY edit)
```
cd C:\Users\aicod\Projects\_src\diamond-live      # the ONLY correct repo. NOT C:\Users\aicod\Diamond (a stale clone an agent wandered into)
git fetch --all --prune
git branch --show-current      # expect: feat/mobile-opt-main
git rev-parse --short HEAD     # expect: a044487 (or later)
git log --oneline -8
git status --short             # expect clean
```
Then re-read: this file → `MOBILE_AUDIT_PROGRESS.md` → the plan `C:\Users\aicod\.claude\plans\how-does-this-emulator-elegant-lark.md`.
Confirm the chrome-devtools MCP browser is reachable (`mcp__chrome-devtools__list_pages`); reload its tools via ToolSearch if deferred.

**Anti-hallucination rules (carried over, still in force):** Re-Read the real file region before every edit (agent
line numbers are LEADS, not facts). Grep any helper/constant before reusing it. Label every status **VERIFIED**
(cite a screenshot or a DOM measurement) or **EXPECTED** (untested) — never blur them. "Fixed" requires observed
browser behavior, never a clean diff. Paste real numbers. If memory disagrees with git/screenshots, trust the evidence.

---

## 1. PROJECT STATE
- **Goal:** make current-`origin/main` Diamond genuinely smooth/space-efficient/correct on mobile (priority device =
  Galaxy S24 Ultra, **412×915, DPR 3.5**). Desktop (≥`xl`/1280) MUST stay visually unchanged.
- **Working branch:** `feat/mobile-opt-main` (off `origin/main` `ccc65ca`). **Pushed.** Do NOT push to `main` or merge
  to `main` (deliberate integration is the user's call).
- **Branch landscape (important):**
  - `feat/mobile-opt-main` (OURS) = current main + a merge of the parallel branch + our Groups 3D rework. This is the
    superset to ship.
  - `origin/feat/mobile-optimization` (PARALLEL, same `ccc65ca` base) = a comprehensive mobile adaptation done in
    parallel (xl-breakpoint, viewport export, globals base, all admin/contacts/settings/calendar adapted). We MERGED
    it into ours (favoring theirs on overlap) + kept our unique fixes (OrgNode list indent, agenda day-scoping,
    list/metrics/pipeline toolbar-clearance) + the Groups 3D rework.
  - `feat/mobile-realdevice` (`9aca3cd`) = STALE (built on `ff2ec0d`, 63 commits behind). Reference only. Ignore.
- **Done + VERIFIED earlier this project:** Calendar mobile agenda (day-scoped), global shell `h-[100dvh]` +
  `overflow-x-hidden`, root `<Suspense>` (Next 16 useSearchParams prerender fix), dashboard/admin/contacts/reports/
  settings already mobile-clean. See `MOBILE_AUDIT_PROGRESS.md` Loops 0–6.
- **Done + VERIFIED last session:** the **Groups 3D scaling rework** (§3). Commits `4f806be`,`0770b6b`,`56ad4aa`,
  `70faea8` + ledger commits. Final preview `lb7c7qmmx`.
- **Pending (user decisions / final):** which branch integrates to main (deliberate); real S24-Ultra sign-off;
  **revoke the bypass secret** at the very end.

---

## 2. THE VERIFICATION LOOP (how we test — repeat it every time)
We do NOT use the Android emulator (too slow for the R3F page on the iGPU). We use **Chrome DevTools MCP Device Mode**
against a **deployed Vercel preview** with mock data.

**Build (gate):** PowerShell only (Git Bash mangles args). `npm run build`. (`npm ci` fails — lockfile; use `npm install`.)
Expect LF→CRLF warnings (harmless). cwd resets after each PowerShell call → `Set-Location` each time.

**Deploy a mock preview:**
```
Set-Location "C:\Users\aicod\Projects\_src\diamond-live"
vercel deploy --build-env NEXT_PUBLIC_MOCK_API=true --yes 2>&1 | Select-String "Preview:"
```
(Vercel deploys the WORKING TREE, not a git commit. `--build-env NEXT_PUBLIC_MOCK_API=true` turns MSW mocks on so
data loads. Main is moving toward a real backend — DO NOT flip the mock default in code; only use this build-env.)

**Open + log in (DevTools MCP):**
```
emulate  viewport="412x915x3.5,mobile,touch"  userAgent="Mozilla/5.0 (Linux; Android 14; SM-S928B) ... Chrome/126 Mobile Safari/537.36"
navigate https://diamond-<id>-aicodeproximas-projects.vercel.app/?x-vercel-protection-bypass=diamondMobileAudit2026realdevXYZ&x-vercel-set-bypass-cookie=true
   # COOKIE bypass is REQUIRED (header bypass does NOT cover the MSW service-worker script → app hangs on "Loading…")
# wait ~5s → take_snapshot → fill username uid="admin", password uid="admin" → click "Sign In"
```
Login: **admin / admin** (mock). Other mock users: stephen, overseer1, branch1–5. Org tree: Michael(dev)→Gabriel
(overseer)→Joseph/Zechariah/John the Baptist/Simeon/Simon Peter (5 branch leaders) → group leaders → team leaders →
members → contacts. **Gabriel's 5-branch row is the canonical "wide branch" test case.**

**Re-login each new preview origin** (localStorage/cookies are per-origin). Groups view mode persists in
`localStorage['diamond-tree-view']` ('3d'|'list') — set via `evaluate_script` + reload to force a view.

**Bypass secret** `diamondMobileAudit2026realdevXYZ` (Vercel project `diamond`, team `aicodeproximas-projects`,
teamId `team_vILmEnHlW1iEzWxhM3UJhzim`). Still ACTIVE. REVOKE at final sign-off:
`PATCH https://api.vercel.com/v1/projects/diamond/protection-bypass?teamId=…` body `{"revoke":{"secret":"diamondMobileAudit2026realdevXYZ","regenerate":false}}` (read the Vercel token + make the call in ONE PowerShell invocation — env vars don't persist between tool calls).

---

## 3. THE GROUPS 3D REWORK (what's in place now — internals)
Files: `src/components/groups/Tree3D.tsx` (the scene), `src/lib/utils/tree-layout.ts` (layout), `src/app/(dashboard)/groups/page.tsx` (toolbar+pipeline), `src/components/groups/OrgNode.tsx` (list view).

**Root cause that was fixed:** node/contact cards are drei `<Html>`. They were screen-space (fixed px, NO
`distanceFactor`) while avatars (`AvatarFigure` plane) + platforms (`Platform` box) are world-space → on zoom-out the
avatars shrank but cards didn't → overlap + cut-off. Fix = make cards world-scaled too.

**Key mechanics now (all gated on `compact` = `matchMedia('(max-width:1279px)')`; desktop unchanged):**
- Both `<Html>` cards get `distanceFactor={cardDistanceFactor}` (compact) / `undefined` (desktop).
- **drei non-transform truth (from `node_modules/@react-three/drei/web/Html.js` L274):**
  `scale = distanceFactor===undefined ? 1 : objectScale(group,camera)*distanceFactor`. Consequence:
  **`cardWorldWidth = CARD_BASE_PX(156) * distanceFactor / canvasHeightCSS`.** It depends on canvas px-height, so a
  STATIC factor overlaps on small screens. Therefore `cardDistanceFactor` is computed PER-VIEWPORT in `SceneContent`:
  `cardDistanceFactor = compact && canvasSize.height>0 ? (CARD_WORLD_WIDTH * canvasSize.height)/CARD_BASE_PX : undefined`
  → holds `cardWorldWidth ≈ CARD_WORLD_WIDTH (4.8)` at every viewport/DPR. **Invariant: 4.8 < `HORIZONTAL_GAP`(7) ⇒
  siblings (≤3/row via `MAX_COLS_PER_ROW`) can never horizontally overlap, at any zoom.**
- Constants (top of file near `CAMERA_CONFIG`): `CARD_BASE_PX=156`, `CARD_WORLD_WIDTH=4.8`, `AVATAR_WORLD_TOP=2.1`,
  `CARD_WORLD_DROP=4.0`. fov=55. `data-tree-card` is on both card root elements (USE THIS to measure).
- **Framing** (`computeSubtreeFocus` + `computeFullTreeFocus`, compact branches): padded bounding-box fit —
  `boxW=(maxX-minX)+CARD_WORLD_WIDTH`, `boxH=(maxY-minY)+padTop(AVATAR_WORLD_TOP+1.5)+padBottom(CARD_WORLD_DROP)`,
  `fit=max(boxH/2/tan, boxW/2/(tan*aspect))`, `distance=min(120, max(fit*1.12, 7))` (the **1.12× is the edge-cut-off
  safety margin**), `aspect` from real `canvasSize`. The old screen-space "cap" was DELETED. OrbitControls
  `maxDistance` = compact 120 / desktop 70.
- `frameloop="demand"` + `CameraRig` calls `invalidate()` every animation frame (Tree3D ~L425) → distanceFactor
  rescales during camera lerps (no freeze — verified).
- Toolbar (`groups/page.tsx`): mobile = icon-only (labels `hidden xl:inline`) + wrap (not horizontal-scroll) so
  Collapse/Reset/Expand are always reachable.

**VERIFIED last session (DOM-measured `data-tree-card` rects, screenshots):** expand Gabriel(5 branches): 412 → 0
overlaps, 0 off-edge, cards 82–95px; 360 → 92–107px; 320 → 45–53px (small but all-visible). Cards scale with zoom
(106px fit-subtree ↔ 28px fit-all). Collapse reachable+works. Expand-all = clean tidy tree (51 on-screen vs old
1/178-off). Desktop 1440 unchanged (cards fixed 220px, labelled toolbar).

---

## 4. HOW TO FURTHER TEST GROUPS — and where the unmentioned issues probably are
**The user says there are still Groups issues not yet raised. My DOM-rect checks passed, but rect math ≠ visual/UX
correctness.** Next session: (a) ASK the user to enumerate the specific issues, AND (b) do an EXHAUSTIVE visual +
real-interaction sweep — screenshot EVERY step, use REAL taps (the `click` tool on snapshot uids), not just
programmatic `.click()`/`evaluate`. Log every action + a screenshot + the assertion.

### NOT verified last session (most likely to hide the unmentioned issues — TEST THESE FIRST)
1. **Contacts under a node (HIGH SUSPICION).** A node that owns many contacts stacks them vertically at
   `CONTACT_GAP=3.5` world units. Contact cards are NOW world-scaled too (`CARD_WORLD_DROP≈4.0` tall) → **3.5 spacing <
   ~4.0 card height ⇒ stacked contact cards likely OVERLAP vertically.** The user's ORIGINAL screenshot showed a
   contact card overlapping member cards. **Expand a member/team-leader with several contacts and measure
   `data-tree-card` vertical overlap.** If they overlap, fix by raising `CONTACT_GAP` (in `tree-layout.ts`) for
   compact, or shrinking contact cards, or scaling contact spacing to the card world-height.
2. **Metrics-icon filters.** Each node card has 3 metric icons (GraduationCap=studying, BookOpen=total,
   Sparkles=fruit). Tapping one expands the node AND shows that filter's contacts as leaves — potentially MANY → same
   vertical-overlap risk as #1, plus a layout change mid-view. Test tapping each on a high-count node.
3. **Real tap-to-expand** (I used programmatic clicks). Use the DevTools `click` tool on a card's snapshot uid →
   confirm it expands + the camera snaps to fit (same as measured).
4. **Search** (TreeSearchBar): type a deep name, select a result → it should expand ancestors + frame the target
   (external-focus → `computeSubtreeFocus`). Verify framing + no overlap + the right node centered.
5. **Jump-to** (JumpToTreePicker / Crosshair button): select a team → expands ancestors, tight-focus on the node.
6. **List view** (toggle List): OrgNode indent fix (ml-4 sm:ml-10) — confirm readable names, no truncation, the
   `pt-40` toolbar clearance (content not under the floating toolbar). Also Teacher Metrics + Student Pipeline tabs
   (their TabsContent got `pt-40 sm:pt-24` — confirm not under toolbar + tables/cards readable).
7. **Pan** (drag) + **pinch-zoom** via real gestures (synthetic WheelEvent does NOT drive OrbitControls — confirmed
   useless; use the DevTools `click`/drag or real touch emulation if available). Confirm cards stay non-overlapping
   through manual zoom and that nothing detaches.
8. **Contact detail dialog** (tap a contact leaf → ContactDetailDialog): opens, tags don't clip at the right edge,
   closes cleanly.
9. **Viewport matrix**: 320 / 360 / 390 / 412 / 430 / 480 portrait + **landscape 915×412** (note: ≥1280 wide =
   desktop layout; a true narrow landscape phone is <1280 tall-rotated — check it). Screenshot each.
10. **Themes**: switch among the ~11 animated themes (Settings → theme picker, 36 buttons; `localStorage` via
    preferences-store) and confirm the 3D tree + cards render over each bg without contrast/overlap issues.

### Known/suspected open issues I OBSERVED (candidates for the user's unmentioned list)
- **320×568 cards small (45–53px).** Physical constraint (tiny screen + 6-node subtree). All-visible, pinch to read.
  If the user wants bigger, options: a "fewer levels" focus on very short screens, or a min-distanceFactor floor
  (trade: may reintroduce edge clipping → re-verify).
- **Expand-all not vertically centered** — content fills the top ~60%, empty bottom ~40% (see the expand-all
  screenshot). `computeFullTreeFocus` compact centers on the bbox but a very tall/wide 182-node tree at the 120 clamp
  frames a band. Consider better vertical centering or a different expand-all UX.
- **Parent node behind the toolbar** — focusing a CHILD subtree (e.g. Gabriel) leaves the PARENT (Michael) above the
  frame, behind the translucent z-[45] toolbar (`offTop:1`). Probably acceptable (upward context) but the user may
  dislike it. Could add top padding to push the focus down, or fade the parent.
- **Card text legibility** — verify via screenshots that name/role/groupName/metrics are actually READABLE at the
  fit-subtree zoom on 412 (cards ~85px). My checks measured rects, not text crispness. drei non-transform Html can
  get faint sub-pixel blur when scaled.

### The measurement helper (paste into `evaluate_script` after expanding)
```js
async () => {
  const vw=innerWidth, vh=innerHeight;
  const cards=[...document.querySelectorAll('[data-tree-card]')].map(c=>{const r=c.getBoundingClientRect();
    return {name:(c.textContent||'').replace(/\s+/g,' ').trim().slice(0,14),l:Math.round(r.left),r:Math.round(r.right),
            t:Math.round(r.top),b:Math.round(r.bottom),w:Math.round(r.width),h:Math.round(r.height)};}).filter(c=>c.w>0);
  const on=cards.filter(c=>c.t<vh&&c.b>0&&c.r>0&&c.l<vw);
  let overlaps=0; for(let i=0;i<on.length;i++)for(let j=i+1;j<on.length;j++){const a=on[i],b=on[j];
    if(a.l<b.r&&b.l<a.r&&a.t<b.b&&b.t<a.b)overlaps++;}
  return {vw,vh,total:cards.length,onscreen:on.length,overlaps,
          offX:on.filter(c=>c.l<-2||c.r>vw+2).length, widths:[...new Set(on.map(c=>c.w))].sort((a,b)=>a-b), sample:on.slice(0,8)};
}
```
To expand programmatically for a quick check: find a `[data-tree-card]` whose textContent includes a name, click its
inner `button`. To CALIBRATE card world-width: `cardWorldWidth = cardRectPx / siblingCenterΔpx * HORIZONTAL_GAP(7)`
(measure two adjacent same-row siblings). Target < 7 (currently ~4.8). **Always also take a screenshot — numbers
miss visual issues.**

---

## 5. WORKFLOW CONVENTIONS (carried over)
- Commit + push without asking; commit per coherent step; end commit msgs with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Update `MOBILE_AUDIT_PROGRESS.md` after each loop (files changed · VERIFIED + screenshot/measurement · pending · commit).
- Never run a local dev server — test on the deployed preview. Browser UX is the source of truth.
- Keep "Built by AccessorySeezin". No backend wiring. Scope = mobile UX only.
- A keep-awake guard (PowerShell `SetThreadExecutionState` loop) may be running in the background to stop the
  screensaver — the user asked for it "until I say stop." Re-start it if needed; stop it when the user says stop.
- Reusable memory: `~/.claude/.../memory/reference_devtools_mobile_emulation_loop.md` (the Device-Mode + cookie-bypass technique).

## 6. LATEST POINTERS
- HEAD: `a044487` on `feat/mobile-opt-main`. Latest mock preview: `https://diamond-lb7c7qmmx-aicodeproximas-projects.vercel.app`
  (re-deploy a fresh one each session; old previews keep working with the cookie bypass).
- Plan file: `C:\Users\aicod\.claude\plans\how-does-this-emulator-elegant-lark.md` (Groups-scaling plan + anti-drift measures).
- If something looks wrong, RE-READ the live file region before editing; the agents that explored earlier occasionally
  drifted (wrong clone path `C:\Users\aicod\Diamond`, slightly-off line numbers).
